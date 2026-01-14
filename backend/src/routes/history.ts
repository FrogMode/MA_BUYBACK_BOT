import { Router, Request, Response } from 'express';
import { getTradeHistory, clearTradeHistory } from '../services/twap.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const history = getTradeHistory();

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get trade history',
    });
  }
});

router.delete('/', async (_req: Request, res: Response) => {
  try {
    clearTradeHistory();

    res.json({
      success: true,
      message: 'Trade history cleared',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear trade history',
    });
  }
});

export default router;
