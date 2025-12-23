import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Hotels table
export const hotels = mysqlTable("hotels", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  hotelId: varchar("hotelId", { length: 100 }).notNull().unique(),
  city: varchar("city", { length: 100 }).default("Makkah").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Hotel = typeof hotels.$inferSelect;
export type InsertHotel = typeof hotels.$inferInsert;

// Price history table
export const priceHistory = mysqlTable("priceHistory", {
  id: int("id").autoincrement().primaryKey(),
  hotelId: int("hotelId").notNull().references(() => hotels.id),
  date: varchar("date", { length: 10 }).notNull(),
  displayPrice: int("displayPrice"),
  actualPrice: int("actualPrice"),
  currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
  available: int("available").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PriceHistory = typeof priceHistory.$inferSelect;
export type InsertPriceHistory = typeof priceHistory.$inferInsert;

// User custom prices table
export const userPrices = mysqlTable("userPrices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  hotelId: int("hotelId").notNull().references(() => hotels.id),
  date: varchar("date", { length: 10 }).notNull(),
  customPrice: int("customPrice").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserPrice = typeof userPrices.$inferSelect;
export type InsertUserPrice = typeof userPrices.$inferInsert;

// Price alerts table
export const priceAlerts = mysqlTable("priceAlerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  hotelId: int("hotelId").notNull().references(() => hotels.id),
  date: varchar("date", { length: 10 }).notNull(),
  userPrice: int("userPrice").notNull(),
  competitorPrice: int("competitorPrice").notNull(),
  priceDifference: int("priceDifference").notNull(),
  alertType: mysqlEnum("alertType", ["price_lower", "price_higher", "price_equal"]).notNull(),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  dismissedAt: timestamp("dismissedAt"),
});

export type PriceAlert = typeof priceAlerts.$inferSelect;
export type InsertPriceAlert = typeof priceAlerts.$inferInsert;

// WebBeds credentials table
export const webbedCredentials = mysqlTable("webbedCredentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  username: text("username").notNull(),
  password: text("password").notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  syncStatus: mysqlEnum("syncStatus", ["idle", "syncing", "error", "success"]).default("idle").notNull(),
  syncError: text("syncError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WebbedCredential = typeof webbedCredentials.$inferSelect;
export type InsertWebbedCredential = typeof webbedCredentials.$inferInsert;

// Sync logs table
export const syncLogs = mysqlTable("syncLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  totalHotels: int("totalHotels").default(0).notNull(),
  totalDates: int("totalDates").default(0).notNull(),
  successCount: int("successCount").default(0).notNull(),
  errorCount: int("errorCount").default(0).notNull(),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  duration: int("duration"),
});

export type SyncLog = typeof syncLogs.$inferSelect;
export type InsertSyncLog = typeof syncLogs.$inferInsert;
