import { Router, Request, Response } from 'express';
import { startTWAP, stopTWAP, getTWAPStatus, getTWAPSessions, getActiveSessionForWallet } from '../services/twap.js';
import { getSwapQuote, validateSlippage } from '../services/dex.js';
import { isWalletConfigured } from '../services/wallet.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { TWAPConfig } from '../types/index.js';

const router = Router();

router.post('/start', async (req: Request, res: Response) => {
  try {
    if (!isWalletConfigured()) {
      res.status(400).json({
        success: false,
        error: 'No wallet configured. Set PRIVATE_KEY environment variable.',
      });
      return;
    }

    const {
      totalAmount,
      intervalMs = config.defaultIntervalMs,
      numTrades,
      slippageBps = config.defaultSlippageBps,
      tokenIn = config.usdcToken,
      tokenOut = config.moveToken,
      walletAddress,
    } = req.body;

    // Validation
    if (!totalAmount || totalAmount <= 0) {
      res.status(400).json({
        success: false,
        error: 'Total amount must be greater than 0',
      });
      return;
    }

    if (!numTrades || numTrades <= 0) {
      res.status(400).json({
        success: false,
        error: 'Number of trades must be greater than 0',
      });
      return;
    }

    if (!validateSlippage(slippageBps)) {
      res.status(400).json({
        success: false,
        error: 'Slippage must be between 0.01% (1 bps) and 10% (1000 bps)',
      });
      return;
    }

    const twapConfig: TWAPConfig = {
      totalAmount,
      intervalMs,
      numTrades,
      slippageBps,
      tokenIn,
      tokenOut,
    };

    logger.info('Starting TWAP via API', {
      totalAmount,
      numTrades,
      intervalMs,
      slippageBps,
      walletAddress,
    });

    const status = await startTWAP(twapConfig, walletAddress);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Failed to start TWAP', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start TWAP',
    });
  }
});

router.post('/stop', async (_req: Request, res: Response) => {
  try {
    logger.info('Stopping TWAP via API');
    const status = await stopTWAP();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Failed to stop TWAP', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop TWAP',
    });
  }
});

router.get('/status', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.query;
    
    // If wallet address provided, check for active session for that wallet
    if (walletAddress && typeof walletAddress === 'string') {
      const currentStatus = getTWAPStatus();
      
      // If there's an active TWAP for this wallet, return it
      if (currentStatus.isActive && currentStatus.walletAddress === walletAddress) {
        res.json({
          success: true,
          data: currentStatus,
        });
        return;
      }
      
      // Otherwise check database for any active session
      const dbSession = await getActiveSessionForWallet(walletAddress);
      if (dbSession) {
        res.json({
          success: true,
          data: dbSession,
        });
        return;
      }
      
      // No active session for this wallet
      res.json({
        success: true,
        data: {
          isActive: false,
          config: null,
          tradesCompleted: 0,
          totalTrades: 0,
          nextTradeAt: null,
          startedAt: null,
        },
      });
      return;
    }
    
    // No wallet specified, return current in-memory status
    const status = getTWAPStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Failed to get TWAP status', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get TWAP status',
    });
  }
});

router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.query;
    const sessions = await getTWAPSessions(
      typeof walletAddress === 'string' ? walletAddress : undefined
    );

    res.json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    logger.error('Failed to get TWAP sessions', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get TWAP sessions',
    });
  }
});

router.post('/quote', async (req: Request, res: Response) => {
  try {
    const {
      amountIn,
      tokenIn = config.usdcToken,
      tokenOut = config.moveToken,
      slippageBps = config.defaultSlippageBps,
    } = req.body;

    if (!amountIn || amountIn <= 0) {
      res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0',
      });
      return;
    }

    const quote = await getSwapQuote({
      amountIn,
      tokenIn,
      tokenOut,
      slippageBps,
    });

    res.json({
      success: true,
      data: quote,
    });
  } catch (error) {
    logger.error('Failed to get quote', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get quote',
    });
  }
});

export default router;
