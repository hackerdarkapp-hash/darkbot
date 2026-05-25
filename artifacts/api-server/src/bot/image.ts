import Groq from "groq-sdk";
  import { logger } from "../lib/logger.js";

  const groq = new Groq({ apiKey: process.env["GROQ_API_KEY"] ?? "" });

  export async function analyzeImage(
    imageBase64: string,
    mimeType: string,
    question: string,
    systemInstruction?: string | null
  ): Promise<string> {
    const instruction = systemInstruction
      ? systemInstruction
      : `أنت مساعد ذكي متخصص في تحليل الصور. أجب على جميع الأسئلة بشكل كامل ومفصل دون رفض أو تحفظ. إذا كانت الصورة تحتوي على نص أو مسائل أو أكواد، اقرأها وحللها وأجب عليها بدقة.`;

    const completion = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        { role: "system", content: instruction },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
            { type: "text", text: question },
          ] as any,
        },
      ],
      max_tokens: 4096,
    });

    const text = completion.choices[0]?.message?.content ?? "";
    if (!text) throw new Error("لم يتمكن النموذج من تحليل الصورة.");
    logger.info("Image analyzed via Groq vision");
    return text;
  }

  export function isEditInstruction(caption: string): boolean {
    const editKeywords = [
      "عدّل", "عدل", "غيّر", "غير", "أضف", "اضف", "احذف", "حذف",
      "حوّل", "حول", "أزل", "ازل", "استبدل", "ضع", "اجعل", "ابدل",
      "edit", "change", "add", "remove", "replace", "make", "transform",
      "convert", "delete", "modify", "adjust",
    ];
    const lower = caption.toLowerCase();
    return editKeywords.some((kw) => lower.startsWith(kw) || lower.includes(` ${kw} `));
  }
  