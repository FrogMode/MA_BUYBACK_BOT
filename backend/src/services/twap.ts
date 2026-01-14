import { config } from '../config/index.js';
import { executeSwap, getSwapQuote } from './dex.js';
import { getBalance } from './wallet.js';
import { broadcastTradeExecution, broadcastTWAPStatus, broadcastBalanceUpdate } from './websocket.js';
import type { TWAPConfig, TWAPStatus, TradeExecution } from '../types/index.js';

let twapConfig: TWAPConfig | null = null;
let twapInterval: NodeJS.Timeout | null = null;
let tradesCompleted = 0;
let startedAt: number | null = null;
let nextTradeAt: number | null = null;
let tradeHistory: TradeExecution[] = [];

export function startTWAP(newConfig: TWAPConfig): TWAPStatus {
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

  twapConfig = newConfig;
  tradesCompleted = 0;
  startedAt = Date.now();
  nextTradeAt = Date.now(); // Execute first trade immediately

  console.log(`Starting TWAP: ${newConfig.numTrades} trades of ${newConfig.totalAmount / newConfig.numTrades} ${newConfig.tokenIn} each`);

  // Execute first trade immediately
  executeTrade();

  // Set up interval for remaining trades
  if (newConfig.numTrades > 1) {
    twapInterval = setInterval(executeTrade, newConfig.intervalMs);
    nextTradeAt = Date.now() + newConfig.intervalMs;
  }

  const status = getTWAPStatus();
  broadcastTWAPStatus(status);
  return status;
}

export function stopTWAP(): TWAPStatus {
  if (twapInterval) {
    clearInterval(twapInterval);
    twapInterval = null;
  }

  const wasActive = twapConfig !== null;
  twapConfig = null;
  nextTradeAt = null;

  if (wasActive) {
    console.log(`TWAP stopped after ${tradesCompleted} trades`);
  }

  const status = getTWAPStatus();
  broadcastTWAPStatus(status);
  return status;
}

export function getTWAPStatus(): TWAPStatus {
  return {
    isActive: twapInterval !== null || (twapConfig !== null && tradesCompleted === 0),
    config: twapConfig,
    tradesCompleted,
    totalTrades: twapConfig?.numTrades || 0,
    nextTradeAt,
    startedAt,
  };
}

export function getTradeHistory(): TradeExecution[] {
  return [...tradeHistory];
}

export function clearTradeHistory(): void {
  tradeHistory = [];
}

async function executeTrade(): Promise<void> {
  if (!twapConfig) {
    return;
  }

  const amountPerTrade = twapConfig.totalAmount / twapConfig.numTrades;
  const tradeId = `trade-${Date.now()}-${tradesCompleted + 1}`;

  const trade: TradeExecution = {
    id: tradeId,
    timestamp: Date.now(),
    amountIn: amountPerTrade,
    amountOut: 0,
    txHash: '',
    status: 'pending',
  };

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

    console.log(`Trade ${tradesCompleted + 1}/${twapConfig.numTrades}: Swapping ${amountPerTrade} for ~${quote.amountOut}`);

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

    console.log(`Trade ${tradesCompleted + 1} completed: ${txHash}`);
  } catch (error) {
    trade.status = 'failed';
    trade.error = error instanceof Error ? error.message : String(error);
    console.error(`Trade ${tradesCompleted + 1} failed:`, error);
  }

  tradeHistory.push(trade);
  tradesCompleted++;

  // Broadcast trade result
  broadcastTradeExecution(trade);

  // Update balance after trade
  try {
    const newBalance = await getBalance();
    broadcastBalanceUpdate(newBalance);
  } catch (err) {
    console.error('Failed to update balance:', err);
  }

  // Check if TWAP is complete
  if (twapConfig && tradesCompleted >= twapConfig.numTrades) {
    console.log('TWAP completed!');
    stopTWAP();
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
