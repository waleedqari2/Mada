import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  saveUserPrice,
  getUserPrice,
  getCompetitorBasePrice,
  createPriceAlert,
  getActiveAlerts,
  dismissAlert,
  getPriceComparisonData,
} from "../db-helpers";

export const pricingRouter = router({
  /**
   * Save user's custom price for a hotel on a specific date
   */
  saveUserPrice: protectedProcedure
    .input(
      z.object({
        hotelId: z.number(),
        date: z.string(),
        customPrice: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await saveUserPrice(
        ctx.user.id,
        input.hotelId,
        input.date,
        input.customPrice
      );
      return { success: true };
    }),

  /**
   * Get user's custom price
   */
  getUserPrice: protectedProcedure
    .input(
      z.object({
        hotelId: z.number(),
        date: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const price = await getUserPrice(
        ctx.user.id,
        input.hotelId,
        input.date
      );
      return { price };
    }),

  /**
   * Get competitor's base price
   */
  getCompetitorBasePrice: protectedProcedure
    .input(
      z.object({
        hotelId: z.number(),
        date: z.string(),
      })
    )
    .query(async ({ input }) => {
      const price = await getCompetitorBasePrice(input.hotelId, input.date);
      return { price };
    }),

  /**
   * Create or update price alert
   */
  createPriceAlert: protectedProcedure
    .input(
      z.object({
        hotelId: z.number(),
        date: z.string(),
        userPrice: z.number(),
        competitorPrice: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await createPriceAlert(
        ctx.user.id,
        input.hotelId,
        input.date,
        input.userPrice,
        input.competitorPrice
      );
      return { success: true };
    }),

  /**
   * Get active alerts for user
   */
  getActiveAlerts: protectedProcedure.query(async ({ ctx }) => {
    const alerts = await getActiveAlerts(ctx.user.id);
    return alerts;
  }),

  /**
   * Dismiss alert
   */
  dismissAlert: protectedProcedure
    .input(z.object({ alertId: z.number() }))
    .mutation(async ({ input }) => {
      await dismissAlert(input.alertId);
      return { success: true };
    }),

  /**
   * Get price comparison data for dashboard
   */
  getPriceComparisonData: protectedProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const data = await getPriceComparisonData(
        ctx.user.id,
        input.startDate,
        input.endDate
      );
      return data;
    }),
});

export default pricingRouter;
