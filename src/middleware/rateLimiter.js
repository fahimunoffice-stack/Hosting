import rateLimit from "express-rate-limit";

export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000"),
  max: parseInt(process.env.RATE_LIMIT_MAX || "30"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait 60 seconds." },
  skip: req => req.path.includes("/health"),
});
