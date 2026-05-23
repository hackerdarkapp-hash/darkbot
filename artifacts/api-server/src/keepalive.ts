import { logger } from "./lib/logger.js";

const PING_INTERVAL_MS = 14 * 60 * 1000;

export function startKeepAlive(): void {
  const appUrl = process.env["APP_URL"];

  if (!appUrl) {
    logger.warn("APP_URL not set — keep-alive self-ping disabled. Set APP_URL to your Replit URL to enable 24/7 uptime.");
    return;
  }

  const pingUrl = `${appUrl.replace(/\/$/, "")}/api/health`;

  logger.info({ pingUrl, intervalMinutes: 14 }, "Keep-alive started — pinging every 14 minutes");

  setInterval(async () => {
    try {
      const res = await fetch(pingUrl, { signal: AbortSignal.timeout(10_000) });
      logger.info({ status: res.status }, "Keep-alive ping OK");
    } catch (err) {
      logger.warn({ err }, "Keep-alive ping failed");
    }
  }, PING_INTERVAL_MS);
}
