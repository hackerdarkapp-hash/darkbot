interface Message {
  role: "user" | "assistant";
  content: string;
}

const conversations = new Map<number, Message[]>();
let globalPersona: string | null = null;

export function getHistory(userId: number): Message[] {
  return conversations.get(userId) ?? [];
}

export function addMessage(userId: number, role: "user" | "assistant", content: string): void {
  if (!conversations.has(userId)) {
    conversations.set(userId, []);
  }
  const history = conversations.get(userId)!;
  history.push({ role, content });
  if (history.length > 40) {
    history.splice(0, 2);
  }
}

export function clearHistory(userId: number): void {
  conversations.delete(userId);
}

export function clearAllHistory(): void {
  conversations.clear();
}

export function setGlobalPersona(persona: string): void {
  globalPersona = persona;
}

export function getGlobalPersona(): string | null {
  return globalPersona;
}

export function clearGlobalPersona(): void {
  globalPersona = null;
}

export function getStats(): { totalUsers: number; totalMessages: number } {
  let totalMessages = 0;
  conversations.forEach((msgs) => { totalMessages += msgs.length; });
  return { totalUsers: conversations.size, totalMessages };
}
