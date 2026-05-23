# NexusAI Bot

بوت تيليجرام ذكي يعمل بـ Gemini 2.5 Flash — يدعم المحادثة، البرمجة، البحث، الكتابة، توليد الصور وتحليلها.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server + bot (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Bot: grammY (Telegram bot framework)
- AI: Google Gemini 2.5 Flash (`@google/generative-ai`)
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/bot/` — بوت تيليجرام (index, ai, image, history, config, utils)
- `artifacts/api-server/src/keepalive.ts` — خاصية Keep-Alive (self-ping كل 14 دقيقة)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/db/src/schema/` — Drizzle DB schema

## Architecture decisions

- البوت يعمل داخل نفس Express server (الـ API server) لتبسيط الـ deployment.
- Keep-Alive يعمل عبر self-ping لـ `/api/health` كل 14 دقيقة لمنع النوم على Replit.
- الذاكرة في RAM فقط (Map) — تُمسح عند إعادة التشغيل (لا قاعدة بيانات للمحادثات).
- grammy externalized من esbuild bundle لتجنب مشاكل التجميع.

## Product

- **محادثة ذكية** مع ذاكرة المحادثة لكل مستخدم
- **4 أوضاع**: برمجة، بحث، كتابة، عام
- **توليد وتحليل وتعديل الصور** عبر Gemini
- **تحليل الملفات** (كود، JSON، CSV، وغيرها)
- **شخصية قابلة للتخصيص** (للمدير فقط)
- **Keep-Alive 24/7** لضمان عمل مستمر

## Required Environment Variables

- `TELEGRAM_BOT_TOKEN` — توكن البوت من @BotFather
- `GEMINI_API_KEY` — مفتاح Gemini API
- `ADMIN_TELEGRAM_ID` — رقم معرف المدير في تيليجرام
- `APP_URL` — رابط التطبيق على Replit (لـ keep-alive، مثال: `https://nexusai-bot.username.repl.co`)
- `DATABASE_URL` — Postgres connection string

## Gotchas

- اضبط `APP_URL` على رابط Replit الخاص بك لتفعيل Keep-Alive.
- grammy مُدرج في `external` في esbuild لأنه لا يُبندل بشكل صحيح.
- الشخصية تُمسح عند إعادة التشغيل (مخزنة في RAM).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
