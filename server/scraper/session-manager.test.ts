import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as sessionManager from "./session-manager";
import * as fs from "fs";
import * as path from "path";

const TEST_USER_ID = "test-user-123";
const SESSION_DIR = path.join(process.cwd(), ".sessions");

describe("Session Manager", () => {
  beforeEach(() => {
    // Clean up test session if it exists
    const sessionPath = path.join(SESSION_DIR, `${TEST_USER_ID}.json`);
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }
  });

  afterEach(() => {
    // Clean up after tests
    const sessionPath = path.join(SESSION_DIR, `${TEST_USER_ID}.json`);
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }
  });

  describe("createSession", () => {
    it("should create a new session with 15-day expiry", () => {
      const cookies = [
        {
          name: "test-cookie",
          value: "test-value",
          domain: "example.com",
          path: "/",
        },
      ];

      const session = sessionManager.createSession(cookies);

      expect(session.cookies).toEqual(cookies);
      expect(session.timestamp).toBeLessThanOrEqual(Date.now());
      expect(session.expiresAt).toBeGreaterThan(Date.now());

      // Check that expiry is approximately 15 days from now
      const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
      const expiryDiff = session.expiresAt - session.timestamp;
      expect(expiryDiff).toBeGreaterThan(fifteenDaysMs - 1000);
      expect(expiryDiff).toBeLessThan(fifteenDaysMs + 1000);
    });

    it("should include localStorage and sessionStorage if provided", () => {
      const cookies = [];
      const localStorage = { key: "value" };
      const sessionStorage = { sessionKey: "sessionValue" };

      const session = sessionManager.createSession(
        cookies,
        localStorage,
        sessionStorage
      );

      expect(session.localStorage).toEqual(localStorage);
      expect(session.sessionStorage).toEqual(sessionStorage);
    });
  });

  describe("saveSession and loadSession", () => {
    it("should save and load session correctly", () => {
      const cookies = [
        {
          name: "auth-token",
          value: "abc123",
          domain: "webbeds.com",
          path: "/",
        },
      ];
      const session = sessionManager.createSession(cookies);

      sessionManager.saveSession(TEST_USER_ID, session);
      const loaded = sessionManager.loadSession(TEST_USER_ID);

      expect(loaded).not.toBeNull();
      expect(loaded?.cookies).toEqual(cookies);
      expect(loaded?.timestamp).toBe(session.timestamp);
    });

    it("should return null for non-existent session", () => {
      const loaded = sessionManager.loadSession("non-existent-user");
      expect(loaded).toBeNull();
    });

    it("should return null for expired session", () => {
      const cookies = [];
      const session = sessionManager.createSession(cookies);

      // Manually set expiry to past
      session.expiresAt = Date.now() - 1000;

      sessionManager.saveSession(TEST_USER_ID, session);
      const loaded = sessionManager.loadSession(TEST_USER_ID);

      expect(loaded).toBeNull();
    });
  });

  describe("deleteSession", () => {
    it("should delete session file", () => {
      const cookies = [];
      const session = sessionManager.createSession(cookies);

      sessionManager.saveSession(TEST_USER_ID, session);
      expect(sessionManager.loadSession(TEST_USER_ID)).not.toBeNull();

      sessionManager.deleteSession(TEST_USER_ID);
      expect(sessionManager.loadSession(TEST_USER_ID)).toBeNull();
    });

    it("should handle deletion of non-existent session gracefully", () => {
      expect(() => {
        sessionManager.deleteSession("non-existent-user");
      }).not.toThrow();
    });
  });

  describe("getSessionExpiryDays", () => {
    it("should return days remaining for valid session", () => {
      const cookies = [];
      const session = sessionManager.createSession(cookies);

      sessionManager.saveSession(TEST_USER_ID, session);
      const daysRemaining = sessionManager.getSessionExpiryDays(TEST_USER_ID);

      expect(daysRemaining).not.toBeNull();
      expect(daysRemaining).toBeGreaterThan(0);
      expect(daysRemaining).toBeLessThanOrEqual(15);
    });

    it("should return null for non-existent session", () => {
      const daysRemaining = sessionManager.getSessionExpiryDays(
        "non-existent-user"
      );
      expect(daysRemaining).toBeNull();
    });

    it("should return null for expired session", () => {
      const cookies = [];
      const session = sessionManager.createSession(cookies);
      session.expiresAt = Date.now() - 1000;

      sessionManager.saveSession(TEST_USER_ID, session);
      const daysRemaining = sessionManager.getSessionExpiryDays(TEST_USER_ID);

      expect(daysRemaining).toBeNull();
    });
  });

  describe("isSessionNeedingVerification", () => {
    it("should return true for non-existent session", () => {
      const needsVerification = sessionManager.isSessionNeedingVerification(
        "non-existent-user"
      );
      expect(needsVerification).toBe(true);
    });

    it("should return false for fresh session", () => {
      const cookies = [];
      const session = sessionManager.createSession(cookies);

      sessionManager.saveSession(TEST_USER_ID, session);
      const needsVerification = sessionManager.isSessionNeedingVerification(
        TEST_USER_ID
      );

      expect(needsVerification).toBe(false);
    });

    it("should return true for 15+ day old session", () => {
      const cookies = [];
      const session = sessionManager.createSession(cookies);

      // Set timestamp to 15+ days ago
      session.timestamp = Date.now() - 16 * 24 * 60 * 60 * 1000;

      sessionManager.saveSession(TEST_USER_ID, session);
      const needsVerification = sessionManager.isSessionNeedingVerification(
        TEST_USER_ID
      );

      expect(needsVerification).toBe(true);
    });
  });

  describe("uploadSession and exportSession", () => {
    it("should upload and export session correctly", () => {
      const cookies = [
        {
          name: "test",
          value: "value",
          domain: "test.com",
          path: "/",
        },
      ];
      const session = sessionManager.createSession(cookies);
      const sessionJson = JSON.stringify(session);

      const success = sessionManager.uploadSession(TEST_USER_ID, sessionJson);
      expect(success).toBe(true);

      const exported = sessionManager.exportSession(TEST_USER_ID);
      expect(exported).not.toBeNull();

      const parsedExported = JSON.parse(exported!);
      expect(parsedExported.cookies).toEqual(cookies);
    });

    it("should reject invalid session JSON", () => {
      const success = sessionManager.uploadSession(
        TEST_USER_ID,
        "invalid json"
      );
      expect(success).toBe(false);
    });

    it("should reject session without cookies", () => {
      const invalidSession = JSON.stringify({
        timestamp: Date.now(),
        expiresAt: Date.now() + 1000,
      });

      const success = sessionManager.uploadSession(
        TEST_USER_ID,
        invalidSession
      );
      expect(success).toBe(false);
    });

    it("should reject expired session", () => {
      const cookies = [];
      const session = sessionManager.createSession(cookies);
      session.expiresAt = Date.now() - 1000;

      const sessionJson = JSON.stringify(session);
      const success = sessionManager.uploadSession(TEST_USER_ID, sessionJson);

      expect(success).toBe(false);
    });

    it("should return null when exporting non-existent session", () => {
      const exported = sessionManager.exportSession("non-existent-user");
      expect(exported).toBeNull();
    });
  });
});
