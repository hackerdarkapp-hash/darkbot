import { Bot, InlineKeyboard, session, type Context, type SessionFlavor } from "grammy";
  import { logger } from "../lib/logger.js";
  import { askAI, askAIWithMode } from "./ai.js";
  import { analyzeImage } from "./image.js";
  import {
    getHistory, addMessage, clearHistory,
    setGlobalPersona, getGlobalPersona, clearGlobalPersona, clearAllHistory, getStats,
  } from "./history.js";
  import { splitMessage } from "./utils.js";

  interface SessionData {
    mode: "default" | "code" | "research" | "write";
    awaitingPersona: boolean;
  }

  type BotContext = Context & SessionFlavor<SessionData>;

  const ADMIN_ID = Number(process.env["ADMIN_TELEGRAM_ID"] ?? "0");
  function isAdmin(userId: number): boolean { return userId === ADMIN_ID; }

  const DEV_URL = "https://t.me/OX_U1";

  function userKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
      .text("🖥️ برمجة", "mode:code")
      .text("🔍 بحث", "mode:research")
      .text("✍️ كتابة", "mode:write").row()
      .text("💬 محادثة عامة", "mode:default")
      .text("🗑️ مسح محادثتي", "action:clear").row()
      .text("ℹ️ مساعدة", "action:help")
      .text("⚡ الحالة", "action:status").row()
      .url("👨‍💻 المطور", DEV_URL);
  }

  function adminKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
      .text("🖥️ برمجة", "mode:code")
      .text("🔍 بحث", "mode:research")
      .text("✍️ كتابة", "mode:write").row()
      .text("💬 محادثة عامة", "mode:default")
      .text("🗑️ مسح محادثتي", "action:clear").row()
      .text("ℹ️ مساعدة", "action:help")
      .text("⚡ الحالة", "action:status").row()
      .text("🎭 تغيير الشخصية", "admin:persona")
      .text("🔄 إزالة الشخصية", "admin:resetpersona").row()
      .text("🗑️ مسح محادثات الجميع", "admin:clearall").row()
      .text("📊 إحصائيات", "action:stats").row()
      .url("👨‍💻 المطور", DEV_URL);
  }

  const WELCOME_MESSAGE = `👋 *مرحباً في NexusAI Bot!*

  أنا مساعد ذكاء اصطناعي متطور جاهز للمساعدة في:
  🖥️ البرمجة  •  🔍 البحث  •  ✍️ الكتابة  •  💬 المحادثة الذكية

  اختر من الأزرار أدناه أو ابدأ الكتابة مباشرة 👇`;

  export function createBot(): Bot<BotContext> {
    const token = process.env["TELEGRAM_BOT_TOKEN"];
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

    const bot = new Bot<BotContext>(token);

    bot.use(session({
      initial: (): SessionData => ({
        mode: "default",
        awaitingPersona: false,
      }),
    }));

    bot.command("start", async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      const persona = getGlobalPersona();
      const personaNotice = persona ? `\n\n🎭 *الشخصية المفعّلة:*\n_${persona}_` : "";
      const kb = isAdmin(userId) ? adminKeyboard() : userKeyboard();
      await ctx.reply(WELCOME_MESSAGE + personaNotice, {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
    });

    bot.command("menu", async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      const kb = isAdmin(userId) ? adminKeyboard() : userKeyboard();
      await ctx.reply("📋 *القائمة الرئيسية*", { parse_mode: "Markdown", reply_markup: kb });
    });

    bot.command("help", async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      await sendHelp(ctx, userId);
    });

    bot.command("clear", async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      clearHistory(userId);
      ctx.session.mode = "default";
      ctx.session.awaitingPersona = false;
      const kb = isAdmin(userId) ? adminKeyboard() : userKeyboard();
      await ctx.reply("✅ تم مسح سجل محادثتك.", { reply_markup: kb });
    });

    bot.command("status", async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      await sendStatus(ctx, userId);
    });

    bot.command("stats", async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      if (!isAdmin(userId)) { await ctx.reply("⛔ هذا الأمر متاح للمدير فقط."); return; }
      await sendStats(ctx, userId);
    });

    bot.command("persona", async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      if (!isAdmin(userId)) { await ctx.reply("⛔ هذا الأمر متاح للمدير فقط."); return; }
      const inline = ctx.match?.trim();
      if (inline) {
        await applyPersona(ctx, inline);
        return;
      }
      ctx.session.awaitingPersona = true;
      await ctx.reply("🎭 اكتب وصف الشخصية الجديدة التي ستُطبَّق على جميع المستخدمين:");
    });

    bot.command("resetpersona", async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      if (!isAdmin(userId)) { await ctx.reply("⛔ هذا الأمر متاح للمدير فقط."); return; }
      await resetPersona(ctx);
    });

    bot.command("clearall", async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      if (!isAdmin(userId)) { await ctx.reply("⛔ هذا الأمر متاح للمدير فقط."); return; }
      clearAllHistory();
      await ctx.reply("✅ تم مسح محادثات جميع المستخدمين.", { reply_markup: adminKeyboard() });
    });

    bot.command("code", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      ctx.session.awaitingPersona = false;
      const q = ctx.match?.trim();
      if (!q) { ctx.session.mode = "code"; await ctx.reply("🖥️ *وضع البرمجة مفعّل!*\n\nأرسل سؤالك:", { parse_mode: "Markdown" }); return; }
      await handleAIResponse(ctx, userId, q, "code");
    });

    bot.command("research", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      ctx.session.awaitingPersona = false;
      const q = ctx.match?.trim();
      if (!q) { ctx.session.mode = "research"; await ctx.reply("🔍 *وضع البحث مفعّل!*\n\nأرسل سؤالك:", { parse_mode: "Markdown" }); return; }
      await handleAIResponse(ctx, userId, q, "research");
    });

    bot.command("write", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      ctx.session.awaitingPersona = false;
      const q = ctx.match?.trim();
      if (!q) { ctx.session.mode = "write"; await ctx.reply("✍️ *وضع الكتابة مفعّل!*\n\nماذا تريد أن أكتب؟", { parse_mode: "Markdown" }); return; }
      await handleAIResponse(ctx, userId, q, "write");
    });

    bot.callbackQuery(/^mode:(.+)$/, async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      const mode = ctx.match![1] as SessionData["mode"];
      ctx.session.mode = mode;
      ctx.session.awaitingPersona = false;
      await ctx.answerCallbackQuery();
      const labels: Record<string, string> = {
        default: "💬 *المحادثة العامة مفعّلة!*\n\nاكتب رسالتك الآن:",
        code:     "🖥️ *وضع البرمجة مفعّل!*\n\nأرسل سؤالك البرمجي:",
        research: "🔍 *وضع البحث مفعّل!*\n\nأرسل سؤالك:",
        write:    "✍️ *وضع الكتابة مفعّل!*\n\nماذا تريد أن أكتب؟",
      };
      await ctx.reply(labels[mode] ?? labels["default"]!, { parse_mode: "Markdown" });
    });

    bot.callbackQuery("action:clear", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      clearHistory(userId);
      ctx.session.mode = "default";
      ctx.session.awaitingPersona = false;
      await ctx.answerCallbackQuery("✅ تم مسح المحادثة");
      const kb = isAdmin(userId) ? adminKeyboard() : userKeyboard();
      await ctx.reply("✅ تم مسح سجل محادثتك. ابدأ من جديد!", { reply_markup: kb });
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
      await sendStats(ctx, userId);
    });

    bot.callbackQuery("admin:persona", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      if (!isAdmin(userId)) { await ctx.answerCallbackQuery("⛔ للمدير فقط"); return; }
      ctx.session.awaitingPersona = true;
      await ctx.answerCallbackQuery();
      await ctx.reply("🎭 اكتب وصف الشخصية الجديدة التي ستُطبَّق على جميع المستخدمين:");
    });

    bot.callbackQuery("admin:resetpersona", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      if (!isAdmin(userId)) { await ctx.answerCallbackQuery("⛔ للمدير فقط"); return; }
      await ctx.answerCallbackQuery();
      await resetPersona(ctx);
    });

    bot.callbackQuery("admin:clearall", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      if (!isAdmin(userId)) { await ctx.answerCallbackQuery("⛔ للمدير فقط"); return; }
      clearAllHistory();
      await ctx.answerCallbackQuery("✅ تم مسح جميع المحادثات");
      await ctx.reply("✅ تم مسح محادثات جميع المستخدمين.", { reply_markup: adminKeyboard() });
    });

    bot.on("message:document", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;

      const doc = ctx.message.document;
      const fileName = doc.file_name ?? "file";
      const fileSize = doc.file_size ?? 0;
      const caption = ctx.message.caption?.trim();

      const TEXT_EXTENSIONS = [
        ".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".htm", ".css",
        ".java", ".cpp", ".c", ".h", ".cs", ".go", ".rs", ".php",
        ".rb", ".swift", ".kt", ".sql", ".sh", ".bash", ".ps1",
        ".json", ".yaml", ".yml", ".xml", ".toml", ".ini", ".env",
        ".md", ".txt", ".csv", ".log", ".r", ".dart", ".lua",
        ".vue", ".svelte", ".graphql", ".proto", ".dockerfile",
      ];

      const ext = ("." + fileName.split(".").pop()!.toLowerCase()) as string;
      const isTextFile = TEXT_EXTENSIONS.includes(ext) || doc.mime_type?.startsWith("text/");

      if (!isTextFile) {
        await ctx.reply(
          `❌ نوع الملف *${ext}* غير مدعوم.\n\n` +
          `✅ *الأنواع المدعومة:*\n` +
          `Python, JS/TS, HTML, CSS, Java, C/C++, Go, Rust\n` +
          `SQL, JSON, YAML, XML, Markdown, TXT, CSV وغيرها`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      if (fileSize > 5 * 1024 * 1024) {
        await ctx.reply("❌ حجم الملف كبير جداً. الحد الأقصى 5MB.");
        return;
      }

      const thinkingMsg = await ctx.reply(`📄 جاري قراءة وتحليل *${fileName}*...`, { parse_mode: "Markdown" });
      const docChatId = ctx.chat?.id;

      try {
        if (docChatId) await ctx.api.sendChatAction(docChatId, "typing");

        const file = await ctx.api.getFile(doc.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${process.env["TELEGRAM_BOT_TOKEN"]}/${file.file_path}`;
        const res = await fetch(fileUrl);
        const fileContent = await res.text();

        const question = caption
          ? caption
          : `حلّل هذا الملف بالكامل. اشرح:\n1. ما الهدف من هذا الكود/الملف؟\n2. كيف يعمل؟\n3. ما أهم الأجزاء فيه؟\n4. هل هناك أي مشاكل أو تحسينات مقترحة؟`;

        const persona = getGlobalPersona();
        const prompt = `اسم الملف: ${fileName}\n\nمحتوى الملف:\n\`\`\`${ext.slice(1)}\n${fileContent}\n\`\`\`\n\n${question}`;

        const response = await askAI(getHistory(userId), prompt, persona);

        addMessage(userId, "user", `[ملف: ${fileName}] ${caption ?? "تحليل الملف"}`);
        addMessage(userId, "assistant", response);

        if (docChatId) await ctx.api.deleteMessage(docChatId, thinkingMsg.message_id);

        const parts = splitMessage(response);
        const kb = isAdmin(userId) ? adminKeyboard() : userKeyboard();
        for (let i = 0; i < parts.length; i++) {
          const isLast = i === parts.length - 1;
          try { await ctx.reply(parts[i]!, { parse_mode: "Markdown", reply_markup: isLast ? kb : undefined }); }
          catch { await ctx.reply(parts[i]!, { reply_markup: isLast ? kb : undefined }); }
        }
      } catch (err) {
        logger.error({ err, userId }, "File analysis error");
        if (docChatId) await ctx.api.deleteMessage(docChatId, thinkingMsg.message_id).catch(() => {});
        await ctx.reply(`❌ ${err instanceof Error ? err.message : "حدث خطأ أثناء تحليل الملف."}`);
      }
    });

    bot.on("message:photo", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      const caption = ctx.message.caption?.trim();
      if (!caption) {
        await ctx.reply(
          "🖼️ *أرسل الصورة مع تعليق أو سؤال لتحليلها*\n\nمثال: ما هذه المعادلة؟",
          { parse_mode: "Markdown" }
        );
        return;
      }
      const thinkingMsg = await ctx.reply("🔍 جاري تحليل الصورة...");
      const photoChatId = ctx.chat?.id;
      try {
        const photos = ctx.message.photo;
        const fileId = photos[photos.length - 1]!.file_id;
        const file = await ctx.api.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${process.env["TELEGRAM_BOT_TOKEN"]}/${file.file_path}`;
        const imgBuffer = Buffer.from(await (await fetch(fileUrl)).arrayBuffer());
        const imageBase64 = imgBuffer.toString("base64");
        if (photoChatId) await ctx.api.deleteMessage(photoChatId, thinkingMsg.message_id);
        if (photoChatId) await ctx.api.sendChatAction(photoChatId, "typing");
        const answer = await analyzeImage(imageBase64, "image/jpeg", caption, getGlobalPersona());
        const parts = splitMessage(answer);
        for (const part of parts) {
          try { await ctx.reply(part, { parse_mode: "Markdown" }); }
          catch { await ctx.reply(part); }
        }
      } catch (err) {
        logger.error({ err, userId }, "Image processing error");
        if (photoChatId) await ctx.api.deleteMessage(photoChatId, thinkingMsg.message_id).catch(() => {});
        await ctx.reply(`❌ ${err instanceof Error ? err.message : "حدث خطأ أثناء معالجة الصورة."}`);
      }
    });

    bot.on("message:text", async (ctx) => {
      const userId = ctx.from?.id; if (!userId) return;
      const text = ctx.message.text.trim();
      if (!text) return;

      if (ctx.session.awaitingPersona && isAdmin(userId)) {
        ctx.session.awaitingPersona = false;
        await applyPersona(ctx, text);
        return;
      }

      const mode = ctx.session.mode !== "default" ? ctx.session.mode : "default";
      await handleAIResponse(ctx, userId, text, mode);
      if (ctx.session.mode !== "default") ctx.session.mode = "default";
    });

    bot.catch((err) => {
      logger.error({ err: err.error, update: err.ctx.update }, "Bot error");
    });

    return bot;
  }

  async function sendHelp(ctx: BotContext, userId: number): Promise<void> {
    const adminSection = isAdmin(userId)
      ? `\n\n👑 *أوامر المدير:*\n` +
        `🎭 تغيير الشخصية — يطبّق على جميع المستخدمين\n` +
        `🔄 إزالة الشخصية — عودة للافتراضي\n` +
        `🗑️ مسح محادثات الجميع`
      : "";

    const kb = isAdmin(userId) ? adminKeyboard() : userKeyboard();
    await ctx.reply(
      `📖 *دليل الاستخدام*\n\n` +
      `*الأوضاع:*\n🖥️ برمجة  |  🔍 بحث  |  ✍️ كتابة  |  💬 عام\n\n` +
      `*الصور:*\n🖼️ أرسل صورة مع سؤال — لتحليلها\n\n` +
      `*أمثلة:*\n• اكتب: \`اشرح مفهوم الـ API\`\n• اكتب: \`اكتب كود Python لقراءة ملف CSV\`` +
      adminSection,
      { parse_mode: "Markdown", reply_markup: kb }
    );
  }

  async function sendStatus(ctx: BotContext, userId: number): Promise<void> {
    const uptime = process.uptime();
    const persona = getGlobalPersona();
    const kb = isAdmin(userId) ? adminKeyboard() : userKeyboard();
    await ctx.reply(
      `⚡ *حالة NexusAI Bot*\n\n` +
      `🟢 يعمل بشكل طبيعي\n` +
      `⏱️ وقت التشغيل: ${Math.floor(uptime / 3600)}س ${Math.floor((uptime % 3600) / 60)}د\n` +
      `🤖 النموذج: Groq llama-3.3-70b\n` +
      `🎭 الشخصية: ${persona ? `_${persona.slice(0, 80)}${persona.length > 80 ? "..." : ""}_` : "افتراضية"}`,
      { parse_mode: "Markdown", reply_markup: kb }
    );
  }

  async function applyPersona(ctx: BotContext, persona: string): Promise<void> {
    setGlobalPersona(persona);
    clearAllHistory();
    await ctx.reply(
      `🎭 *تم تفعيل الشخصية لجميع المستخدمين!*\n\nالشخصية: _${persona}_\n\nتم مسح جميع المحادثات السابقة.`,
      { parse_mode: "Markdown", reply_markup: adminKeyboard() }
    );
  }

  async function resetPersona(ctx: BotContext): Promise<void> {
    clearGlobalPersona();
    clearAllHistory();
    await ctx.reply(
      `🔄 *تمت إزالة الشخصية*\n\nالبوت عاد للوضع الافتراضي لجميع المستخدمين.`,
      { parse_mode: "Markdown", reply_markup: adminKeyboard() }
    );
  }

  async function sendStats(ctx: BotContext, userId: number): Promise<void> {
    const { totalUsers, totalMessages } = getStats();
    const uptime = process.uptime();
    await ctx.reply(
      `📊 *إحصائيات NexusAI Bot*

` +
      `👥 المستخدمون النشطون: *${totalUsers}*
` +
      `💬 إجمالي الرسائل في الذاكرة: *${totalMessages}*
` +
      `⏱️ وقت التشغيل: ${Math.floor(uptime / 3600)}س ${Math.floor((uptime % 3600) / 60)}د ${Math.floor(uptime % 60)}ث`,
      { parse_mode: "Markdown", reply_markup: adminKeyboard() }
    );
  }

  async function handleAIResponse(
    ctx: BotContext,
    userId: number,
    userMessage: string,
    mode: "default" | "code" | "research" | "write"
  ): Promise<void> {
    const indicators: Record<string, string> = {
      code: "⚙️ جاري كتابة الكود...", research: "🔍 جاري البحث والتحليل...",
      write: "✍️ جاري الكتابة...", default: "🤔 جاري التفكير...",
    };
    const thinkingMsg = await ctx.reply(indicators[mode] ?? indicators["default"]!);
    const aiChatId = ctx.chat?.id;
    try {
      if (aiChatId) await ctx.api.sendChatAction(aiChatId, "typing");
      const history = getHistory(userId);
      const persona = getGlobalPersona();
      const response = mode === "default"
        ? await askAI(history, userMessage, persona)
        : await askAIWithMode(history, userMessage, mode, persona);
      addMessage(userId, "user", userMessage);
      addMessage(userId, "assistant", response);
      if (aiChatId) await ctx.api.deleteMessage(aiChatId, thinkingMsg.message_id);
      const parts = splitMessage(response);
      const kb = isAdmin(userId) ? adminKeyboard() : userKeyboard();
      for (let i = 0; i < parts.length; i++) {
        const isLast = i === parts.length - 1;
        try { await ctx.reply(parts[i]!, { parse_mode: "Markdown", reply_markup: isLast ? kb : undefined }); }
        catch { await ctx.reply(parts[i]!, { reply_markup: isLast ? kb : undefined }); }
      }
    } catch (err) {
      logger.error({ err, userId }, "AI response error");
      if (aiChatId) await ctx.api.deleteMessage(aiChatId, thinkingMsg.message_id).catch(() => {});
      await ctx.reply(`❌ ${err instanceof Error ? err.message : "حدث خطأ. حاول مرة أخرى."}`);
    }
  }
  