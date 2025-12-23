// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var hotels = mysqlTable("hotels", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  hotelId: varchar("hotelId", { length: 100 }).notNull().unique(),
  city: varchar("city", { length: 100 }).default("Makkah").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var priceHistory = mysqlTable("priceHistory", {
  id: int("id").autoincrement().primaryKey(),
  hotelId: int("hotelId").notNull().references(() => hotels.id),
  date: varchar("date", { length: 10 }).notNull(),
  displayPrice: int("displayPrice"),
  actualPrice: int("actualPrice"),
  currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
  available: int("available").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var userPrices = mysqlTable("userPrices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  hotelId: int("hotelId").notNull().references(() => hotels.id),
  date: varchar("date", { length: 10 }).notNull(),
  customPrice: int("customPrice").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var priceAlerts = mysqlTable("priceAlerts", {
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
  dismissedAt: timestamp("dismissedAt")
});
var webbedCredentials = mysqlTable("webbedCredentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  username: text("username").notNull(),
  password: text("password").notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  syncStatus: mysqlEnum("syncStatus", ["idle", "syncing", "error", "success"]).default("idle").notNull(),
  syncError: text("syncError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var syncLogs = mysqlTable("syncLogs", {
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
  duration: int("duration")
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers/scraper.ts
import { z as z2 } from "zod";
import { eq as eq3 } from "drizzle-orm";

// server/scraper/data-processor.ts
import CryptoJS from "crypto-js";
import { eq as eq2 } from "drizzle-orm";
var ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-secret-key";
function encryptData(data) {
  return CryptoJS.AES.encrypt(data, ENCRYPTION_KEY).toString();
}
async function getPriceHistory(hotelId, startDate, endDate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(priceHistory).where((ph) => {
    const conditions = [];
    conditions.push(eq2(ph.hotelId, hotelId));
    return conditions[0];
  });
  return results.map((r) => ({
    date: r.date,
    displayPrice: r.displayPrice,
    actualPrice: r.actualPrice,
    available: r.available === 1
  }));
}
async function getAllHotels() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(hotels);
  return results.map((h) => ({
    id: h.id,
    name: h.name,
    hotelId: h.hotelId
  }));
}
async function getLatestPrices() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select({
    hotelId: priceHistory.hotelId,
    hotelName: hotels.name,
    date: priceHistory.date,
    displayPrice: priceHistory.displayPrice,
    actualPrice: priceHistory.actualPrice,
    available: priceHistory.available
  }).from(priceHistory).innerJoin(hotels, eq2(priceHistory.hotelId, hotels.id));
  return results.map((r) => ({
    hotelId: r.hotelId,
    hotelName: r.hotelName,
    date: r.date,
    displayPrice: r.displayPrice,
    actualPrice: r.actualPrice,
    available: r.available === 1
  }));
}

// server/scraper/sync-monitor.ts
var SyncMonitor = class {
  stats = {
    totalCycles: 0,
    successfulCycles: 0,
    failedCycles: 0,
    lastSyncTime: null,
    lastSyncDuration: null,
    startTime: Date.now(),
    averageCycleDuration: 0,
    totalItemsProcessed: 0
  };
  cycleDurations = [];
  /**
   * Record start of a sync cycle
   */
  startCycle() {
    return Date.now();
  }
  /**
   * Record end of a sync cycle
   */
  endCycle(startTime, success, itemsProcessed = 0) {
    const duration = Date.now() - startTime;
    this.stats.totalCycles++;
    this.stats.lastSyncTime = Date.now();
    this.stats.lastSyncDuration = duration;
    this.stats.totalItemsProcessed += itemsProcessed;
    if (success) {
      this.stats.successfulCycles++;
    } else {
      this.stats.failedCycles++;
    }
    this.cycleDurations.push(duration);
    if (this.cycleDurations.length > 100) {
      this.cycleDurations.shift();
    }
    this.stats.averageCycleDuration = this.cycleDurations.reduce((a, b) => a + b, 0) / this.cycleDurations.length;
    console.log(
      `[SyncMonitor] Cycle ${this.stats.totalCycles} completed in ${duration}ms (${success ? "SUCCESS" : "FAILED"}) - Items: ${itemsProcessed}`
    );
  }
  /**
   * Get current sync statistics
   */
  getStats() {
    return { ...this.stats };
  }
  /**
   * Get formatted statistics for display
   */
  getFormattedStats() {
    const uptime = this.getUptimeString();
    const successRate = this.stats.totalCycles > 0 ? (this.stats.successfulCycles / this.stats.totalCycles * 100).toFixed(2) : "0";
    return {
      totalCycles: this.stats.totalCycles,
      successfulCycles: this.stats.successfulCycles,
      failedCycles: this.stats.failedCycles,
      successRate: `${successRate}%`,
      lastSyncTime: this.stats.lastSyncTime ? new Date(this.stats.lastSyncTime).toLocaleString("ar-SA") : null,
      lastSyncDuration: this.stats.lastSyncDuration ? `${(this.stats.lastSyncDuration / 1e3).toFixed(2)}s` : null,
      uptime,
      averageCycleDuration: `${(this.stats.averageCycleDuration / 1e3).toFixed(2)}s`,
      totalItemsProcessed: this.stats.totalItemsProcessed
    };
  }
  /**
   * Get uptime string
   */
  getUptimeString() {
    const uptimeMs = Date.now() - this.stats.startTime;
    const days = Math.floor(uptimeMs / (1e3 * 60 * 60 * 24));
    const hours = Math.floor(uptimeMs / (1e3 * 60 * 60) % 24);
    const minutes = Math.floor(uptimeMs / (1e3 * 60) % 60);
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
  /**
   * Reset statistics
   */
  reset() {
    this.stats = {
      totalCycles: 0,
      successfulCycles: 0,
      failedCycles: 0,
      lastSyncTime: null,
      lastSyncDuration: null,
      startTime: Date.now(),
      averageCycleDuration: 0,
      totalItemsProcessed: 0
    };
    this.cycleDurations = [];
  }
};
var syncMonitor = new SyncMonitor();

// server/scraper/session-manager.ts
import * as fs from "fs";
import * as path from "path";
var SESSION_DIR = path.join(process.cwd(), ".sessions");
function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}
function getSessionPath(userId) {
  return path.join(SESSION_DIR, `${userId}.json`);
}
function saveSession(userId, sessionData) {
  ensureSessionDir();
  const sessionPath = getSessionPath(userId);
  fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
  console.log(`[SessionManager] Session saved for user ${userId}`);
}
function loadSession(userId) {
  ensureSessionDir();
  const sessionPath = getSessionPath(userId);
  if (!fs.existsSync(sessionPath)) {
    console.log(`[SessionManager] No session found for user ${userId}`);
    return null;
  }
  try {
    const data = fs.readFileSync(sessionPath, "utf-8");
    const session = JSON.parse(data);
    if (Date.now() > session.expiresAt) {
      console.log(`[SessionManager] Session expired for user ${userId}`);
      deleteSession(userId);
      return null;
    }
    console.log(`[SessionManager] Session loaded for user ${userId}`);
    return session;
  } catch (error) {
    console.error(`[SessionManager] Error loading session for user ${userId}:`, error);
    return null;
  }
}
function deleteSession(userId) {
  ensureSessionDir();
  const sessionPath = getSessionPath(userId);
  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
    console.log(`[SessionManager] Session deleted for user ${userId}`);
  }
}
function getSessionExpiryDays(userId) {
  const session = loadSession(userId);
  if (!session) return null;
  const daysRemaining = Math.ceil((session.expiresAt - Date.now()) / (24 * 60 * 60 * 1e3));
  return Math.max(0, daysRemaining);
}
function isSessionNeedingVerification(userId) {
  const session = loadSession(userId);
  if (!session) return true;
  const ageInDays = Math.floor((Date.now() - session.timestamp) / (24 * 60 * 60 * 1e3));
  return ageInDays >= 15;
}
function uploadSession(userId, jsonData) {
  try {
    const sessionData = JSON.parse(jsonData);
    if (!sessionData.cookies || !Array.isArray(sessionData.cookies)) {
      throw new Error("Invalid session data: missing or invalid cookies");
    }
    if (Date.now() > sessionData.expiresAt) {
      throw new Error("Session has expired");
    }
    saveSession(userId, sessionData);
    return true;
  } catch (error) {
    console.error(`[SessionManager] Error uploading session for user ${userId}:`, error);
    return false;
  }
}
function exportSession(userId) {
  const session = loadSession(userId);
  if (!session) return null;
  return JSON.stringify(session, null, 2);
}

// server/routers/scraper.ts
var scraperRouter = router({
  /**
   * Save or update WebBeds credentials
   */
  saveCredentials: protectedProcedure.input(
    z2.object({
      username: z2.string().min(1),
      password: z2.string().min(1)
    })
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const encryptedPassword = encryptData(input.password);
    const existing = await db.select().from(webbedCredentials).where(eq3(webbedCredentials.userId, ctx.user.id)).limit(1);
    if (existing.length > 0) {
      await db.update(webbedCredentials).set({
        username: input.username,
        password: encryptedPassword,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq3(webbedCredentials.userId, ctx.user.id));
    } else {
      await db.insert(webbedCredentials).values({
        userId: ctx.user.id,
        username: input.username,
        password: encryptedPassword,
        syncStatus: "idle"
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
    const creds = await db.select().from(webbedCredentials).where(eq3(webbedCredentials.userId, ctx.user.id)).limit(1);
    if (creds.length === 0) {
      return null;
    }
    const cred = creds[0];
    return {
      username: cred.username,
      lastSyncAt: cred.lastSyncAt,
      syncStatus: cred.syncStatus,
      syncError: cred.syncError
    };
  }),
  /**
   * Delete saved credentials
   */
  deleteCredentials: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.delete(webbedCredentials).where(eq3(webbedCredentials.userId, ctx.user.id));
    return { success: true };
  }),
  /**
   * Get all hotels
   */
  getHotels: protectedProcedure.query(async () => {
    return await getAllHotels();
  }),
  /**
   * Get price history for a specific hotel and date range
   */
  getPriceHistory: protectedProcedure.input(
    z2.object({
      hotelId: z2.number(),
      startDate: z2.string(),
      endDate: z2.string()
    })
  ).query(async ({ input }) => {
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
    const logs = await db.select().from(syncLogs).where(eq3(syncLogs.userId, ctx.user.id)).orderBy((sl) => sl.startedAt).limit(1);
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
      duration: log.duration
    };
  }),
  /**
   * Get sync history
   */
  getSyncHistory: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const logs = await db.select().from(syncLogs).where(eq3(syncLogs.userId, ctx.user.id)).orderBy((sl) => sl.startedAt);
    return logs.map((log) => ({
      id: log.id,
      status: log.status,
      totalHotels: log.totalHotels,
      totalDates: log.totalDates,
      successCount: log.successCount,
      errorCount: log.errorCount,
      startedAt: log.startedAt,
      completedAt: log.completedAt,
      duration: log.duration
    }));
  }),
  /**
   * Upload session from JSON
   */
  uploadSession: protectedProcedure.input(
    z2.object({
      sessionJson: z2.string()
    })
  ).mutation(async ({ ctx, input }) => {
    const success = uploadSession(
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
    const sessionJson = exportSession(ctx.user.id.toString());
    if (!sessionJson) {
      throw new Error("No active session found");
    }
    return { sessionJson };
  }),
  /**
   * Get session status and expiry
   */
  getSessionStatus: protectedProcedure.query(async ({ ctx }) => {
    const daysRemaining = getSessionExpiryDays(
      ctx.user.id.toString()
    );
    const needsVerification = isSessionNeedingVerification(
      ctx.user.id.toString()
    );
    return {
      hasSession: daysRemaining !== null,
      daysRemaining: daysRemaining || 0,
      needsVerification,
      expiresAt: daysRemaining ? new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1e3).toISOString() : null
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
  getPriceComparison: protectedProcedure.input(
    z2.object({
      hotelId: z2.number(),
      startDate: z2.string(),
      endDate: z2.string()
    })
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const hotelInfo = await db.select().from(hotels).where(eq3(hotels.id, input.hotelId)).limit(1);
    if (hotelInfo.length === 0) {
      throw new Error("Hotel not found");
    }
    const prices = await db.select().from(priceHistory).where(eq3(priceHistory.hotelId, input.hotelId));
    return {
      hotelId: hotelInfo[0].id,
      hotelName: hotelInfo[0].name,
      prices: prices.map((p) => ({
        date: p.date,
        displayPrice: p.displayPrice,
        actualPrice: p.actualPrice,
        available: p.available === 1
      }))
    };
  })
});

// server/routers/pricing.ts
import { z as z3 } from "zod";

// server/db-helpers.ts
import { eq as eq4, and, gte, lte } from "drizzle-orm";
async function saveUserPrice(userId, hotelId, date, customPrice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(userPrices).where(
    and(
      eq4(userPrices.userId, userId),
      eq4(userPrices.hotelId, hotelId),
      eq4(userPrices.date, date)
    )
  ).limit(1);
  if (existing.length > 0) {
    await db.update(userPrices).set({ customPrice, updatedAt: /* @__PURE__ */ new Date() }).where(
      and(
        eq4(userPrices.userId, userId),
        eq4(userPrices.hotelId, hotelId),
        eq4(userPrices.date, date)
      )
    );
  } else {
    await db.insert(userPrices).values({
      userId,
      hotelId,
      date,
      customPrice
    });
  }
}
async function getUserPrice(userId, hotelId, date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(userPrices).where(
    and(
      eq4(userPrices.userId, userId),
      eq4(userPrices.hotelId, hotelId),
      eq4(userPrices.date, date)
    )
  ).limit(1);
  return result.length > 0 ? result[0].customPrice : null;
}
async function getCompetitorBasePrice(hotelId, date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(priceHistory).where(
    and(eq4(priceHistory.hotelId, hotelId), eq4(priceHistory.date, date))
  ).limit(1);
  return result.length > 0 && result[0].actualPrice ? result[0].actualPrice : null;
}
async function createPriceAlert(userId, hotelId, date, userPrice, competitorPrice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const priceDifference = competitorPrice - userPrice;
  const alertType = priceDifference < 0 ? "price_lower" : priceDifference > 0 ? "price_higher" : "price_equal";
  if (alertType === "price_lower") {
    const existing = await db.select().from(priceAlerts).where(
      and(
        eq4(priceAlerts.userId, userId),
        eq4(priceAlerts.hotelId, hotelId),
        eq4(priceAlerts.date, date),
        eq4(priceAlerts.isActive, 1)
      )
    ).limit(1);
    if (existing.length > 0) {
      await db.update(priceAlerts).set({
        competitorPrice,
        priceDifference,
        alertType,
        createdAt: /* @__PURE__ */ new Date()
      }).where(eq4(priceAlerts.id, existing[0].id));
    } else {
      await db.insert(priceAlerts).values({
        userId,
        hotelId,
        date,
        userPrice,
        competitorPrice,
        priceDifference,
        alertType
      });
    }
  }
}
async function getActiveAlerts(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const alerts = await db.select({
    id: priceAlerts.id,
    hotelId: priceAlerts.hotelId,
    hotelName: hotels.name,
    date: priceAlerts.date,
    userPrice: priceAlerts.userPrice,
    competitorPrice: priceAlerts.competitorPrice,
    priceDifference: priceAlerts.priceDifference,
    alertType: priceAlerts.alertType,
    createdAt: priceAlerts.createdAt
  }).from(priceAlerts).innerJoin(hotels, eq4(priceAlerts.hotelId, hotels.id)).where(
    and(
      eq4(priceAlerts.userId, userId),
      eq4(priceAlerts.isActive, 1)
    )
  ).orderBy((t2) => t2.createdAt);
  return alerts;
}
async function dismissAlert(alertId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(priceAlerts).set({ isActive: 0, dismissedAt: /* @__PURE__ */ new Date() }).where(eq4(priceAlerts.id, alertId));
}
async function getPriceComparisonData(userId, startDate, endDate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const data = await db.select({
    hotelId: hotels.id,
    hotelName: hotels.name,
    date: priceHistory.date,
    competitorBasePrice: priceHistory.actualPrice,
    userPrice: userPrices.customPrice
  }).from(priceHistory).innerJoin(hotels, eq4(priceHistory.hotelId, hotels.id)).leftJoin(
    userPrices,
    and(
      eq4(userPrices.userId, userId),
      eq4(userPrices.hotelId, priceHistory.hotelId),
      eq4(userPrices.date, priceHistory.date)
    )
  ).where(
    and(
      gte(priceHistory.date, startDate),
      lte(priceHistory.date, endDate)
    )
  );
  return data.map((item) => ({
    ...item,
    priceDifference: item.userPrice && item.competitorBasePrice ? item.competitorBasePrice - item.userPrice : null,
    status: item.userPrice === null || item.competitorBasePrice === null ? "no_price" : item.competitorBasePrice < item.userPrice ? "losing" : item.competitorBasePrice > item.userPrice ? "winning" : "equal"
  }));
}

// server/routers/pricing.ts
var pricingRouter = router({
  /**
   * Save user's custom price for a hotel on a specific date
   */
  saveUserPrice: protectedProcedure.input(
    z3.object({
      hotelId: z3.number(),
      date: z3.string(),
      customPrice: z3.number()
    })
  ).mutation(async ({ ctx, input }) => {
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
  getUserPrice: protectedProcedure.input(
    z3.object({
      hotelId: z3.number(),
      date: z3.string()
    })
  ).query(async ({ ctx, input }) => {
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
  getCompetitorBasePrice: protectedProcedure.input(
    z3.object({
      hotelId: z3.number(),
      date: z3.string()
    })
  ).query(async ({ input }) => {
    const price = await getCompetitorBasePrice(input.hotelId, input.date);
    return { price };
  }),
  /**
   * Create or update price alert
   */
  createPriceAlert: protectedProcedure.input(
    z3.object({
      hotelId: z3.number(),
      date: z3.string(),
      userPrice: z3.number(),
      competitorPrice: z3.number()
    })
  ).mutation(async ({ ctx, input }) => {
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
  dismissAlert: protectedProcedure.input(z3.object({ alertId: z3.number() })).mutation(async ({ input }) => {
    await dismissAlert(input.alertId);
    return { success: true };
  }),
  /**
   * Get price comparison data for dashboard
   */
  getPriceComparisonData: protectedProcedure.input(
    z3.object({
      startDate: z3.string(),
      endDate: z3.string()
    })
  ).query(async ({ ctx, input }) => {
    const data = await getPriceComparisonData(
      ctx.user.id,
      input.startDate,
      input.endDate
    );
    return data;
  })
});

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  scraper: scraperRouter,
  pricing: pricingRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  })
  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path3 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path2 from "path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path2.resolve(import.meta.dirname, "client", "src"),
      "@shared": path2.resolve(import.meta.dirname, "shared"),
      "@assets": path2.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path2.resolve(import.meta.dirname),
  root: path2.resolve(import.meta.dirname, "client"),
  publicDir: path2.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path2.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path3.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path3.resolve(import.meta.dirname, "../..", "dist", "public") : path3.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path3.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
