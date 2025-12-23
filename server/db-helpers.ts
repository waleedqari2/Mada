import { eq, and, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { userPrices, priceAlerts, priceHistory, hotels } from "../drizzle/schema";
import { getDb } from "./db";

const DISCOUNT_RATE = 0.04998;

/**
 * Save user's custom price for a hotel on a specific date
 */
export async function saveUserPrice(
  userId: number,
  hotelId: number,
  date: string,
  customPrice: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(userPrices)
    .where(
      and(
        eq(userPrices.userId, userId),
        eq(userPrices.hotelId, hotelId),
        eq(userPrices.date, date)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(userPrices)
      .set({ customPrice, updatedAt: new Date() })
      .where(
        and(
          eq(userPrices.userId, userId),
          eq(userPrices.hotelId, hotelId),
          eq(userPrices.date, date)
        )
      );
  } else {
    await db.insert(userPrices).values({
      userId,
      hotelId,
      date,
      customPrice,
    });
  }
}

/**
 * Get user's custom price for a hotel on a specific date
 */
export async function getUserPrice(
  userId: number,
  hotelId: number,
  date: string
): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(userPrices)
    .where(
      and(
        eq(userPrices.userId, userId),
        eq(userPrices.hotelId, hotelId),
        eq(userPrices.date, date)
      )
    )
    .limit(1);

  return result.length > 0 ? result[0].customPrice : null;
}

/**
 * Get competitor's base price (without markup)
 */
export async function getCompetitorBasePrice(
  hotelId: number,
  date: string
): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(priceHistory)
    .where(
      and(eq(priceHistory.hotelId, hotelId), eq(priceHistory.date, date))
    )
    .limit(1);

  return result.length > 0 && result[0].actualPrice
    ? result[0].actualPrice
    : null;
}

/**
 * Create or update price alert
 */
export async function createPriceAlert(
  userId: number,
  hotelId: number,
  date: string,
  userPrice: number,
  competitorPrice: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const priceDifference = competitorPrice - userPrice;
  const alertType =
    priceDifference < 0
      ? "price_lower"
      : priceDifference > 0
        ? "price_higher"
        : "price_equal";

  // Only create alert if competitor price is lower
  if (alertType === "price_lower") {
    const existing = await db
      .select()
      .from(priceAlerts)
      .where(
        and(
          eq(priceAlerts.userId, userId),
          eq(priceAlerts.hotelId, hotelId),
          eq(priceAlerts.date, date),
          eq(priceAlerts.isActive, 1)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(priceAlerts)
        .set({
          competitorPrice,
          priceDifference,
          alertType,
          createdAt: new Date(),
        })
        .where(eq(priceAlerts.id, existing[0].id));
    } else {
      await db.insert(priceAlerts).values({
        userId,
        hotelId,
        date,
        userPrice,
        competitorPrice,
        priceDifference,
        alertType,
      });
    }
  }
}

/**
 * Get active alerts for user
 */
export async function getActiveAlerts(userId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const alerts = await db
    .select({
      id: priceAlerts.id,
      hotelId: priceAlerts.hotelId,
      hotelName: hotels.name,
      date: priceAlerts.date,
      userPrice: priceAlerts.userPrice,
      competitorPrice: priceAlerts.competitorPrice,
      priceDifference: priceAlerts.priceDifference,
      alertType: priceAlerts.alertType,
      createdAt: priceAlerts.createdAt,
    })
    .from(priceAlerts)
    .innerJoin(hotels, eq(priceAlerts.hotelId, hotels.id))
    .where(
      and(
        eq(priceAlerts.userId, userId),
        eq(priceAlerts.isActive, 1)
      )
    )
    .orderBy((t) => t.createdAt);

  return alerts;
}

/**
 * Dismiss alert
 */
export async function dismissAlert(alertId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(priceAlerts)
    .set({ isActive: 0, dismissedAt: new Date() })
    .where(eq(priceAlerts.id, alertId));
}

/**
 * Get price comparison data for dashboard
 */
export async function getPriceComparisonData(
  userId: number,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const data = await db
    .select({
      hotelId: hotels.id,
      hotelName: hotels.name,
      date: priceHistory.date,
      competitorBasePrice: priceHistory.actualPrice,
      userPrice: userPrices.customPrice,
    })
    .from(priceHistory)
    .innerJoin(hotels, eq(priceHistory.hotelId, hotels.id))
    .leftJoin(
      userPrices,
      and(
        eq(userPrices.userId, userId),
        eq(userPrices.hotelId, priceHistory.hotelId),
        eq(userPrices.date, priceHistory.date)
      )
    )
    .where(
      and(
        gte(priceHistory.date, startDate),
        lte(priceHistory.date, endDate)
      )
    );

  return data.map((item) => ({
    ...item,
    priceDifference: item.userPrice && item.competitorBasePrice
      ? item.competitorBasePrice - item.userPrice
      : null,
    status:
      item.userPrice === null || item.competitorBasePrice === null
        ? "no_price"
        : item.competitorBasePrice < item.userPrice
          ? "losing"
          : item.competitorBasePrice > item.userPrice
            ? "winning"
            : "equal",
  }));
}
