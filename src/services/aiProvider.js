// ─────────────────────────────────────────────────────────────
//  aiProvider.js
//  Universal AI service — supports Claude, OpenAI, DeepSeek,
//  Groq, Gemini, OpenRouter and any OpenAI-compatible endpoint.
//
//  Usage:
//    import { streamAI, callAI } from "./aiProvider.js"
//    await streamAI({ res, system, messages, provider: "groq" })
//    const text = await callAI({ system, messages, provider: "claude" })
// ─────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// ── Provider configs ──────────────────────────────────────────
const PROVIDERS = {
  claude: {
    type: "anthropic",
    model: () => process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
    apiKey: () => process.env.ANTHROPIC_API_KEY,
  },
  openai: {
    type: "openai",
    model: () => process.env.OPENAI_MODEL || "gpt-4o",
    apiKey: () => process.env.OPENAI_API_KEY,
    baseURL: "https://api.openai.com/v1",
  },
  deepseek: {
    type: "openai",
    model: () => process.env.DEEPSEEK_MODEL || "deepseek-chat",
    apiKey: () => process.env.DEEPSEEK_API_KEY,
    baseURL: () => process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  },
  groq: {
    type: "openai",
    model: () => process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    apiKey: () => process.env.GROQ_API_KEY,
    baseURL: () => process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
  },
  gemini: {
    type: "openai",
    model: () => process.env.GEMINI_MODEL || "gemini-2.0-flash",
    apiKey: () => process.env.GEMINI_API_KEY,
    baseURL: () => process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  openrouter: {
    type: "openai",
    model: () => process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4",
    apiKey: () => process.env.OPENROUTER_API_KEY,
    baseURL: () => process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  },
};

// ── Resolve which provider to use ─────────────────────────────
function resolveProvider(requested) {
  const name = (requested || process.env.AI_PROVIDER || "claude").toLowerCase();
  const config = PROVIDERS[name];
  if (!config) throw new Error(`Unknown AI provider: "${name}". Valid: ${Object.keys(PROVIDERS).join(", ")}`);
  if (!config.apiKey()) throw new Error(`API key not set for provider "${name}". Check your .env file.`);
  return { name, config };
}

// ── Build OpenAI client for compatible providers ──────────────
function buildOpenAIClient(config) {
  return new OpenAI({
    apiKey: config.apiKey(),
    baseURL: typeof config.baseURL === "function" ? config.baseURL() : config.baseURL,
  });
}

// ─────────────────────────────────────────────────────────────
//  streamAI — streams response as SSE to Express res
//  Works with both Claude (native) and all OpenAI-compatible APIs
// ─────────────────────────────────────────────────────────────
export async function streamAI({ res, system, messages, provider: requestedProvider }) {
  const { name, config } = resolveProvider(requestedProvider);
  const maxTokens = parseInt(process.env.MAX_TOKENS || "3000");

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("X-AI-Provider", name);

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    // ── Claude (native Anthropic SDK) ────────────────────────
    if (config.type === "anthropic") {
      const client = new Anthropic({ apiKey: config.apiKey() });
      const stream = await client.messages.stream({
        model: config.model(),
        max_tokens: maxTokens,
        system,
        messages,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          send("chunk", { text: event.delta.text });
        }
      }

      const final = await stream.finalMessage();
      send("done", {
        provider: name,
        model: config.model(),
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
      });

    // ── OpenAI-compatible (OpenAI, DeepSeek, Groq, Gemini, OpenRouter) ──
    } else {
      const client = buildOpenAIClient(config);
      const stream = await client.chat.completions.create({
        model: config.model(),
        max_tokens: maxTokens,
        stream: true,
        messages: [
          { role: "system", content: system },
          ...messages,
        ],
      });

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) send("chunk", { text });
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens || 0;
          outputTokens = chunk.usage.completion_tokens || 0;
        }
      }

      send("done", {
        provider: name,
        model: config.model(),
        inputTokens,
        outputTokens,
      });
    }

    res.end();

  } catch (err) {
    send("error", { message: err.message, provider: name });
    res.end();
  }
}

// ─────────────────────────────────────────────────────────────
//  callAI — non-streaming, returns { text, provider, model }
//  Used for structured JSON analysis (log analyzer)
// ─────────────────────────────────────────────────────────────
export async function callAI({ system, messages, provider: requestedProvider, json = false }) {
  const { name, config } = resolveProvider(requestedProvider);
  const maxTokens = parseInt(process.env.MAX_TOKENS || "3000");

  // ── Claude ───────────────────────────────────────────────
  if (config.type === "anthropic") {
    const client = new Anthropic({ apiKey: config.apiKey() });
    const response = await client.messages.create({
      model: config.model(),
      max_tokens: maxTokens,
      system,
      messages,
    });
    return {
      text: response.content[0]?.text || "",
      provider: name,
      model: config.model(),
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

  // ── OpenAI-compatible ────────────────────────────────────
  } else {
    const client = buildOpenAIClient(config);
    const response = await client.chat.completions.create({
      model: config.model(),
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: system },
        ...messages,
      ],
    });
    return {
      text: response.choices[0]?.message?.content || "",
      provider: name,
      model: config.model(),
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
    };
  }
}

// ─────────────────────────────────────────────────────────────
//  listProviders — returns configured provider status
// ─────────────────────────────────────────────────────────────
export function listProviders() {
  return Object.entries(PROVIDERS).map(([name, config]) => ({
    name,
    type: config.type,
    model: config.model(),
    configured: !!config.apiKey(),
    isDefault: name === (process.env.AI_PROVIDER || "claude"),
  }));
}
