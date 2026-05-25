import { logger } from "./lib/logger.js";

  // Ping every 5 minutes — well within Render's 15-minute sleep threshold
  const PING_INTERVAL_MS = 5 * 60 * 1000;

  export function startKeepAlive(): void {
    const appUrl = process.env["APP_URL"] ?? process.env["RENDER_EXTERNAL_URL"];

    if (!appUrl) {
      logger.warn("APP_URL / RENDER_EXTERNAL_URL not set — keep-alive disabled.");
      return;
    }

    const pingUrl = `${appUrl.replace(/\/$/, "")}/api/healthz`;

    logger.info({ pingUrl, intervalMinutes: 5 }, "Keep-alive started — pinging every 5 minutes");

    const ping = async () => {
      try {
        const res = await fetch(pingUrl, { signal: AbortSignal.timeout(10_000) });
        logger.info({ status: res.status }, "Keep-alive ping OK");
      } catch (err) {
        logger.warn({ err }, "Keep-alive ping failed — will retry next cycle");
      }
    };

    // Ping immediately, then every 5 minutes forever
    ping();
    setInterval(ping, PING_INTERVAL_MS);
  }
  