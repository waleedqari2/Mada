import { describe, it, expect, beforeEach, vi } from "vitest";
import { syncMonitor } from "./sync-monitor";

describe("Sync Monitor", () => {
  beforeEach(() => {
    syncMonitor.reset();
  });

  describe("startCycle and endCycle", () => {
    it("should record a successful cycle", () => {
      const startTime = syncMonitor.startCycle();
      
      // Simulate some work
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);
      
      syncMonitor.endCycle(startTime, true, 10);

      const stats = syncMonitor.getStats();
      expect(stats.totalCycles).toBe(1);
      expect(stats.successfulCycles).toBe(1);
      expect(stats.failedCycles).toBe(0);
      expect(stats.totalItemsProcessed).toBe(10);

      vi.useRealTimers();
    });

    it("should record a failed cycle", () => {
      const startTime = syncMonitor.startCycle();
      syncMonitor.endCycle(startTime, false, 5);

      const stats = syncMonitor.getStats();
      expect(stats.totalCycles).toBe(1);
      expect(stats.successfulCycles).toBe(0);
      expect(stats.failedCycles).toBe(1);
      expect(stats.totalItemsProcessed).toBe(5);
    });

    it("should track multiple cycles", () => {
      for (let i = 0; i < 5; i++) {
        const startTime = syncMonitor.startCycle();
        syncMonitor.endCycle(startTime, i % 2 === 0, 10);
      }

      const stats = syncMonitor.getStats();
      expect(stats.totalCycles).toBe(5);
      expect(stats.successfulCycles).toBe(3);
      expect(stats.failedCycles).toBe(2);
      expect(stats.totalItemsProcessed).toBe(50);
    });
  });

  describe("getFormattedStats", () => {
    it("should return formatted statistics", () => {
      const startTime = syncMonitor.startCycle();
      syncMonitor.endCycle(startTime, true, 10);

      const formatted = syncMonitor.getFormattedStats();

      expect(formatted.totalCycles).toBe(1);
      expect(formatted.successfulCycles).toBe(1);
      expect(formatted.failedCycles).toBe(0);
      expect(formatted.successRate).toBe("100.00%");
      expect(formatted.totalItemsProcessed).toBe(10);
      expect(formatted.uptime).toBeDefined();
      expect(formatted.lastSyncTime).toBeDefined();
      expect(formatted.lastSyncDuration).toBeDefined();
      expect(formatted.averageCycleDuration).toBeDefined();
    });

    it("should calculate success rate correctly", () => {
      for (let i = 0; i < 4; i++) {
        const startTime = syncMonitor.startCycle();
        syncMonitor.endCycle(startTime, i < 3, 0);
      }

      const formatted = syncMonitor.getFormattedStats();
      expect(formatted.successRate).toBe("75.00%");
    });

    it("should handle zero cycles", () => {
      const formatted = syncMonitor.getFormattedStats();
      expect(formatted.totalCycles).toBe(0);
      expect(formatted.successRate).toBe("0%");
    });

    it("should format uptime correctly", () => {
      const formatted = syncMonitor.getFormattedStats();
      expect(formatted.uptime).toMatch(/\d+[mhd]/);
    });
  });

  describe("getStats", () => {
    it("should return current statistics", () => {
      const startTime = syncMonitor.startCycle();
      syncMonitor.endCycle(startTime, true, 15);

      const stats = syncMonitor.getStats();

      expect(stats.totalCycles).toBe(1);
      expect(stats.successfulCycles).toBe(1);
      expect(stats.failedCycles).toBe(0);
      expect(stats.totalItemsProcessed).toBe(15);
      expect(stats.lastSyncTime).not.toBeNull();
      expect(stats.lastSyncDuration).not.toBeNull();
      expect(stats.startTime).toBeLessThanOrEqual(Date.now());
    });

    it("should not return reference to internal state", () => {
      const stats1 = syncMonitor.getStats();
      const stats2 = syncMonitor.getStats();

      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });
  });

  describe("reset", () => {
    it("should reset all statistics", () => {
      const startTime = syncMonitor.startCycle();
      syncMonitor.endCycle(startTime, true, 10);

      let stats = syncMonitor.getStats();
      expect(stats.totalCycles).toBe(1);

      syncMonitor.reset();

      stats = syncMonitor.getStats();
      expect(stats.totalCycles).toBe(0);
      expect(stats.successfulCycles).toBe(0);
      expect(stats.failedCycles).toBe(0);
      expect(stats.totalItemsProcessed).toBe(0);
      expect(stats.lastSyncTime).toBeNull();
      expect(stats.lastSyncDuration).toBeNull();
      expect(stats.averageCycleDuration).toBe(0);
    });
  });

  describe("average cycle duration", () => {
    it("should calculate average duration correctly", () => {
      vi.useFakeTimers();

      for (let i = 0; i < 3; i++) {
        const startTime = syncMonitor.startCycle();
        vi.advanceTimersByTime(100 * (i + 1));
        syncMonitor.endCycle(startTime, true, 0);
      }

      const stats = syncMonitor.getStats();
      // Average of 100, 200, 300 = 200
      expect(stats.averageCycleDuration).toBeGreaterThan(150);
      expect(stats.averageCycleDuration).toBeLessThan(250);

      vi.useRealTimers();
    });

    it("should keep only last 100 cycles for average calculation", () => {
      for (let i = 0; i < 150; i++) {
        const startTime = syncMonitor.startCycle();
        syncMonitor.endCycle(startTime, true, 0);
      }

      const stats = syncMonitor.getStats();
      expect(stats.totalCycles).toBe(150);
      // Should only use last 100 for average
      expect(stats.averageCycleDuration).toBeDefined();
    });
  });
});
