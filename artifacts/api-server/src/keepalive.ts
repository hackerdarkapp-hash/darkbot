import { logger } from "./lib/logger.js";

  /**
   * Anti-sleep keep-alive — pings the health endpoint every 60 seconds.
   * Render free tier sleeps after 15 min of inactivity; 60s is well within that.
   * Cannot be disabled once started.
   */
  const PING_INTERVAL_MS = 60 * 1000; // 1 minute

  export function startKeepAlive(): void {
    const appUrl = process.env["APP_URL"] ?? process.env["RENDER_EXTERNAL_URL"];

    if (!appUrl) {
      logger.warn("APP_URL / RENDER_EXTERNAL_URL not set — keep-alive disabled. Set it to your Render URL.");
      return;
    }

    const pingUrl = `${appUrl.replace(/\/$/, "")}/api/healthz`;
    logger.info({ pingUrl, intervalSeconds: 60 }, "Keep-alive started — pinging every 60 seconds (cannot be stopped)");

    const ping = async () => {
      try {
        const res = await fetch(pingUrl, { signal: AbortSignal.timeout(8_000) });
        if (!res.ok) logger.warn({ status: res.status }, "Keep-alive ping returned non-OK");
      } catch (err) {
        logger.warn({ err }, "Keep-alive ping failed — retrying next cycle");
      }
    };

    // Immediate ping + repeat every 60s forever
    ping();
    setInterval(ping, PING_INTERVAL_MS).unref?.();
  }
  