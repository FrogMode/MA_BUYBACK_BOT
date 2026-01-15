import { logger } from './logger.js';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'retryableErrors' | 'onRetry'>> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: Error, retryableErrors?: string[]): boolean {
  const errorMessage = error.message.toLowerCase();

  // Default retryable errors (network/RPC related)
  const defaultRetryable = [
    'timeout',
    'econnreset',
    'econnrefused',
    'socket hang up',
    'network',
    'rate limit',
    '429',
    '502',
    '503',
    '504',
  ];

  const patterns = retryableErrors || defaultRetryable;

  return patterns.some((pattern) => errorMessage.includes(pattern.toLowerCase()));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt === opts.maxAttempts || !isRetryableError(lastError, opts.retryableErrors)) {
        logger.error(`${operationName} failed after ${attempt} attempt(s)`, {
          error: lastError.message,
          attempt,
          maxAttempts: opts.maxAttempts,
        });
        throw lastError;
      }

      // Log retry attempt
      logger.warn(`${operationName} failed, retrying...`, {
        error: lastError.message,
        attempt,
        nextAttempt: attempt + 1,
        delayMs: delay,
      });

      // Call optional retry callback
      if (opts.onRetry) {
        opts.onRetry(attempt, lastError, delay);
      }

      // Wait before retrying
      await sleep(delay);

      // Calculate next delay with exponential backoff
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error(`${operationName} failed`);
}

// Convenience wrapper for RPC calls
export async function withRPCRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  return withRetry(operation, operationName, {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    retryableErrors: [
      'timeout',
      'econnreset',
      'econnrefused',
      'socket hang up',
      'network',
      'rate limit',
      '429',
      '502',
      '503',
      '504',
      'too many requests',
    ],
  });
}

// Convenience wrapper for transaction submissions
export async function withTxRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  return withRetry(operation, operationName, {
    maxAttempts: 2, // Fewer retries for transactions to avoid double-spending
    initialDelayMs: 2000,
    maxDelayMs: 5000,
    backoffMultiplier: 1.5,
    retryableErrors: [
      'timeout',
      'econnreset',
      'network',
      'sequence number',
      'transaction expired',
    ],
  });
}
