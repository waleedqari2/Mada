import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  webbedCredentials,
  syncLogs,
  priceHistory,
  hotels,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  encryptData,
  decryptData,
  getPriceHistory,
  getAllHotels,
  getLatestPrices,
} from "../scraper/data-processor";
import { syncMonitor } from "../scraper/sync-monitor";
import * as sessionManager from "../scraper/session-manager";

export const scraperRouter = router({
  /**
   * Save or update WebBeds credentials
   */
  saveCredentials: protectedProcedure
    .input(
      z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const encryptedPassword = encryptData(input.password);

      // Check if credentials already exist
      const existing = await db
        .select()
        .from(webbedCredentials)
        .where(eq(webbedCredentials.userId, ctx.user.id))
        .limit(1);

      if (existing.length > 0) {
        // Update existing credentials
        await db
          .update(webbedCredentials)
          .set({
            username: input.username,
            password: encryptedPassword,
            updatedAt: new Date(),
          })
          .where(eq(webbedCredentials.userId, ctx.user.id));
      } else {
        // Create new credentials
        await db.insert(webbedCredentials).values({
          userId: ctx.user.id,
          username: input.username,
          password: encryptedPassword,
          syncStatus: "idle",
        });
      }

      return { success: true };
    }),

  /**
   * Get saved credentials (decrypted)
   */
  getCredentials: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const creds = await db
      .select()
      .from(webbedCredentials)
      .where(eq(webbedCredentials.userId, ctx.user.id))
      .limit(1);

    if (creds.length === 0) {
      return null;
    }

    const cred = creds[0];
    return {
      username: cred.username,
      lastSyncAt: cred.lastSyncAt,
      syncStatus: cred.syncStatus,
      syncError: cred.syncError,
    };
  }),

  /**
   * Delete saved credentials
   */
  deleteCredentials: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db
      .delete(webbedCredentials)
      .where(eq(webbedCredentials.userId, ctx.user.id));

    return { success: true };
  }),

  /**
   * Get all hotels
   */
  getHotels: protectedProcedure.query(async () => {
    return await getAllHotels();
  }),

  /**
   * Add a new hotel
   */
  addHotel: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        hotelId: z.string().min(1),
        city: z.string().default("Makkah"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check if hotel already exists
      const existing = await db
        .select()
        .from(hotels)
        .where(eq(hotels.hotelId, input.hotelId))
        .limit(1);

      if (existing.length > 0) {
        throw new Error("Hotel already exists");
      }

      // Add hotel
      await db.insert(hotels).values({
        name: input.name,
        hotelId: input.hotelId,
        city: input.city,
      });

      return { success: true };
    }),

  /**
   * Get price history for a specific hotel and date range
   */
  getPriceHistory: protectedProcedure
    .input(
      z.object({
        hotelId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ input }) => {
      return await getPriceHistory(input.hotelId, input.startDate, input.endDate);
    }),

  /**
   * Get latest prices for all hotels
   */
  getLatestPrices: protectedProcedure.query(async () => {
    return await getLatestPrices();
  }),

  /**
   * Get sync status
   */
  getSyncStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const logs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.userId, ctx.user.id))
      .orderBy((sl) => sl.startedAt)
      .limit(1);

    if (logs.length === 0) {
      return null;
    }

    const log = logs[0];
    return {
      status: log.status,
      totalHotels: log.totalHotels,
      totalDates: log.totalDates,
      successCount: log.successCount,
      errorCount: log.errorCount,
      errorMessage: log.errorMessage,
      startedAt: log.startedAt,
      completedAt: log.completedAt,
      duration: log.duration,
    };
  }),

  /**
   * Get sync history
   */
  getSyncHistory: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const logs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.userId, ctx.user.id))
      .orderBy((sl) => sl.startedAt);

    return logs.map((log) => ({
      id: log.id,
      status: log.status,
      totalHotels: log.totalHotels,
      totalDates: log.totalDates,
      successCount: log.successCount,
      errorCount: log.errorCount,
      startedAt: log.startedAt,
      completedAt: log.completedAt,
      duration: log.duration,
    }));
  }),

  /**
   * Upload session from JSON
   */
  uploadSession: protectedProcedure
    .input(
      z.object({
        sessionJson: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const success = sessionManager.uploadSession(
        ctx.user.id.toString(),
        input.sessionJson
      );

      if (!success) {
        throw new Error("Failed to upload session");
      }

      return { success: true };
    }),

  /**
   * Export current session as JSON
   */
  exportSession: protectedProcedure.query(async ({ ctx }) => {
    const sessionJson = sessionManager.exportSession(ctx.user.id.toString());

    if (!sessionJson) {
      throw new Error("No active session found");
    }

    return { sessionJson };
  }),

  /**
   * Get session status and expiry
   */
  getSessionStatus: protectedProcedure.query(async ({ ctx }) => {
    const daysRemaining = sessionManager.getSessionExpiryDays(
      ctx.user.id.toString()
    );
    const needsVerification = sessionManager.isSessionNeedingVerification(
      ctx.user.id.toString()
    );

    return {
      hasSession: daysRemaining !== null,
      daysRemaining: daysRemaining || 0,
      needsVerification,
      expiresAt: daysRemaining
        ? new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000).toISOString()
        : null,
    };
  }),

  /**
   * Get sync monitor statistics
   */
  getSyncMonitorStats: protectedProcedure.query(async () => {
    return syncMonitor.getFormattedStats();
  }),

  /**
   * Get price comparison for a hotel
   */
  getPriceComparison: protectedProcedure
    .input(
      z.object({
        hotelId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get hotel info
      const hotelInfo = await db
        .select()
        .from(hotels)
        .where(eq(hotels.id, input.hotelId))
        .limit(1);

      if (hotelInfo.length === 0) {
        throw new Error("Hotel not found");
      }

      // Get price history
      const prices = await db
        .select()
        .from(priceHistory)
        .where(eq(priceHistory.hotelId, input.hotelId));

      return {
        hotelId: hotelInfo[0].id,
        hotelName: hotelInfo[0].name,
        prices: prices.map((p) => ({
          date: p.date,
          displayPrice: p.displayPrice,
          actualPrice: p.actualPrice,
          available: p.available === 1,
        })),
      };
    }),
});

export default scraperRouter;
