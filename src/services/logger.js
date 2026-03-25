import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { mkdirSync } from "fs";

const LOG_DIR = process.env.LOG_DIR || "./logs";
mkdirSync(LOG_DIR, { recursive: true });

const fmt = winston.format;

const consoleFormat = fmt.combine(
  fmt.colorize(),
  fmt.timestamp({ format: "HH:mm:ss" }),
  fmt.printf(({ timestamp, level, message, ...meta }) => {
    const extra = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
    return `${timestamp} [${level}] ${message}${extra}`;
  })
);

const fileFormat = fmt.combine(
  fmt.timestamp(),
  fmt.json()
);

const rotateOptions = {
  datePattern: "YYYY-MM-DD",
  maxSize: process.env.LOG_MAX_SIZE || "20m",
  maxFiles: process.env.LOG_MAX_FILES || "30d",
  zippedArchive: true,
};

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new DailyRotateFile({ ...rotateOptions, filename: `${LOG_DIR}/app-%DATE%.log`, format: fileFormat }),
    new DailyRotateFile({ ...rotateOptions, filename: `${LOG_DIR}/error-%DATE%.log`, level: "error", format: fileFormat }),
  ],
});

export default logger;
