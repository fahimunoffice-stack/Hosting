import { Router } from "express";
import { streamAI } from "../services/aiProvider.js";
import { websitePrompt, dashboardPrompt } from "../prompts/systemPrompts.js";
import { validateChatRequest } from "../middleware/validators.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";

const router = Router();

// POST /api/chat/website — public pre-sales chat (SSE streaming)
router.post("/website", validateChatRequest, async (req, res) => {
  const { messages, provider } = req.body;
  await streamAI({ res, system: websitePrompt(), messages, provider });
});

// POST /api/chat/dashboard — authenticated client panel chat (SSE streaming)
router.post("/dashboard", requireAuth, validateChatRequest, async (req, res) => {
  const { messages, provider, userContext } = req.body;
  const ctx = { ...req.user, ...userContext };
  await streamAI({ res, system: dashboardPrompt(ctx), messages, provider });
});

export default router;
