/**
 * Sync Monitor - Tracks automatic pull cycles and sync statistics
 */

interface SyncStats {
  totalCycles: number;
  successfulCycles: number;
  failedCycles: number;
  lastSyncTime: number | null;
  lastSyncDuration: number | null;
  startTime: number;
  averageCycleDuration: number;
  totalItemsProcessed: number;
}

class SyncMonitor {
  private stats: SyncStats = {
    totalCycles: 0,
    successfulCycles: 0,
    failedCycles: 0,
    lastSyncTime: null,
    lastSyncDuration: null,
    startTime: Date.now(),
    averageCycleDuration: 0,
    totalItemsProcessed: 0,
  };

  private cycleDurations: number[] = [];

  /**
   * Record start of a sync cycle
   */
  startCycle(): number {
    return Date.now();
  }

  /**
   * Record end of a sync cycle
   */
  endCycle(
    startTime: number,
    success: boolean,
    itemsProcessed: number = 0
  ): void {
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

    // Track cycle durations for average calculation
    this.cycleDurations.push(duration);
    if (this.cycleDurations.length > 100) {
      this.cycleDurations.shift(); // Keep only last 100 cycles
    }

    // Calculate average
    this.stats.averageCycleDuration =
      this.cycleDurations.reduce((a, b) => a + b, 0) / this.cycleDurations.length;

    console.log(
      `[SyncMonitor] Cycle ${this.stats.totalCycles} completed in ${duration}ms (${success ? "SUCCESS" : "FAILED"}) - Items: ${itemsProcessed}`
    );
  }

  /**
   * Get current sync statistics
   */
  getStats(): SyncStats {
    return { ...this.stats };
  }

  /**
   * Get formatted statistics for display
   */
  getFormattedStats(): {
    totalCycles: number;
    successfulCycles: number;
    failedCycles: number;
    successRate: string;
    lastSyncTime: string | null;
    lastSyncDuration: string | null;
    uptime: string;
    averageCycleDuration: string;
    totalItemsProcessed: number;
  } {
    const uptime = this.getUptimeString();
    const successRate =
      this.stats.totalCycles > 0
        ? ((this.stats.successfulCycles / this.stats.totalCycles) * 100).toFixed(2)
        : "0";

    return {
      totalCycles: this.stats.totalCycles,
      successfulCycles: this.stats.successfulCycles,
      failedCycles: this.stats.failedCycles,
      successRate: `${successRate}%`,
      lastSyncTime: this.stats.lastSyncTime
        ? new Date(this.stats.lastSyncTime).toLocaleString("ar-SA")
        : null,
      lastSyncDuration: this.stats.lastSyncDuration
        ? `${(this.stats.lastSyncDuration / 1000).toFixed(2)}s`
        : null,
      uptime,
      averageCycleDuration: `${(this.stats.averageCycleDuration / 1000).toFixed(2)}s`,
      totalItemsProcessed: this.stats.totalItemsProcessed,
    };
  }

  /**
   * Get uptime string
   */
  private getUptimeString(): string {
    const uptimeMs = Date.now() - this.stats.startTime;
    const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((uptimeMs / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((uptimeMs / (1000 * 60)) % 60);

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
  reset(): void {
    this.stats = {
      totalCycles: 0,
      successfulCycles: 0,
      failedCycles: 0,
      lastSyncTime: null,
      lastSyncDuration: null,
      startTime: Date.now(),
      averageCycleDuration: 0,
      totalItemsProcessed: 0,
    };
    this.cycleDurations = [];
  }
}

// Export singleton instance
export const syncMonitor = new SyncMonitor();

export default syncMonitor;
