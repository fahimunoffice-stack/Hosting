export function validateChatRequest(req, res, next) {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0)
    return res.status(400).json({ error: "messages must be a non-empty array" });
  if (messages.length > 50)
    return res.status(400).json({ error: "Max 50 messages in history" });
  for (const m of messages) {
    if (!["user", "assistant"].includes(m.role))
      return res.status(400).json({ error: `Invalid role: ${m.role}` });
    if (typeof m.content !== "string" || m.content.length > 8000)
      return res.status(400).json({ error: "Message content must be a string under 8000 chars" });
  }
  if (messages.at(-1).role !== "user")
    return res.status(400).json({ error: "Last message must be from user" });
  next();
}
