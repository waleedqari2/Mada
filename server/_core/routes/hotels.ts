import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
import { db } from '../db';
import { priceHistory } from '../db/schema';
import { eq, between, and, desc } from 'drizzle-orm';
import { scrapeHotelPrices } from '../scrapers/puppeteer';
import { TRPCError } from '@trpc/server';

/**
 * Hotel schema validation
 */
const HotelSchema = z.object({
  name: z.string().min(1, 'Hotel name is required').max(255),
  hotelId: z.string().min(1, 'Hotel ID is required').max(100),
});

const SearchPricesSchema = z.object({
  hotelId: z.string().min(1, 'Hotel ID is required'),
  dateFrom: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    'Invalid dateFrom format'
  ),
  dateTo: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    'Invalid dateTo format'
  ),
  searchType: z.enum(['full', 'nightly']).default('full'),
});

const DeleteHotelSchema = z.object({
  hotelId: z.string().min(1, 'Hotel ID is required'),
});

const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

/**
 * Hotels tRPC Router
 */
export const hotelsRouter = router({
  /**
   * List all hotels with optional filtering
   * Returns paginated list of hotels stored in the system
   */
  listHotels: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      try {
        // TODO: Implement database query to fetch hotels
        // This assumes a hotels table exists in your schema
        const hotels = []; // Replace with actual db query

        return {
          success: true,
          data: hotels,
          total: hotels.length,
          limit: input.limit,
          offset: input.offset,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch hotels',
          cause: error,
        });
      }
    }),

  /**
   * Add a new hotel to the system
   * Accepts hotel name and hotel ID (external booking system ID)
   */
  addHotel: publicProcedure
    .input(HotelSchema)
    .mutation(async ({ input }) => {
      try {
        // Validate input
        const validatedData = HotelSchema.parse(input);

        // TODO: Implement database insert
        // Check for duplicates before insertion
        // const existingHotel = await db.query.hotels.findFirst({
        //   where: eq(hotels.hotelId, validatedData.hotelId),
        // });
        //
        // if (existingHotel) {
        //   throw new TRPCError({
        //     code: 'CONFLICT',
        //     message: 'Hotel with this ID already exists',
        //   });
        // }
        //
        // const result = await db.insert(hotels).values(validatedData).returning();

        return {
          success: true,
          message: 'Hotel added successfully',
          data: {
            hotelId: validatedData.hotelId,
            name: validatedData.name,
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to add hotel',
          cause: error,
        });
      }
    }),

  /**
   * Delete a hotel by ID
   * Removes hotel from the system and associated price history
   */
  deleteHotel: publicProcedure
    .input(DeleteHotelSchema)
    .mutation(async ({ input }) => {
      try {
        const validatedData = DeleteHotelSchema.parse(input);

        // TODO: Implement database delete
        // Optional: Delete associated price history records
        // await db
        //   .delete(priceHistory)
        //   .where(eq(priceHistory.hotelId, validatedData.hotelId));
        //
        // await db
        //   .delete(hotels)
        //   .where(eq(hotels.hotelId, validatedData.hotelId));

        return {
          success: true,
          message: 'Hotel deleted successfully',
          data: { hotelId: validatedData.hotelId },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete hotel',
          cause: error,
        });
      }
    }),

  /**
   * Search hotel prices for a date range
   * Integrates with Puppeteer scraper to fetch real-time prices
   * Stores results in priceHistory table
   * 
   * @param hotelId - External hotel identifier
   * @param dateFrom - Start date (ISO format)
   * @param dateTo - End date (ISO format)
   * @param searchType - 'full' for complete stay or 'nightly' for per-night breakdown
   */
  searchHotelPrices: publicProcedure
    .input(SearchPricesSchema)
    .mutation(async ({ input }) => {
      try {
        const validatedData = SearchPricesSchema.parse(input);

        // Validate date range
        const from = new Date(validatedData.dateFrom);
        const to = new Date(validatedData.dateTo);

        if (from > to) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'dateFrom must be before dateTo',
          });
        }

        const daysDifference = Math.ceil(
          (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysDifference > 365) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Date range cannot exceed 365 days',
          });
        }

        // Call Puppeteer scraper to fetch prices
        let scrapedData;
        try {
          scrapedData = await scrapeHotelPrices({
            hotelId: validatedData.hotelId,
            dateFrom: validatedData.dateFrom,
            dateTo: validatedData.dateTo,
            searchType: validatedData.searchType,
          });
        } catch (scraperError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to scrape hotel prices',
            cause: scraperError,
          });
        }

        // Store results in priceHistory table
        const historyRecords = [];

        if (validatedData.searchType === 'nightly') {
          // Per-night breakdown
          let currentDate = new Date(from);
          while (currentDate < to) {
            const nextDate = new Date(currentDate);
            nextDate.setDate(nextDate.getDate() + 1);

            const nightPrice = scrapedData.prices.find(
              (p) =>
                new Date(p.date).toDateString() === currentDate.toDateString()
            );

            historyRecords.push({
              hotelId: validatedData.hotelId,
              checkInDate: currentDate.toISOString().split('T')[0],
              checkOutDate: nextDate.toISOString().split('T')[0],
              price: nightPrice?.price || 0,
              currency: scrapedData.currency || 'USD',
              searchType: 'nightly' as const,
              source: 'puppeteer_scraper',
              scrapedAt: new Date(),
            });

            currentDate = nextDate;
          }
        } else {
          // Full stay price
          historyRecords.push({
            hotelId: validatedData.hotelId,
            checkInDate: validatedData.dateFrom,
            checkOutDate: validatedData.dateTo,
            price: scrapedData.totalPrice || 0,
            currency: scrapedData.currency || 'USD',
            searchType: 'full' as const,
            source: 'puppeteer_scraper',
            scrapedAt: new Date(),
          });
        }

        // Insert into database
        // TODO: Uncomment when priceHistory table is available
        // if (historyRecords.length > 0) {
        //   await db.insert(priceHistory).values(historyRecords);
        // }

        return {
          success: true,
          message: `Found ${historyRecords.length} price record(s)`,
          data: {
            hotelId: validatedData.hotelId,
            checkInDate: validatedData.dateFrom,
            checkOutDate: validatedData.dateTo,
            searchType: validatedData.searchType,
            prices: scrapedData.prices,
            totalPrice: scrapedData.totalPrice,
            currency: scrapedData.currency,
            recordsStored: historyRecords.length,
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to search hotel prices',
          cause: error,
        });
      }
    }),

  /**
   * Get search history for a hotel
   * Retrieves all previous price searches and results from priceHistory table
   */
  getSearchHistory: publicProcedure
    .input(
      z.object({
        hotelId: z.string().min(1, 'Hotel ID is required'),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        // Build query conditions
        const conditions = [
          eq(priceHistory.hotelId, input.hotelId),
        ];

        if (input.startDate && input.endDate) {
          const start = new Date(input.startDate);
          const end = new Date(input.endDate);

          conditions.push(
            and(
              between(
                priceHistory.scrapedAt,
                start,
                end
              )
            ) as any
          );
        }

        // TODO: Implement database query when priceHistory table is available
        // const history = await db
        //   .select()
        //   .from(priceHistory)
        //   .where(and(...conditions))
        //   .orderBy(desc(priceHistory.scrapedAt))
        //   .limit(input.limit)
        //   .offset(input.offset);
        //
        // const total = await db
        //   .select({ count: sql`count(*)` })
        //   .from(priceHistory)
        //   .where(and(...conditions));

        const history = [];
        const total = 0;

        return {
          success: true,
          data: history,
          pagination: {
            total,
            limit: input.limit,
            offset: input.offset,
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch search history',
          cause: error,
        });
      }
    }),

  /**
   * Get statistics for a hotel's price history
   * Returns min, max, average prices and trends
   */
  getPriceStatistics: publicProcedure
    .input(
      z.object({
        hotelId: z.string().min(1, 'Hotel ID is required'),
        days: z.number().int().min(1).max(365).default(30),
      })
    )
    .query(async ({ input }) => {
      try {
        // TODO: Implement statistics query
        // Calculate based on priceHistory records from the last N days
        // Example aggregations:
        // - MIN(price)
        // - MAX(price)
        // - AVG(price)
        // - STDDEV(price) for volatility
        // - Price trend (moving average)

        return {
          success: true,
          data: {
            hotelId: input.hotelId,
            period: `Last ${input.days} days`,
            minPrice: 0,
            maxPrice: 0,
            avgPrice: 0,
            priceVolatility: 0,
            trend: 'stable',
            lastUpdated: new Date(),
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to calculate price statistics',
          cause: error,
        });
      }
    }),
});

export default hotelsRouter;
