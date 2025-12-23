import cron from "node-cron";
import { PuppeteerScraper } from "./puppeteer-scraper";
import {
  getOrCreateHotel,
  savePriceHistory,
  formatDateToISO,
  decryptData,
} from "./data-processor";
import { getDb } from "../db";
import { webbedCredentials, syncLogs } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// List of hotels to track
const HOTELS_TO_TRACK = [
  { name: "VOCO", id: "voco" },
  { name: "ELAF AJYAD", id: "elaf-ajyad" },
  { name: "Four Points", id: "four-points" },
  { name: "Makkah al Aziziah", id: "makkah-al-aziziah" },
  { name: "Novotel Thakher", id: "novotel-thakher" },
  { name: "Razanah", id: "razanah" },
  { name: "Elaf Bakkah", id: "elaf-bakkah" },
  { name: "M Al Danah", id: "m-al-danah" },
  { name: "Snaff in", id: "snaff-in" },
  { name: "Tapestry Collection by Hilton", id: "tapestry-collection" },
  { name: "Wrqan Azizyah", id: "wrqan-azizyah" },
  { name: "ibis Makkah", id: "ibis-makkah" },
  { name: "Rafahyah Al Azizyah", id: "rafahyah-al-azizyah" },
  { name: "Diyar Al Khaledyah", id: "diyar-al-khaledyah" },
];

// Dates to track (16 Feb - 7 Mar 2026)
const DATES_TO_TRACK = [
  "16/02/2026",
  "17/02/2026",
  "18/02/2026",
  "19/02/2026",
  "20/02/2026",
  "21/02/2026",
  "22/02/2026",
  "23/02/2026",
  "24/02/2026",
  "25/02/2026",
  "26/02/2026",
  "27/02/2026",
  "28/02/2026",
  "01/03/2026",
  "02/03/2026",
  "03/03/2026",
  "04/03/2026",
  "05/03/2026",
  "06/03/2026",
  "07/03/2026",
];

interface SyncResult {
  success: boolean;
  totalHotels: number;
  totalDates: number;
  successCount: number;
  errorCount: number;
  errorMessage?: string;
}

/**
 * Run a complete sync for a user
 */
export async function runSync(userId: number): Promise<SyncResult> {
  const db = await getDb();
  if (!db) {
    return {
      success: false,
      totalHotels: 0,
      totalDates: 0,
      successCount: 0,
      errorCount: 0,
      errorMessage: "Database not available",
    };
  }

  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;
  let errorMessage = "";

  try {
    // Get user credentials
    const creds = await db
      .select()
      .from(webbedCredentials)
      .where(eq(webbedCredentials.userId, userId))
      .limit(1);

    if (creds.length === 0) {
      return {
        success: false,
        totalHotels: 0,
        totalDates: 0,
        successCount: 0,
        errorCount: 0,
        errorMessage: "No credentials found",
      };
    }

    const cred = creds[0];
    const password = decryptData(cred.password);

    // Create sync log
    const syncLogResult = await db.insert(syncLogs).values({
      userId,
      status: "running",
      totalHotels: HOTELS_TO_TRACK.length,
      totalDates: DATES_TO_TRACK.length,
      successCount: 0,
      errorCount: 0,
      startedAt: new Date(),
    });

    const syncLogId = (syncLogResult[0] as any).insertId || 1;

    // Initialize scraper
    const scraper = new PuppeteerScraper();
    await scraper.initialize();

    // Login
    const loginSuccess = await scraper.login(cred.username, password);
    if (!loginSuccess) {
      throw new Error("Login failed");
    }

    // Search for prices
    for (const hotel of HOTELS_TO_TRACK) {
      for (const dateStr of DATES_TO_TRACK) {
        try {
          // Get or create hotel
          const hotelId = await getOrCreateHotel(hotel.name, hotel.id);

          // Calculate next day for check-out
          const [day, month, year] = dateStr.split("/");
          const checkInDate = new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day)
          );
          const checkOutDate = new Date(checkInDate);
          checkOutDate.setDate(checkOutDate.getDate() + 1);
          const checkOutStr = `${checkOutDate
            .getDate()
            .toString()
            .padStart(2, "0")}/${(checkOutDate.getMonth() + 1)
            .toString()
            .padStart(2, "0")}/${checkOutDate.getFullYear()}`;

          // Search for price
          const result = await scraper.searchHotelPrice(
            hotel.name,
            dateStr,
            checkOutStr
          );

          if (result) {
            const isoDate = formatDateToISO(dateStr);
            await savePriceHistory(
              hotelId,
              isoDate,
              result.price,
              result.available
            );
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          console.error(
            `[Scheduler] Error searching for ${hotel.name} on ${dateStr}:`,
            error
          );
          errorCount++;
        }
      }
    }

    // Close scraper
    await scraper.close();

    // Update sync log
    const duration = Math.round((Date.now() - startTime) / 1000);
    await db
      .update(syncLogs)
      .set({
        status: "completed",
        successCount,
        errorCount,
        completedAt: new Date(),
        duration,
      })
      .where(eq(syncLogs.id, syncLogId));

    // Update credentials sync status
    await db
      .update(webbedCredentials)
      .set({
        syncStatus: "success",
        lastSyncAt: new Date(),
        syncError: null,
      })
      .where(eq(webbedCredentials.userId, userId));

    return {
      success: true,
      totalHotels: HOTELS_TO_TRACK.length,
      totalDates: DATES_TO_TRACK.length,
      successCount,
      errorCount,
    };
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Scheduler] Sync error:", error);

    // Update credentials sync status with error
    await db
      .update(webbedCredentials)
      .set({
        syncStatus: "error",
        syncError: errorMessage,
      })
      .where(eq(webbedCredentials.userId, userId));

    return {
      success: false,
      totalHotels: HOTELS_TO_TRACK.length,
      totalDates: DATES_TO_TRACK.length,
      successCount,
      errorCount,
      errorMessage,
    };
  }
}

/**
 * Schedule automatic sync every 10 minutes
 */
export function startScheduler(): void {
  console.log("[Scheduler] Starting scheduler...");

  // Run sync every 10 minutes
  cron.schedule("*/10 * * * *", async () => {
    console.log("[Scheduler] Running scheduled sync...");

    const db = await getDb();
    if (!db) {
      console.error("[Scheduler] Database not available");
      return;
    }

    // Get all users with credentials
    const allCreds = await db.select().from(webbedCredentials);

    for (const cred of allCreds) {
      console.log(`[Scheduler] Running sync for user ${cred.userId}...`);
      const result = await runSync(cred.userId);
      console.log(`[Scheduler] Sync result:`, result);
    }
  });

  console.log("[Scheduler] Scheduler started (runs every 10 minutes)");
}

export default {
  runSync,
  startScheduler,
};
