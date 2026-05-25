import { logger } from "./lib/logger.js";

  const PING_INTERVAL_MS = 14 * 60 * 1000;

  export function startKeepAlive(): void {
    // Support APP_URL or Render's automatic RENDER_EXTERNAL_URL
    const appUrl = process.env["APP_URL"] ?? process.env["RENDER_EXTERNAL_URL"];

    if (!appUrl) {
      logger.warn("APP_URL / RENDER_EXTERNAL_URL not set — keep-alive disabled.");
      return;
    }

    const pingUrl = `${appUrl.replace(/\/$/, "")}/api/healthz`;

    logger.info({ pingUrl, intervalMinutes: 14 }, "Keep-alive started — pinging every 14 minutes");

    // Ping immediately on start then every 14 minutes
    const ping = async () => {
      try {
        const res = await fetch(pingUrl, { signal: AbortSignal.timeout(10_000) });
        logger.info({ status: res.status }, "Keep-alive ping OK");
      } catch (err) {
        logger.warn({ err }, "Keep-alive ping failed");
      }
    };

    ping();
    setInterval(ping, PING_INTERVAL_MS);
  }
  