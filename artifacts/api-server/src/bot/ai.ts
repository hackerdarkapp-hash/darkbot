import Groq from "groq-sdk";
  import { SYSTEM_PROMPT, CORE_RULES } from "./config.js";
  import { logger } from "../lib/logger.js";

  const groq = new Groq({ apiKey: process.env["GROQ_API_KEY"] ?? "" });
  const MODEL = "llama-3.3-70b-versatile";

  function buildMessages(
    systemInstruction: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    userMessage: string
  ) {
    return [
      { role: "system" as const, content: systemInstruction },
      ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: userMessage },
    ];
  }

  /**
   * Persona prompt is used AS-IS (exactly as admin wrote it),
   * then CORE_RULES are appended to guarantee no refusals.
   */
  function buildPersonaPrompt(personaPrompt: string): string {
    return `${personaPrompt.trim()}

  ---
  ${CORE_RULES}`;
  }

  export async function askAI(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    userMessage: string,
    customPersona?: string | null
  ): Promise<string> {
    const systemInstruction = customPersona
      ? buildPersonaPrompt(customPersona)
      : SYSTEM_PROMPT;

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: buildMessages(systemInstruction, messages, userMessage),
      temperature: 0.9,
      max_tokens: 8192,
    });

    const text = completion.choices[0]?.message?.content ?? "";
    if (!text) throw new Error("No response from AI");
    logger.info({ hasPersona: !!customPersona }, "AI response generated");
    return text;
  }

  export async function askAIWithMode(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    userMessage: string,
    mode: "code" | "research" | "write",
    customPersona?: string | null
  ): Promise<string> {
    const base = customPersona ? buildPersonaPrompt(customPersona) : SYSTEM_PROMPT;

    const modeInstructions: Record<string, string> = {
      code:     `${base}\n\nوضع البرمجة: اكتب كوداً نظيفاً ومحسّناً مع شرح وتعليقات.`,
      research: `${base}\n\nوضع البحث: قدم إجابة شاملة وموثوقة مع النقاط الرئيسية.`,
      write:    `${base}\n\nوضع الكتابة: اكتب نصاً متميزاً يناسب الغرض.`,
    };

    const temperature = mode === "code" ? 0.3 : 0.9;
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: buildMessages(modeInstructions[mode]!, messages, userMessage),
      temperature,
      max_tokens: 8192,
    });

    const text = completion.choices[0]?.message?.content ?? "";
    if (!text) throw new Error("No response from AI");
    return text;
  }
  