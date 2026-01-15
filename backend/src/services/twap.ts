import { config } from '../config/index.js';
import { executeSwap, getSwapQuote } from './dex.js';
import { getBalance } from './wallet.js';
import { broadcastTradeExecution, broadcastTWAPStatus, broadcastBalanceUpdate } from './websocket.js';
import { logger } from '../utils/logger.js';
import * as db from '../db/queries.js';
import type { TWAPConfig, TWAPStatus, TradeExecution } from '../types/index.js';

let twapConfig: TWAPConfig | null = null;
let twapInterval: NodeJS.Timeout | null = null;
let tradesCompleted = 0;
let startedAt: number | null = null;
let nextTradeAt: number | null = null;
let currentSessionId: number | null = null;
let currentWalletAddress: string | null = null;

// In-memory cache for quick access (also persisted to DB)
let tradeHistory: TradeExecution[] = [];

export async function startTWAP(newConfig: TWAPConfig, walletAddress?: string): Promise<TWAPStatus> {
  if (twapInterval) {
    throw new Error('TWAP already running. Stop it first.');
  }

  // Validate config
  if (newConfig.totalAmount <= 0) {
    throw new Error('Total amount must be greater than 0');
  }
  if (newConfig.numTrades <= 0) {
    throw new Error('Number of trades must be greater than 0');
  }
  if (newConfig.intervalMs < 1000) {
    throw new Error('Interval must be at least 1 second');
  }

  // Validate user has enough deposited balance
  if (walletAddress) {
    const tokenInName = newConfig.tokenIn === config.moveToken ? 'MOVE' : 'USDC';
    const userBalance = await db.getWalletBalance(walletAddress, tokenInName);
    
    if (userBalance.available < newConfig.totalAmount) {
      throw new Error(
        `Insufficient deposited balance. You have ${userBalance.available.toFixed(2)} ${tokenInName} available, ` +
        `but trying to trade ${newConfig.totalAmount.toFixed(2)} ${tokenInName}. ` +
        `Please deposit more funds first.`
      );
    }

    logger.info('User balance validated for TWAP', {
      walletAddress,
      tokenIn: tokenInName,
      available: userBalance.available,
      requested: newConfig.totalAmount,
    });
  }

  twapConfig = newConfig;
  tradesCompleted = 0;
  startedAt = Date.now();
  nextTradeAt = Date.now();
  currentWalletAddress = walletAddress || null;

  const amountPerTrade = newConfig.totalAmount / newConfig.numTrades;

  logger.info('Starting TWAP session', {
    totalAmount: newConfig.totalAmount,
    numTrades: newConfig.numTrades,
    amountPerTrade,
    intervalMs: newConfig.intervalMs,
    tokenIn: newConfig.tokenIn,
    tokenOut: newConfig.tokenOut,
    walletAddress: currentWalletAddress,
  });

  // Create database session
  try {
    currentSessionId = await db.createTWAPSession(newConfig, currentWalletAddress || undefined);
    logger.info('TWAP session created in database', { sessionId: currentSessionId });
  } catch (error) {
    logger.warn('Failed to create TWAP session in database (continuing without persistence)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Execute first trade immediately
  await executeTrade();

  // Set up interval for remaining trades
  if (newConfig.numTrades > 1) {
    twapInterval = setInterval(executeTrade, newConfig.intervalMs);
    nextTradeAt = Date.now() + newConfig.intervalMs;
  }

  const status = getTWAPStatus();
  broadcastTWAPStatus(status);
  return status;
}

export async function stopTWAP(): Promise<TWAPStatus> {
  if (twapInterval) {
    clearInterval(twapInterval);
    twapInterval = null;
  }

  const wasActive = twapConfig !== null;

  // Update database session
  if (currentSessionId) {
    try {
      await db.updateTWAPSession(currentSessionId, {
        status: tradesCompleted >= (twapConfig?.numTrades || 0) ? 'completed' : 'stopped',
        stoppedAt: Date.now(),
        tradesCompleted,
      });
      logger.info('TWAP session stopped', {
        sessionId: currentSessionId,
        tradesCompleted,
        totalTrades: twapConfig?.numTrades || 0,
      });
    } catch (error) {
      logger.warn('Failed to update TWAP session in database', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  twapConfig = null;
  nextTradeAt = null;
  currentSessionId = null;
  currentWalletAddress = null;

  if (wasActive) {
    logger.info('TWAP stopped', { tradesCompleted });
  }

  const status = getTWAPStatus();
  broadcastTWAPStatus(status);
  return status;
}

export function getTWAPStatus(): TWAPStatus & { walletAddress?: string } {
  return {
    isActive: twapInterval !== null || (twapConfig !== null && tradesCompleted === 0),
    config: twapConfig,
    tradesCompleted,
    totalTrades: twapConfig?.numTrades || 0,
    nextTradeAt,
    startedAt,
    walletAddress: currentWalletAddress || undefined,
  };
}

export async function getTradeHistory(walletAddress?: string): Promise<TradeExecution[]> {
  // Try to get from database first
  try {
    const dbTrades = await db.getTradeHistory(100, walletAddress);
    if (dbTrades.length > 0) {
      return dbTrades;
    }
  } catch (error) {
    logger.warn('Failed to fetch trade history from database, using in-memory cache', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fall back to in-memory cache (filter by wallet if provided)
  if (walletAddress) {
    return tradeHistory.filter(t => (t as TradeExecution & { walletAddress?: string }).walletAddress === walletAddress);
  }
  return [...tradeHistory];
}

export async function clearTradeHistory(walletAddress?: string): Promise<void> {
  try {
    await db.clearTradeHistory(walletAddress);
    logger.info('Trade history cleared from database', { walletAddress });
  } catch (error) {
    logger.warn('Failed to clear trade history from database', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (walletAddress) {
    tradeHistory = tradeHistory.filter(t => (t as TradeExecution & { walletAddress?: string }).walletAddress !== walletAddress);
  } else {
    tradeHistory = [];
  }
}

async function executeTrade(): Promise<void> {
  if (!twapConfig) {
    return;
  }

  const amountPerTrade = twapConfig.totalAmount / twapConfig.numTrades;
  const tradeNumber = tradesCompleted + 1;
  const tradeId = `trade-${Date.now()}-${tradeNumber}`;

  logger.info('Executing trade', {
    tradeNumber,
    totalTrades: twapConfig.numTrades,
    amountPerTrade,
    sessionId: currentSessionId,
  });

  const trade: TradeExecution = {
    id: tradeId,
    timestamp: Date.now(),
    amountIn: amountPerTrade,
    amountOut: 0,
    txHash: '',
    status: 'pending',
  };

  // Persist pending trade
  try {
    await db.insertTrade(trade, currentSessionId || undefined, currentWalletAddress || undefined);
  } catch (error) {
    logger.warn('Failed to persist pending trade', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    // Check balance before trade
    const balance = await getBalance();
    const tokenInSymbol = twapConfig.tokenIn === config.moveToken ? 'MOVE' : 'USDC';
    const currentBalance = tokenInSymbol === 'MOVE' ? balance.MOVE : balance.USDC;

    if (currentBalance < amountPerTrade) {
      throw new Error(`Insufficient balance: ${currentBalance} ${tokenInSymbol} < ${amountPerTrade}`);
    }

    // Get quote
    const quote = await getSwapQuote({
      amountIn: amountPerTrade,
      tokenIn: twapConfig.tokenIn,
      tokenOut: twapConfig.tokenOut,
      slippageBps: twapConfig.slippageBps,
    });

    logger.info('Trade quote received', {
      tradeNumber,
      amountIn: amountPerTrade,
      expectedOut: quote.amountOut,
      priceImpact: quote.priceImpact,
    });

    // Execute swap
    const txHash = await executeSwap({
      amountIn: amountPerTrade,
      tokenIn: twapConfig.tokenIn,
      tokenOut: twapConfig.tokenOut,
      slippageBps: twapConfig.slippageBps,
    });

    trade.txHash = txHash;
    trade.amountOut = quote.amountOut;
    trade.status = 'success';

    logger.info('Trade completed successfully', {
      tradeNumber,
      txHash,
      amountIn: amountPerTrade,
      amountOut: quote.amountOut,
    });

    // Update trade in database
    try {
      await db.updateTradeStatus(tradeId, 'success', txHash, quote.amountOut);
    } catch (error) {
      logger.warn('Failed to update trade status in database', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Record the trade against user's balance
    if (currentWalletAddress) {
      try {
        const tokenInName = twapConfig.tokenIn === config.moveToken ? 'MOVE' : 'USDC';
        const tokenOutName = twapConfig.tokenOut === config.moveToken ? 'MOVE' : 'USDC';
        await db.recordTrade(currentWalletAddress, tokenInName, amountPerTrade, tokenOutName, quote.amountOut);
        logger.debug('Recorded trade against user balance', {
          walletAddress: currentWalletAddress,
          tokenIn: tokenInName,
          amountIn: amountPerTrade,
          tokenOut: tokenOutName,
          amountOut: quote.amountOut,
        });
      } catch (error) {
        logger.warn('Failed to record trade against user balance', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    trade.status = 'failed';
    trade.error = error instanceof Error ? error.message : String(error);

    logger.error('Trade failed', {
      tradeNumber,
      error: trade.error,
    });

    // Update trade in database
    try {
      await db.updateTradeStatus(tradeId, 'failed', undefined, undefined, trade.error);
    } catch (dbError) {
      logger.warn('Failed to update failed trade status in database', {
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }
  }

  tradeHistory.push(trade);
  tradesCompleted++;

  // Update session in database
  if (currentSessionId) {
    try {
      await db.updateTWAPSession(currentSessionId, { tradesCompleted });
    } catch (error) {
      logger.warn('Failed to update session trades completed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Broadcast trade result
  broadcastTradeExecution(trade);

  // Update balance after trade
  try {
    const newBalance = await getBalance();
    broadcastBalanceUpdate(newBalance);
  } catch (err) {
    logger.warn('Failed to update balance after trade', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Check if TWAP is complete
  if (twapConfig && tradesCompleted >= twapConfig.numTrades) {
    logger.info('TWAP session completed', {
      sessionId: currentSessionId,
      totalTrades: tradesCompleted,
    });
    await stopTWAP();
  } else if (twapInterval) {
    // Update next trade time
    nextTradeAt = Date.now() + (twapConfig?.intervalMs || 0);
    broadcastTWAPStatus(getTWAPStatus());
  }
}

export function getAmountPerTrade(): number {
  if (!twapConfig) return 0;
  return twapConfig.totalAmount / twapConfig.numTrades;
}

/**
 * Get all TWAP sessions for a specific wallet address.
 */
export async function getTWAPSessions(walletAddress?: string): Promise<Array<{
  id: number;
  config: TWAPConfig;
  startedAt: number;
  stoppedAt: number | null;
  tradesCompleted: number;
  totalTrades: number;
  status: 'active' | 'completed' | 'stopped' | 'failed';
}>> {
  try {
    const sessions = await db.getAllSessions(50, walletAddress);
    return sessions.map(s => ({
      id: s.id,
      config: typeof s.config === 'string' ? JSON.parse(s.config) : s.config,
      startedAt: parseInt(s.started_at, 10),
      stoppedAt: s.stopped_at ? parseInt(s.stopped_at, 10) : null,
      tradesCompleted: s.trades_completed,
      totalTrades: s.total_trades,
      status: s.status,
    }));
  } catch (error) {
    logger.warn('Failed to fetch TWAP sessions from database', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Get active TWAP session for a specific wallet address.
 */
export async function getActiveSessionForWallet(walletAddress: string): Promise<TWAPStatus | null> {
  try {
    const session = await db.getActiveSession(walletAddress);
    if (!session) return null;

    const sessionConfig = typeof session.config === 'string' 
      ? JSON.parse(session.config) 
      : session.config;

    return {
      isActive: true,
      config: sessionConfig,
      tradesCompleted: session.trades_completed,
      totalTrades: session.total_trades,
      nextTradeAt: null, // Can't determine this from DB alone
      startedAt: parseInt(session.started_at, 10),
    };
  } catch (error) {
    logger.warn('Failed to fetch active session for wallet', {
      error: error instanceof Error ? error.message : String(error),
      walletAddress,
    });
    return null;
  }
}

/**
 * Restore TWAP state from database on server restart.
 * Returns true if an active session was restored.
 */
export async function restoreActiveSession(): Promise<boolean> {
  try {
    const activeSession = await db.getActiveSession();
    if (!activeSession) {
      logger.debug('No active TWAP session to restore');
      return false;
    }

    logger.info('Found active TWAP session to restore', {
      sessionId: activeSession.id,
      tradesCompleted: activeSession.trades_completed,
      totalTrades: activeSession.total_trades,
    });

    // For now, we'll mark the session as stopped rather than resuming
    // Resuming would require more complex state management
    await db.updateTWAPSession(activeSession.id, {
      status: 'stopped',
      stoppedAt: Date.now(),
    });

    logger.warn('Active session marked as stopped (auto-resume not implemented)', {
      sessionId: activeSession.id,
    });

    return false;
  } catch (error) {
    logger.warn('Failed to check for active sessions', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
