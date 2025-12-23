import CryptoJS from "crypto-js";
import { getDb } from "../db";
import {
  hotels,
  priceHistory,
  webbedCredentials,
  InsertPriceHistory,
  InsertHotel,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-secret-key";

/**
 * Encrypt sensitive data
 */
export function encryptData(data: string): string {
  return CryptoJS.AES.encrypt(data, ENCRYPTION_KEY).toString();
}

/**
 * Decrypt sensitive data
 */
export function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * Calculate actual price after applying 4.998% discount
 */
export function calculateActualPrice(displayPrice: number): number {
  return Math.round((displayPrice / 1.04998) * 100) / 100;
}

/**
 * Format date from DD/MM/YYYY to YYYY-MM-DD
 */
export function formatDateToISO(dateStr: string): string {
  const [day, month, year] = dateStr.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Format date from YYYY-MM-DD to DD/MM/YYYY
 */
export function formatDateToDDMMYYYY(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Get or create hotel in database
 */
export async function getOrCreateHotel(
  hotelName: string,
  hotelId: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if hotel exists
  const existing = await db
    .select()
    .from(hotels)
    .where(eq(hotels.hotelId, hotelId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  // Create new hotel
  const newHotel: InsertHotel = {
    name: hotelName,
    hotelId: hotelId,
    city: "Makkah",
  };

  const result = await db.insert(hotels).values(newHotel);
  return result[0] as unknown as number;
}

/**
 * Save price to database
 */
export async function savePriceHistory(
  hotelId: number,
  date: string, // Format: YYYY-MM-DD
  displayPrice: number | null,
  available: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const actualPrice = displayPrice
    ? calculateActualPrice(displayPrice)
    : null;

  const priceData: InsertPriceHistory = {
    hotelId,
    date,
    displayPrice,
    actualPrice: actualPrice ? Math.round(actualPrice) : null,
    currency: "SAR",
    available: available ? 1 : 0,
  };

  await db.insert(priceHistory).values(priceData);
}

/**
 * Get price history for a hotel and date range
 */
export async function getPriceHistory(
  hotelId: number,
  startDate: string, // Format: YYYY-MM-DD
  endDate: string // Format: YYYY-MM-DD
): Promise<
  Array<{
    date: string;
    displayPrice: number | null;
    actualPrice: number | null;
    available: boolean;
  }>
> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results = await db
    .select()
    .from(priceHistory)
    .where((ph) => {
      const conditions = [];
      conditions.push(eq(ph.hotelId, hotelId));
      // Add date range filtering if needed
      return conditions[0];
    });

  return results.map((r) => ({
    date: r.date,
    displayPrice: r.displayPrice,
    actualPrice: r.actualPrice,
    available: r.available === 1,
  }));
}

/**
 * Get all hotels
 */
export async function getAllHotels(): Promise<
  Array<{ id: number; name: string; hotelId: string }>
> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results = await db.select().from(hotels);
  return results.map((h) => ({
    id: h.id,
    name: h.name,
    hotelId: h.hotelId,
  }));
}

/**
 * Get latest prices for all hotels
 */
export async function getLatestPrices(): Promise<
  Array<{
    hotelId: number;
    hotelName: string;
    date: string;
    displayPrice: number | null;
    actualPrice: number | null;
    available: boolean;
  }>
> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // This would need a more complex query to get the latest price for each hotel
  // For now, returning a simple query
  const results = await db
    .select({
      hotelId: priceHistory.hotelId,
      hotelName: hotels.name,
      date: priceHistory.date,
      displayPrice: priceHistory.displayPrice,
      actualPrice: priceHistory.actualPrice,
      available: priceHistory.available,
    })
    .from(priceHistory)
    .innerJoin(hotels, eq(priceHistory.hotelId, hotels.id));

  return results.map((r) => ({
    hotelId: r.hotelId,
    hotelName: r.hotelName,
    date: r.date,
    displayPrice: r.displayPrice,
    actualPrice: r.actualPrice,
    available: r.available === 1,
  }));
}

export default {
  encryptData,
  decryptData,
  calculateActualPrice,
  formatDateToISO,
  formatDateToDDMMYYYY,
  getOrCreateHotel,
  savePriceHistory,
  getPriceHistory,
  getAllHotels,
  getLatestPrices,
};
