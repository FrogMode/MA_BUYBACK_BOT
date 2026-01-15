import winston from 'winston';
import { config } from '../config/index.js';

const { combine, timestamp, printf, colorize, json } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let metaStr = '';
  if (Object.keys(metadata).length > 0) {
    metaStr = ' ' + JSON.stringify(metadata);
  }
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

// Create logger instance
export const logger = winston.createLogger({
  level: config.logLevel,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    config.nodeEnv === 'production' ? json() : combine(colorize(), devFormat)
  ),
  transports: [
    new winston.transports.Console(),
  ],
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Add file transport in production
if (config.nodeEnv === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );
}

// Create a child logger with request context
export function createRequestLogger(requestId: string) {
  return logger.child({ requestId });
}

// Log levels:
// error: 0 - Critical errors that need immediate attention
// warn: 1 - Warning conditions
// info: 2 - General operational information
// http: 3 - HTTP request logging
// verbose: 4 - Detailed information
// debug: 5 - Debug information
// silly: 6 - Extremely detailed debugging
