import { Router, Request, Response } from 'express';
import {
  generateWallet,
  importWallet,
  getBalance,
  getWalletAddress,
  isWalletConfigured,
} from '../services/wallet.js';

const router = Router();

router.post('/generate', async (_req: Request, res: Response) => {
  try {
    const wallet = generateWallet();
    res.json({
      success: true,
      data: wallet,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate wallet',
    });
  }
});

router.post('/import', async (req: Request, res: Response) => {
  try {
    const { privateKey } = req.body;

    if (!privateKey) {
      res.status(400).json({
        success: false,
        error: 'Private key is required',
      });
      return;
    }

    const wallet = importWallet(privateKey);
    res.json({
      success: true,
      data: wallet,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import wallet',
    });
  }
});

router.get('/balance', async (_req: Request, res: Response) => {
  try {
    if (!isWalletConfigured()) {
      res.status(400).json({
        success: false,
        error: 'No wallet configured',
      });
      return;
    }

    const balance = await getBalance();
    res.json({
      success: true,
      data: balance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get balance',
    });
  }
});

router.get('/address', async (_req: Request, res: Response) => {
  try {
    const address = getWalletAddress();

    if (!address) {
      res.status(400).json({
        success: false,
        error: 'No wallet configured',
      });
      return;
    }

    res.json({
      success: true,
      data: { address },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get address',
    });
  }
});

router.get('/status', async (_req: Request, res: Response) => {
  try {
    const configured = isWalletConfigured();
    const address = getWalletAddress();

    res.json({
      success: true,
      data: {
        configured,
        address,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get wallet status',
    });
  }
});

export default router;
