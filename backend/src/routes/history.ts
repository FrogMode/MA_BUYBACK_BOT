import { Router, Request, Response } from 'express';
import { getTradeHistory, clearTradeHistory } from '../services/twap.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.query;
    const history = await getTradeHistory(
      typeof walletAddress === 'string' ? walletAddress : undefined
    );

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    logger.error('Failed to get trade history', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get trade history',
    });
  }
});

router.delete('/', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.query;
    await clearTradeHistory(
      typeof walletAddress === 'string' ? walletAddress : undefined
    );

    logger.info('Trade history cleared via API', { walletAddress });
    res.json({
      success: true,
      message: 'Trade history cleared',
    });
  } catch (error) {
    logger.error('Failed to clear trade history', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear trade history',
    });
  }
});

export default router;
