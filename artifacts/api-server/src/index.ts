import app from "./app";
import { logger } from "./lib/logger";
import { createBot } from "./bot/index";
import { startKeepAlive } from "./keepalive";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

startKeepAlive();

const telegramToken = process.env["TELEGRAM_BOT_TOKEN"];
if (telegramToken) {
  const bot = createBot();
  bot
    .start({
      onStart: (info) => {
        logger.info({ username: info.username }, "Telegram bot started");
      },
    })
    .catch((err) => {
      logger.error({ err }, "Telegram bot polling error — server continues");
    });
  logger.info("NexusAI Telegram Bot is initializing...");
} else {
  logger.warn("TELEGRAM_BOT_TOKEN not set — bot will not start");
}
