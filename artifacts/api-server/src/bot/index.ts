import { Bot, InlineKeyboard, session, type Context, type SessionFlavor } from "grammy";
  import { logger } from "../lib/logger.js";
  import { askAI } from "./ai.js";
  import { analyzeImage } from "./image.js";
  import {
    getHistory, addMessage, clearHistory,
    clearAllHistory, getStats,
  } from "./history.js";
  import {
    addPersona, deletePersona, getPersona, getAllPersonas, updatePersonaName,
  } from "./personas.js";
  import { splitMessage } from "./utils.js";

  interface SessionData {
    selectedPersonaId: string;
    adminFlow: null | "awaiting_persona_name" | "awaiting_persona_prompt" | "awaiting_del_id" | "awaiting_rename_id" | "awaiting_rename_newname";
    pendingPersonaName: string | null;
    pendingRenameId: string | null;
  }

  type BotContext = Context & SessionFlavor<SessionData>;

  const ADMIN_ID = Number(process.env["ADMIN_TELEGRAM_ID"] ?? "0");
  const DEV_URL = "https://t.me/OX_U1";

  function isAdmin(userId: number): boolean { return userId === ADMIN_ID; }

  function buildUserKeyboard(): InlineKeyboard {
    const kb = new InlineKeyboard();
    const all = getAllPersonas();
    for (let i = 0; i < all.length; i++) {
      kb.text(all[i]!.name, `persona:${all[i]!.id}`);
      if ((i + 1) % 2 === 0 || i === all.length - 1) kb.row();
    }
    kb.text("🗑️ مسح المحادثة", "action:clear").text("ℹ️ مساعدة", "action:help").row()
      .text("⚡ الحالة", "action:status").url("👨‍💻 المطور", DEV_URL);
    return kb;
  }

  function buildAdminKeyboard(): InlineKeyboard {
    const kb = new InlineKeyboard();
    const all = getAllPersonas();
    for (let i = 0; i < all.length; i++) {
      kb.text(all[i]!.name, `persona:${all[i]!.id}`);
      if ((i + 1) % 2 === 0 || i === all.length - 1) kb.row();
    }
    kb.text("➕ إضافة شخصية", "admin:addpersona").text("🗑️ حذف شخصية", "admin:delpersona").row()
      .text("📋 إدارة الشخصيات", "admin:listpersonas").row()
      .text("🗑️ مسح المحادثة", "action:clear").text("⚡ الحالة", "action:status").row()
      .text("📊 إحصائيات", "action:stats").text("🔄 مسح الكل", "admin:clearall").row()
      .url("👨‍💻 المطور", DEV_URL);
    return kb;
  }

  const WELCOME_MESSAGE = `👋 *مرحباً في NexusAI Bot!*

  اختر شخصية من القائمة أدناه وابدأ المحادثة 👇
  _(البوت يرد بنفس لغتك تلقائياً)_`;

  export function createBot(): Bot<BotContext> {
    const token = process.env["TELEGRAM_BOT_TOKEN"];
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

    const bot = new Bot<BotContext>(token);

    bot.use(session({
      initial: (): SessionData => ({
        selectedPersonaId: "default",
        adminFlow: null,
        pendingPersonaName: null,
        pendingRenameId: null,
      }),
    }));

    // ── /start ──────────────────────────────────────────────
    bot.command("start", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      const kb = isAdmin(userId) ? buildAdminKeyboard() : buildUserKeyboard();
      const current = getPersona(ctx.session.selectedPersonaId);
      const notice = current ? `\n\n🎭 *الشخصية الحالية:* ${current.name}` : "";
      await ctx.reply(WELCOME_MESSAGE + notice, { parse_mode: "Markdown", reply_markup: kb });
    });

    bot.command("menu", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      const kb = isAdmin(userId) ? buildAdminKeyboard() : buildUserKeyboard();
      await ctx.reply("📋 *القائمة الرئيسية*", { parse_mode: "Markdown", reply_markup: kb });
    });

    bot.command("clear", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      clearHistory(userId);
      ctx.session.adminFlow = null;
      await ctx.reply("✅ تم مسح محادثتك.", { reply_markup: isAdmin(userId) ? buildAdminKeyboard() : buildUserKeyboard() });
    });

    bot.command("status", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      await sendStatus(ctx, userId);
    });

    bot.command("stats", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      if (!isAdmin(userId)) { await ctx.reply("⛔ للمدير فقط."); return; }
      await sendStats(ctx);
    });

    bot.command("help", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      await sendHelp(ctx, userId);
    });

    // ── ADMIN: Add Persona ───────────────────────────────────
    bot.command("addpersona", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      if (!isAdmin(userId)) { await ctx.reply("⛔ للمدير فقط."); return; }
      ctx.session.adminFlow = "awaiting_persona_name";
      await ctx.reply("📝 *إضافة شخصية جديدة*\n\nاكتب *اسم* الشخصية:", { parse_mode: "Markdown" });
    });

    bot.command("listpersonas", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      if (!isAdmin(userId)) { await ctx.reply("⛔ للمدير فقط."); return; }
      await sendPersonaList(ctx);
    });

    bot.command("clearall", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      if (!isAdmin(userId)) { await ctx.reply("⛔ للمدير فقط."); return; }
      clearAllHistory();
      await ctx.reply("✅ تم مسح محادثات جميع المستخدمين.", { reply_markup: buildAdminKeyboard() });
    });

    // ── PERSONA SELECTION ────────────────────────────────────
    bot.callbackQuery(/^persona:(.+)$/, async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      const personaId = ctx.match![1]!;
      const persona = getPersona(personaId);
      if (!persona) { await ctx.answerCallbackQuery("❌ الشخصية غير موجودة"); return; }
      ctx.session.selectedPersonaId = personaId;
      ctx.session.adminFlow = null;
      clearHistory(userId);
      await ctx.answerCallbackQuery(`✅ ${persona.name}`);
      const kb = isAdmin(userId) ? buildAdminKeyboard() : buildUserKeyboard();
      await ctx.reply(`🎭 *تم اختيار شخصية: ${persona.name}*\n\nابدأ المحادثة الآن!`, { parse_mode: "Markdown", reply_markup: kb });
    });

    // ── ADMIN CALLBACKS ──────────────────────────────────────
    bot.callbackQuery("action:clear", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      clearHistory(userId);
      ctx.session.adminFlow = null;
      await ctx.answerCallbackQuery("✅ تم مسح المحادثة");
      await ctx.reply("✅ تم مسح محادثتك.", { reply_markup: isAdmin(userId) ? buildAdminKeyboard() : buildUserKeyboard() });
    });

    bot.callbackQuery("action:help", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      await ctx.answerCallbackQuery();
      await sendHelp(ctx, userId);
    });

    bot.callbackQuery("action:status", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      await ctx.answerCallbackQuery();
      await sendStatus(ctx, userId);
    });

    bot.callbackQuery("action:stats", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      if (!isAdmin(userId)) { await ctx.answerCallbackQuery("⛔ للمدير فقط"); return; }
      await ctx.answerCallbackQuery();
      await sendStats(ctx);
    });

    bot.callbackQuery("admin:addpersona", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      if (!isAdmin(userId)) { await ctx.answerCallbackQuery("⛔ للمدير فقط"); return; }
      ctx.session.adminFlow = "awaiting_persona_name";
      await ctx.answerCallbackQuery();
      await ctx.reply("📝 *إضافة شخصية جديدة*\n\nاكتب *اسم* الشخصية:", { parse_mode: "Markdown" });
    });

    bot.callbackQuery("admin:delpersona", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      if (!isAdmin(userId)) { await ctx.answerCallbackQuery("⛔ للمدير فقط"); return; }
      await ctx.answerCallbackQuery();
      await sendPersonaList(ctx, true);
    });

    bot.callbackQuery("admin:listpersonas", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      if (!isAdmin(userId)) { await ctx.answerCallbackQuery("⛔ للمدير فقط"); return; }
      await ctx.answerCallbackQuery();
      await sendPersonaList(ctx);
    });

    bot.callbackQuery("admin:clearall", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      if (!isAdmin(userId)) { await ctx.answerCallbackQuery("⛔ للمدير فقط"); return; }
      clearAllHistory();
      await ctx.answerCallbackQuery("✅ تم مسح الكل");
      await ctx.reply("✅ تم مسح محادثات جميع المستخدمين.", { reply_markup: buildAdminKeyboard() });
    });

    // Delete persona callback: admin:del:<id>
    bot.callbackQuery(/^admin:del:(.+)$/, async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      if (!isAdmin(userId)) { await ctx.answerCallbackQuery("⛔ للمدير فقط"); return; }
      const personaId = ctx.match![1]!;
      const persona = getPersona(personaId);
      if (!persona) { await ctx.answerCallbackQuery("❌ غير موجودة"); return; }
      if (personaId === "default") { await ctx.answerCallbackQuery("⛔ لا يمكن حذف الشخصية الافتراضية"); return; }
      deletePersona(personaId);
      await ctx.answerCallbackQuery(`🗑️ حُذفت: ${persona.name}`);
      await ctx.reply(`✅ تم حذف شخصية *${persona.name}*`, { parse_mode: "Markdown", reply_markup: buildAdminKeyboard() });
    });

    // ── MESSAGES ─────────────────────────────────────────────
    bot.on("message:photo", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      const caption = ctx.message.caption?.trim();
      if (!caption) {
        await ctx.reply("🖼️ أرسل الصورة مع سؤال أو تعليق لتحليلها.");
        return;
      }
      const thinkingMsg = await ctx.reply("🔍 جاري تحليل الصورة...");
      const chatId = ctx.chat?.id;
      try {
        const photos = ctx.message.photo;
        const fileId = photos[photos.length - 1]!.file_id;
        const file = await ctx.api.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${process.env["TELEGRAM_BOT_TOKEN"]}/${file.file_path}`;
        const imgBuffer = Buffer.from(await (await fetch(fileUrl)).arrayBuffer());
        const persona = getPersona(ctx.session.selectedPersonaId);
        if (chatId) await ctx.api.deleteMessage(chatId, thinkingMsg.message_id);
        if (chatId) await ctx.api.sendChatAction(chatId, "typing");
        const answer = await analyzeImage(imgBuffer.toString("base64"), "image/jpeg", caption, persona?.prompt ?? null);
        const parts = splitMessage(answer);
        for (const part of parts) {
          try { await ctx.reply(part, { parse_mode: "Markdown" }); }
          catch { await ctx.reply(part); }
        }
      } catch (err) {
        logger.error({ err, userId }, "Image processing error");
        if (chatId) await ctx.api.deleteMessage(chatId, thinkingMsg.message_id).catch(() => {});
        await ctx.reply(`❌ ${err instanceof Error ? err.message : "حدث خطأ."}`);
      }
    });

    bot.on("message:document", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      const doc = ctx.message.document;
      const fileName = doc.file_name ?? "file";
      const fileSize = doc.file_size ?? 0;
      const caption = ctx.message.caption?.trim();
      const TEXT_EXTENSIONS = [".py",".js",".ts",".jsx",".tsx",".html",".htm",".css",".java",".cpp",".c",".h",".cs",".go",".rs",".php",".rb",".swift",".kt",".sql",".sh",".bash",".ps1",".json",".yaml",".yml",".xml",".toml",".ini",".env",".md",".txt",".csv",".log",".r",".dart",".lua",".vue",".svelte",".graphql",".proto",".dockerfile"];
      const ext = ("." + fileName.split(".").pop()!.toLowerCase());
      const isTextFile = TEXT_EXTENSIONS.includes(ext) || doc.mime_type?.startsWith("text/");
      if (!isTextFile) { await ctx.reply(`❌ نوع الملف *${ext}* غير مدعوم.`, { parse_mode: "Markdown" }); return; }
      if (fileSize > 5 * 1024 * 1024) { await ctx.reply("❌ حجم الملف كبير جداً. الحد الأقصى 5MB."); return; }
      const thinkingMsg = await ctx.reply(`📄 جاري تحليل *${fileName}*...`, { parse_mode: "Markdown" });
      const chatId = ctx.chat?.id;
      try {
        if (chatId) await ctx.api.sendChatAction(chatId, "typing");
        const file = await ctx.api.getFile(doc.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${process.env["TELEGRAM_BOT_TOKEN"]}/${file.file_path}`;
        const fileContent = await (await fetch(fileUrl)).text();
        const question = caption ?? `حلّل هذا الملف: ما هدفه، كيف يعمل، وهل هناك تحسينات؟`;
        const prompt = `اسم الملف: ${fileName}\n\n\`\`\`${ext.slice(1)}\n${fileContent}\n\`\`\`\n\n${question}`;
        const persona = getPersona(ctx.session.selectedPersonaId);
        const response = await askAI(getHistory(userId), prompt, persona?.prompt ?? null);
        addMessage(userId, "user", `[ملف: ${fileName}] ${caption ?? ""}`);
        addMessage(userId, "assistant", response);
        if (chatId) await ctx.api.deleteMessage(chatId, thinkingMsg.message_id);
        const parts = splitMessage(response);
        const kb = isAdmin(userId) ? buildAdminKeyboard() : buildUserKeyboard();
        for (let i = 0; i < parts.length; i++) {
          const isLast = i === parts.length - 1;
          try { await ctx.reply(parts[i]!, { parse_mode: "Markdown", reply_markup: isLast ? kb : undefined }); }
          catch { await ctx.reply(parts[i]!, { reply_markup: isLast ? kb : undefined }); }
        }
      } catch (err) {
        logger.error({ err, userId }, "File analysis error");
        if (chatId) await ctx.api.deleteMessage(chatId, thinkingMsg.message_id).catch(() => {});
        await ctx.reply(`❌ ${err instanceof Error ? err.message : "حدث خطأ."}`);
      }
    });

    bot.on("message:text", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      const text = ctx.message.text.trim();
      if (!text) return;

      // Admin flow: add persona step 1 - awaiting name
      if (ctx.session.adminFlow === "awaiting_persona_name" && isAdmin(userId)) {
        ctx.session.pendingPersonaName = text;
        ctx.session.adminFlow = "awaiting_persona_prompt";
        await ctx.reply(`✅ الاسم: *${text}*\n\nالآن اكتب *وصف الشخصية* (prompt) — كيف يجب أن تتصرف وتتحدث:`, { parse_mode: "Markdown" });
        return;
      }

      // Admin flow: add persona step 2 - awaiting prompt
      if (ctx.session.adminFlow === "awaiting_persona_prompt" && isAdmin(userId)) {
        const name = ctx.session.pendingPersonaName ?? "شخصية جديدة";
        const persona = addPersona(name, text);
        ctx.session.adminFlow = null;
        ctx.session.pendingPersonaName = null;
        await ctx.reply(
          `✅ *تمت إضافة الشخصية بنجاح!*\n\n🎭 الاسم: *${persona.name}*\nالمعرّف: \`${persona.id}\``,
          { parse_mode: "Markdown", reply_markup: buildAdminKeyboard() }
        );
        return;
      }

      // Normal AI response
      await handleAIResponse(ctx, userId, text);
    });

    bot.catch((err) => {
      logger.error({ err: err.error, update: err.ctx.update }, "Bot error");
    });

    return bot;
  }

  // ── HELPERS ──────────────────────────────────────────────────

  async function sendHelp(ctx: BotContext, userId: number): Promise<void> {
    const adminSection = isAdmin(userId)
      ? `\n\n👑 *أوامر المدير:*\n` +
        `➕ إضافة شخصية → زر أو /addpersona\n` +
        `🗑️ حذف شخصية → زر أو /listpersonas\n` +
        `📊 إحصائيات → /stats\n` +
        `🔄 مسح الكل → /clearall`
      : "";
    await ctx.reply(
      `📖 *دليل الاستخدام*\n\n` +
      `• اختر شخصية من الأزرار\n` +
      `• ابدأ الكتابة مباشرة\n` +
      `• أرسل صورة مع سؤال للتحليل\n` +
      `• أرسل ملف نصي/كود للتحليل\n` +
      `• البوت يرد بنفس لغتك` + adminSection,
      { parse_mode: "Markdown", reply_markup: isAdmin(userId) ? buildAdminKeyboard() : buildUserKeyboard() }
    );
  }

  async function sendStatus(ctx: BotContext, userId: number): Promise<void> {
    const uptime = process.uptime();
    const persona = getPersona(ctx.session.selectedPersonaId);
    await ctx.reply(
      `⚡ *حالة NexusAI Bot*\n\n` +
      `🟢 يعمل بشكل طبيعي\n` +
      `⏱️ وقت التشغيل: ${Math.floor(uptime / 3600)}س ${Math.floor((uptime % 3600) / 60)}د\n` +
      `🤖 النموذج: Groq llama-3.3-70b\n` +
      `🎭 شخصيتك الحالية: ${persona?.name ?? "افتراضية"}`,
      { parse_mode: "Markdown", reply_markup: isAdmin(userId) ? buildAdminKeyboard() : buildUserKeyboard() }
    );
  }

  async function sendStats(ctx: BotContext): Promise<void> {
    const { totalUsers, totalMessages } = getStats();
    const uptime = process.uptime();
    const personaCount = getAllPersonas().length;
    await ctx.reply(
      `📊 *إحصائيات NexusAI Bot*\n\n` +
      `👥 مستخدمون نشطون: *${totalUsers}*\n` +
      `💬 إجمالي الرسائل: *${totalMessages}*\n` +
      `🎭 عدد الشخصيات: *${personaCount}*\n` +
      `⏱️ وقت التشغيل: ${Math.floor(uptime / 3600)}س ${Math.floor((uptime % 3600) / 60)}د ${Math.floor(uptime % 60)}ث`,
      { parse_mode: "Markdown", reply_markup: buildAdminKeyboard() }
    );
  }

  async function sendPersonaList(ctx: BotContext, withDeleteButtons = false): Promise<void> {
    const all = getAllPersonas();
    if (all.length === 0) {
      await ctx.reply("❌ لا توجد شخصيات.");
      return;
    }
    const list = all.map((p, i) => `${i + 1}. *${p.name}*\nالمعرّف: \`${p.id}\``).join("\n\n");
    if (withDeleteButtons) {
      const kb = new InlineKeyboard();
      for (const p of all) {
        if (p.id !== "default") kb.text(`🗑️ ${p.name}`, `admin:del:${p.id}`).row();
      }
      kb.text("❌ إلغاء", "action:status");
      await ctx.reply(`📋 *اختر الشخصية للحذف:*\n\n${list}`, { parse_mode: "Markdown", reply_markup: kb });
    } else {
      await ctx.reply(`📋 *قائمة الشخصيات:*\n\n${list}`, { parse_mode: "Markdown", reply_markup: buildAdminKeyboard() });
    }
  }

  async function handleAIResponse(ctx: BotContext, userId: number, userMessage: string): Promise<void> {
    const thinkingMsg = await ctx.reply("🤔 جاري التفكير...");
    const chatId = ctx.chat?.id;
    try {
      if (chatId) await ctx.api.sendChatAction(chatId, "typing");
      const persona = getPersona(ctx.session.selectedPersonaId);
      const personaPrompt = persona
        ? `${persona.prompt}\n\nمهم: أجب دائماً بنفس لغة المستخدم تلقائياً.`
        : null;
      const response = await askAI(getHistory(userId), userMessage, personaPrompt);
      addMessage(userId, "user", userMessage);
      addMessage(userId, "assistant", response);
      if (chatId) await ctx.api.deleteMessage(chatId, thinkingMsg.message_id);
      const parts = splitMessage(response);
      const kb = isAdmin(userId) ? buildAdminKeyboard() : buildUserKeyboard();
      for (let i = 0; i < parts.length; i++) {
        const isLast = i === parts.length - 1;
        try { await ctx.reply(parts[i]!, { parse_mode: "Markdown", reply_markup: isLast ? kb : undefined }); }
        catch { await ctx.reply(parts[i]!, { reply_markup: isLast ? kb : undefined }); }
      }
    } catch (err) {
      logger.error({ err, userId }, "AI response error");
      if (chatId) await ctx.api.deleteMessage(chatId, thinkingMsg.message_id).catch(() => {});
      await ctx.reply(`❌ ${err instanceof Error ? err.message : "حدث خطأ. حاول مرة أخرى."}`);
    }
  }
  