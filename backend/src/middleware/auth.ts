import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  // Skip auth if no API key is configured (development mode)
  if (!config.apiKey) {
    logger.warn('API key not configured - running without authentication');
    next();
    return;
  }

  const providedKey = req.header('X-API-Key');

  if (!providedKey) {
    logger.warn('API request without API key', {
      path: req.path,
      ip: req.ip,
    });
    res.status(401).json({
      success: false,
      error: 'API key required. Provide X-API-Key header.',
    });
    return;
  }

  if (providedKey !== config.apiKey) {
    logger.warn('Invalid API key provided', {
      path: req.path,
      ip: req.ip,
    });
    res.status(401).json({
      success: false,
      error: 'Invalid API key',
    });
    return;
  }

  next();
}

// Middleware to skip auth for specific routes
export function skipAuthFor(paths: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (paths.some((path) => req.path.startsWith(path))) {
      next();
      return;
    }
    apiKeyAuth(req, res, next);
  };
}
