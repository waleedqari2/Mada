import * as fs from "fs";
import * as path from "path";

interface SessionData {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
  }>;
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
  timestamp: number;
  expiresAt: number; // 15 days from creation
}

const SESSION_DIR = path.join(process.cwd(), ".sessions");

/**
 * Ensure session directory exists
 */
function ensureSessionDir(): void {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

/**
 * Get session file path for a user
 */
function getSessionPath(userId: string): string {
  return path.join(SESSION_DIR, `${userId}.json`);
}

/**
 * Save session data to file
 */
export function saveSession(userId: string, sessionData: SessionData): void {
  ensureSessionDir();
  const sessionPath = getSessionPath(userId);
  fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
  console.log(`[SessionManager] Session saved for user ${userId}`);
}

/**
 * Load session data from file
 */
export function loadSession(userId: string): SessionData | null {
  ensureSessionDir();
  const sessionPath = getSessionPath(userId);

  if (!fs.existsSync(sessionPath)) {
    console.log(`[SessionManager] No session found for user ${userId}`);
    return null;
  }

  try {
    const data = fs.readFileSync(sessionPath, "utf-8");
    const session = JSON.parse(data) as SessionData;

    // Check if session has expired (15 days)
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

/**
 * Delete session data
 */
export function deleteSession(userId: string): void {
  ensureSessionDir();
  const sessionPath = getSessionPath(userId);

  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
    console.log(`[SessionManager] Session deleted for user ${userId}`);
  }
}

/**
 * Create new session data
 */
export function createSession(
  cookies: SessionData["cookies"],
  localStorage?: Record<string, string>,
  sessionStorage?: Record<string, string>
): SessionData {
  const now = Date.now();
  const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;

  return {
    cookies,
    localStorage,
    sessionStorage,
    timestamp: now,
    expiresAt: now + fifteenDaysMs,
  };
}

/**
 * Get session expiry time remaining (in days)
 */
export function getSessionExpiryDays(userId: string): number | null {
  const session = loadSession(userId);
  if (!session) return null;

  const daysRemaining = Math.ceil((session.expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(0, daysRemaining);
}

/**
 * Check if session needs 2FA verification
 */
export function isSessionNeedingVerification(userId: string): boolean {
  const session = loadSession(userId);
  if (!session) return true;

  // Check if session is older than 15 days
  const ageInDays = Math.floor((Date.now() - session.timestamp) / (24 * 60 * 60 * 1000));
  return ageInDays >= 15;
}

/**
 * Upload session from JSON file
 */
export function uploadSession(userId: string, jsonData: string): boolean {
  try {
    const sessionData = JSON.parse(jsonData) as SessionData;

    // Validate session data structure
    if (!sessionData.cookies || !Array.isArray(sessionData.cookies)) {
      throw new Error("Invalid session data: missing or invalid cookies");
    }

    // Check if session has expired
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

/**
 * Export session as JSON string
 */
export function exportSession(userId: string): string | null {
  const session = loadSession(userId);
  if (!session) return null;

  return JSON.stringify(session, null, 2);
}

export default {
  saveSession,
  loadSession,
  deleteSession,
  createSession,
  getSessionExpiryDays,
  isSessionNeedingVerification,
  uploadSession,
  exportSession,
};
