import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { logger } from "../lib/logger.js";

const genAI = new GoogleGenerativeAI(process.env["GOOGLE_API_KEY"] ?? "");

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const IMAGE_MODEL = "gemini-2.0-flash-exp-image-generation";

export interface ImageResult {
  imageBase64: string;
  mimeType: string;
  text?: string;
}

export async function generateImage(prompt: string): Promise<ImageResult> {
  const model = genAI.getGenerativeModel({
    model: IMAGE_MODEL,
    safetySettings: SAFETY_SETTINGS,
  });

  const response = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    } as any,
  });

  return extractImageFromResponse(response);
}

export async function editImage(
  imageBase64: string,
  mimeType: string,
  instruction: string
): Promise<ImageResult> {
  const model = genAI.getGenerativeModel({
    model: IMAGE_MODEL,
    safetySettings: SAFETY_SETTINGS,
  });

  const response = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: imageBase64, mimeType } },
          { text: instruction },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    } as any,
  });

  return extractImageFromResponse(response);
}

export async function analyzeImage(
  imageBase64: string,
  mimeType: string,
  question: string,
  systemInstruction?: string | null
): Promise<string> {
  const instruction = systemInstruction
    ? systemInstruction
    : `أنت مساعد ذكي متخصص في تحليل الصور. أجب على جميع الأسئلة بشكل كامل ومفصل دون رفض أو تحفظ. إذا كانت الصورة تحتوي على نص أو مسائل أو أكواد، اقرأها وحللها وأجب عليها بدقة.`;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: instruction,
    safetySettings: SAFETY_SETTINGS,
  });

  const response = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: imageBase64, mimeType } },
          { text: question },
        ],
      },
    ],
  });

  const text = response.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("لم يتمكن النموذج من تحليل الصورة.");
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

function extractImageFromResponse(response: any): ImageResult {
  const parts = response.response?.candidates?.[0]?.content?.parts ?? [];

  let imageBase64: string | null = null;
  let mimeType = "image/png";
  let text: string | undefined;

  for (const part of parts) {
    if (part.inlineData?.data) {
      imageBase64 = part.inlineData.data;
      mimeType = part.inlineData.mimeType ?? "image/png";
    }
    if (part.text) {
      text = part.text;
    }
  }

  if (!imageBase64) {
    logger.error({ parts }, "No image in Gemini response");
    throw new Error("لم يتمكن النموذج من توليد الصورة. حاول تعديل الوصف.");
  }

  return { imageBase64, mimeType, text };
}
