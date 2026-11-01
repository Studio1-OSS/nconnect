type RoleMessage = { role: string; content?: unknown };

/**
 * Fold every system message into one at the start, in order, for models that
 * take only one (see requiresSingleSystemMessage). Other messages keep their
 * order. A system message with no text is dropped.
 */
export function foldSystemMessages<T extends RoleMessage>(messages: T[]): T[] {
  const systemMessages = messages.filter((message) => message.role === "system");
  const first = systemMessages[0];
  if (!first || (systemMessages.length === 1 && messages[0] === first)) {
    return messages;
  }
  const text = systemMessages
    .map((message) => message.content)
    .filter((content): content is string => typeof content === "string" && content.trim() !== "");
  const rest = messages.filter((message) => message.role !== "system");
  return text.length > 0 ? [{ ...first, content: text.join("\n\n") }, ...rest] : rest;
}
