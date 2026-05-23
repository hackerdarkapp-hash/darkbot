import { MAX_MESSAGE_LENGTH } from "./config.js";

export function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) {
    return [text];
  }

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      parts.push(remaining);
      break;
    }

    let splitAt = MAX_MESSAGE_LENGTH;

    const codeBlockEnd = remaining.lastIndexOf("```", splitAt);
    const newlineAt = remaining.lastIndexOf("\n", splitAt);

    if (codeBlockEnd > MAX_MESSAGE_LENGTH * 0.5) {
      splitAt = codeBlockEnd;
    } else if (newlineAt > MAX_MESSAGE_LENGTH * 0.5) {
      splitAt = newlineAt;
    }

    parts.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return parts;
}

export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, (char) => `\\${char}`);
}

export function formatTypingIndicator(mode: string): string {
  const indicators: Record<string, string> = {
    code: "⚙️ جاري كتابة الكود...",
    research: "🔍 جاري البحث والتحليل...",
    write: "✍️ جاري كتابة النص...",
    default: "🤔 جاري التفكير...",
  };
  return indicators[mode] ?? indicators["default"]!;
}
