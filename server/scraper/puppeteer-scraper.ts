import puppeteer, { Browser, Page } from "puppeteer";
import * as fs from "fs";
import * as path from "path";

const COOKIES_FILE = path.join(process.cwd(), ".session-cookies.json");
const LOGIN_URL = "https://accounts.webbeds.com/oauth2/authorize?audience=https%3A%2F%2Fwww.dotwconnect.com%2F&client_id=dotw&code_challenge=qagDCErsuQH8D9_n6RGbxXgwqdf_B8Z6DJVBR52f4Dk&code_challenge_method=S256&nonce=1N%2BMvZeBL61c2FsoGLU1GZ88UTkqBnUA&redirect_uri=https%3A%2F%2Fwww.dotwconnect.com%2Fcallback&response_type=code&scope=openid+wbid&state=tu%2FWjxkJ%2F58hGGxYGUMmkWe9m8eJ41edQL1Uk6td5lY%3D";
const SEARCH_URL = "https://www.dotwconnect.com/interface/en/accommodation";

interface HotelSearchResult {
  hotelId: string;
  hotelName: string;
  price: number | null;
  available: boolean;
  webBedsHotelId?: string; // WebBeds internal hotel ID
  searchUrl?: string; // Dynamic search URL
}

interface SessionCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
}

export class PuppeteerScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;

  /**
   * Initialize the browser and load session cookies if available
   */
  async initialize(): Promise<void> {
    console.log("[Scraper] Initializing Puppeteer...");
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1280, height: 720 });

    // Load saved cookies if they exist
    if (fs.existsSync(COOKIES_FILE)) {
      console.log("[Scraper] Loading saved session cookies...");
      const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, "utf-8"));
      await this.page.setCookie(...cookies);
    }

    console.log("[Scraper] Puppeteer initialized successfully");
  }

  /**
   * Login to WebBeds with provided credentials
   */
  async login(username: string, password: string): Promise<boolean> {
    if (!this.page) throw new Error("Page not initialized");

    try {
      console.log("[Scraper] Attempting to login...");
      
      // Navigate to login page
      await this.page.goto(LOGIN_URL, { waitUntil: "networkidle2" });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if already logged in
      const currentUrl = this.page.url();
      if (currentUrl.includes("dotwconnect.com/interface")) {
        console.log("[Scraper] Already logged in (session valid)");
        return true;
      }

      // Fill in login form
      const usernameInput = await this.page.$('input[name="username"]');
      const passwordInput = await this.page.$('input[name="password"]');

      if (!usernameInput || !passwordInput) {
        console.log("[Scraper] Login form not found, checking if already logged in...");
        await this.page.goto(SEARCH_URL, { waitUntil: "networkidle2" });
        const isLoggedIn = await this.page.$('input[id="destination"]');
        return !!isLoggedIn;
      }

      await usernameInput?.type(username, { delay: 50 });
      await passwordInput?.type(password, { delay: 50 });

      // Submit form
      const submitButton = await this.page.$('button[type="submit"]');
      if (submitButton) {
        await submitButton.click();
        try {
          await this.page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });
        } catch (e) {
          console.log("[Scraper] Navigation timeout (may be already logged in)");
        }
      }

      // Wait for search page to load
      try {
        await this.page.waitForSelector('input[id="destination"]', { timeout: 15000 });
      } catch (e) {
        console.log("[Scraper] Search page selector not found");
        return false;
      }
      console.log("[Scraper] Login successful!");

      // Save cookies for future sessions
      const cookies = await this.page.cookies();
      fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
      console.log("[Scraper] Session cookies saved");

      return true;
    } catch (error) {
      console.error("[Scraper] Login failed:", error);
      return false;
    }
  }

  /**
   * Extract hotel ID from WebBeds search results
   */
  async extractHotelId(hotelName: string): Promise<string | null> {
    if (!this.page) throw new Error("Page not initialized");

    try {
      console.log(`[Scraper] Extracting hotel ID for ${hotelName}...`);

      // Get hotel ID from page URL or data attributes
      const webBedsHotelId = await this.page.evaluate((name) => {
        // Look for hotel links or elements with data-hotel-id
        const hotelLinks = document.querySelectorAll('a[href*="/hotel-details/"]');
        for (const link of Array.from(hotelLinks)) {
          const href = link.getAttribute("href");
          if (href && link.textContent?.includes(name)) {
            const match = href.match(/\/hotel-details\/(\d+)/);
            if (match) return match[1];
          }
        }

        // Try alternative selectors
        const hotelElements = document.querySelectorAll('[data-hotel-id]');
        for (const element of Array.from(hotelElements)) {
          if (element.textContent?.includes(name)) {
            return element.getAttribute("data-hotel-id");
          }
        }

        return null;
      }, hotelName);

      if (webBedsHotelId) {
        console.log(`[Scraper] Found hotel ID: ${webBedsHotelId}`);
      } else {
        console.log(`[Scraper] Could not find hotel ID for ${hotelName}`);
      }

      return webBedsHotelId;
    } catch (error) {
      console.error(`[Scraper] Error extracting hotel ID:`, error);
      return null;
    }
  }

  /**
   * Build dynamic WebBeds search URL
   */
  buildSearchUrl(
    hotelId: string,
    hotelName: string,
    checkInDate: string, // Format: YYYY-MM-DD
    checkOutDate: string, // Format: YYYY-MM-DD
    nights: number = 1
  ): string {
    // Convert YYYY-MM-DD to DD/MM/YYYY for URL
    const formatDateForUrl = (date: string) => {
      const [year, month, day] = date.split("-");
      return `${day}%2F${month}%2F${year}`;
    };

    const dateFromEncoded = formatDateForUrl(checkInDate);
    const dateToEncoded = formatDateForUrl(checkOutDate);

    return `https://www.dotwconnect.com/interface/en/accommodation/hotel-details/${hotelId}?destination=${encodeURIComponent(hotelName)}&PSearchId=${hotelId}&DateFrom=${dateFromEncoded}&dateFrom=${checkInDate}&DateTo=${dateToEncoded}&dateTo=${checkOutDate}&numberOfNights=${nights}&roomsNo=1&adultsCount%5B1%5D=2&childrenCount%5B1%5D=0`;
  }

  /**
   * Search for hotel prices on a specific date with enhanced WebBeds integration
   */
  async searchHotelPrice(
    hotelName: string,
    checkInDate: string, // Format: DD/MM/YYYY
    checkOutDate: string // Format: DD/MM/YYYY
  ): Promise<HotelSearchResult | null> {
    if (!this.page) throw new Error("Page not initialized");

    try {
      console.log(`[Scraper] Searching for ${hotelName} on ${checkInDate}...`);

      // Navigate to search page
      await this.page.goto(SEARCH_URL, { waitUntil: "networkidle2" });
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Fill in destination
      const destinationInput = await this.page.$('input[id="destination"]');
      if (!destinationInput) {
        throw new Error("Destination input not found");
      }

      await destinationInput.click();
      await destinationInput.type("Makkah", { delay: 50 });
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Select Makkah from dropdown
      const makkahOption = await this.page.evaluate(() => {
        const options = document.querySelectorAll(".tt-suggestion");
        const optionsArray = Array.from(options);
        for (const option of optionsArray) {
          if (option.textContent?.includes("Makkah")) {
            return option.textContent;
          }
        }
        return null;
      });

      if (makkahOption) {
        await this.page.click(".tt-suggestion");
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Set check-in date
      const fromDateInput = await this.page.$('input[id="fromDatepicker"]');
      if (fromDateInput) {
        await fromDateInput.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        await fromDateInput.type(checkInDate, { delay: 30 });
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Set check-out date
      const toDateInput = await this.page.$('input[id="toDatepicker"]');
      if (toDateInput) {
        await toDateInput.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        await toDateInput.type(checkOutDate, { delay: 30 });
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Click search button
      const searchButton = await this.page.$('input[id="searchButton"]');
      if (!searchButton) {
        throw new Error("Search button not found");
      }

      await searchButton.click();
      try {
        await this.page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });
      } catch (e) {
        console.log("[Scraper] Navigation timeout during search");
      }
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Extract hotel ID for future use
      const webBedsHotelId = await this.extractHotelId(hotelName);

      // Filter by hotel name
      const filterInput = await this.page.$('input[id="filterHotelByName"]');
      if (filterInput) {
        await filterInput.click();
        await filterInput.type(hotelName, { delay: 50 });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Get hotel result
      const hotelResult = await this.page.evaluate((hotelNameToFind) => {
        const hotelElements = document.querySelectorAll(".hotel-item, [data-hotel-name]");
        const elementsArray = Array.from(hotelElements);
        for (const element of elementsArray) {
          const nameElement = element.querySelector(".hotel-name, [data-hotel-name]");
          if (nameElement?.textContent?.includes(hotelNameToFind)) {
            const priceElement = element.querySelector(".price, [data-price]");
            const priceText = priceElement?.textContent?.match(/\d+/)?.[0];
            return {
              name: nameElement.textContent.trim(),
              price: priceText ? parseInt(priceText) : null,
            };
          }
        }
        return null;
      }, hotelName);

      if (!hotelResult || hotelResult.price === null) {
        console.log(`[Scraper] No price found for ${hotelName}`);
        return {
          hotelId: hotelName.toLowerCase().replace(/\s+/g, "-"),
          hotelName: hotelName,
          price: null,
          available: false,
          webBedsHotelId: webBedsHotelId || undefined,
        };
      }

      console.log(`[Scraper] Found price for ${hotelName}: ${hotelResult.price}`);

      // Build dynamic search URL if we have the WebBeds hotel ID
      let searchUrl: string | undefined;
      if (webBedsHotelId) {
        // Convert DD/MM/YYYY to YYYY-MM-DD
        const convertDateFormat = (date: string) => {
          const [day, month, year] = date.split("/");
          return `${year}-${month}-${day}`;
        };
        
        const checkInISO = convertDateFormat(checkInDate);
        const checkOutISO = convertDateFormat(checkOutDate);
        searchUrl = this.buildSearchUrl(webBedsHotelId, hotelName, checkInISO, checkOutISO, 1);
        console.log(`[Scraper] Dynamic search URL: ${searchUrl}`);
      }

      return {
        hotelId: hotelName.toLowerCase().replace(/\s+/g, "-"),
        hotelName: hotelName,
        price: hotelResult.price,
        available: true,
        webBedsHotelId: webBedsHotelId || undefined,
        searchUrl,
      };
    } catch (error) {
      console.error(`[Scraper] Error searching for ${hotelName}:`, error);
      return null;
    }
  }

  /**
   * Navigate directly to hotel details using dynamic URL
   */
  async navigateToHotelDetails(searchUrl: string): Promise<number | null> {
    if (!this.page) throw new Error("Page not initialized");

    try {
      console.log(`[Scraper] Navigating to hotel details: ${searchUrl}`);
      
      await this.page.goto(searchUrl, { waitUntil: "networkidle2" });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Extract price from hotel details page
      const price = await this.page.evaluate(() => {
        // Try multiple selectors for price
        const priceSelectors = [
          ".price-amount",
          ".total-price",
          "[data-price]",
          ".room-price",
        ];

        for (const selector of priceSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            const priceText = element.textContent?.match(/\d+/)?.[0];
            if (priceText) return parseInt(priceText);
          }
        }

        return null;
      });

      if (price) {
        console.log(`[Scraper] Extracted price from details page: ${price}`);
      } else {
        console.log(`[Scraper] Could not extract price from details page`);
      }

      return price;
    } catch (error) {
      console.error(`[Scraper] Error navigating to hotel details:`, error);
      return null;
    }
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      console.log("[Scraper] Browser closed");
    }
  }

  /**
   * Clear saved session cookies
   */
  static clearSessionCookies(): void {
    if (fs.existsSync(COOKIES_FILE)) {
      fs.unlinkSync(COOKIES_FILE);
      console.log("[Scraper] Session cookies cleared");
    }
  }
}

export default PuppeteerScraper;
