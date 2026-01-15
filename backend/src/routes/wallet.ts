import { Router, Request, Response } from 'express';
import {
  getBalance,
  getWalletAddress,
  isWalletConfigured,
  withdrawTokens,
} from '../services/wallet.js';
import { getDepositsForWallet, checkForNewDeposits } from '../services/deposits.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import * as db from '../db/queries.js';

const router = Router();

// Note: POST /generate and POST /import have been removed for security.
// Wallet must be configured via PRIVATE_KEY environment variable.

router.get('/balance', async (_req: Request, res: Response) => {
  try {
    if (!isWalletConfigured()) {
      res.status(400).json({
        success: false,
        error: 'No wallet configured. Set PRIVATE_KEY environment variable.',
      });
      return;
    }

    const balance = await getBalance();
    res.json({
      success: true,
      data: balance,
    });
  } catch (error) {
    logger.error('Failed to get balance', {
      error: error instanceof Error ? error.message : String(error),
    });
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
        error: 'No wallet configured. Set PRIVATE_KEY environment variable.',
      });
      return;
    }

    res.json({
      success: true,
      data: { address },
    });
  } catch (error) {
    logger.error('Failed to get address', {
      error: error instanceof Error ? error.message : String(error),
    });
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
    logger.error('Failed to get wallet status', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get wallet status',
    });
  }
});

/**
 * Get wallet balance tracking for a specific user wallet.
 * Shows how much they've deposited, withdrawn, traded, and what's available.
 */
router.get('/user-balance/:walletAddress', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;

    if (!walletAddress) {
      res.status(400).json({
        success: false,
        error: 'Wallet address is required',
      });
      return;
    }

    const balances = await db.getAllWalletBalances(walletAddress);

    // Ensure both USDC and MOVE are present
    const usdcBalance = balances['USDC'] || { deposited: 0, withdrawn: 0, traded: 0, available: 0 };
    const moveBalance = balances['MOVE'] || { deposited: 0, withdrawn: 0, traded: 0, available: 0 };

    res.json({
      success: true,
      data: {
        USDC: usdcBalance,
        MOVE: moveBalance,
      },
    });
  } catch (error) {
    logger.error('Failed to get user balance', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get user balance',
    });
  }
});

/**
 * Get deposit history for a wallet.
 * Deposits are automatically detected - no manual action needed.
 */
router.get('/deposits/:walletAddress', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;

    if (!walletAddress) {
      res.status(400).json({
        success: false,
        error: 'Wallet address is required',
      });
      return;
    }

    const deposits = await getDepositsForWallet(walletAddress);

    res.json({
      success: true,
      data: deposits,
    });
  } catch (error) {
    logger.error('Failed to get deposits', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get deposits',
    });
  }
});

/**
 * Trigger a manual scan for new deposits.
 * Useful when user wants to check immediately instead of waiting for the next automatic scan.
 */
router.post('/scan-deposits', async (_req: Request, res: Response) => {
  try {
    logger.info('Manual deposit scan triggered');
    const newDeposits = await checkForNewDeposits();

    res.json({
      success: true,
      data: {
        newDepositsFound: newDeposits,
      },
    });
  } catch (error) {
    logger.error('Failed to scan for deposits', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to scan for deposits',
    });
  }
});

/**
 * Withdraw tokens from the server wallet back to user's wallet.
 * This is used when a user stops a TWAP early and wants their remaining funds back.
 * Only allows withdrawal up to what the user has deposited (minus traded amounts).
 */
router.post('/withdraw', async (req: Request, res: Response) => {
  try {
    if (!isWalletConfigured()) {
      res.status(400).json({
        success: false,
        error: 'No wallet configured. Set PRIVATE_KEY environment variable.',
      });
      return;
    }

    const { destinationAddress, token, amount } = req.body;

    // Validate inputs
    if (!destinationAddress || typeof destinationAddress !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Destination address is required',
      });
      return;
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({
        success: false,
        error: 'Amount must be a positive number',
      });
      return;
    }

    // Normalize token name
    let tokenName: string;
    let tokenType: string;
    if (token === 'USDC' || token === config.usdcToken) {
      tokenName = 'USDC';
      tokenType = config.usdcToken;
    } else if (token === 'MOVE' || token === config.moveToken) {
      tokenName = 'MOVE';
      tokenType = config.moveToken;
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid token. Use "USDC" or "MOVE"',
      });
      return;
    }

    // Check user's available balance (what they deposited minus withdrawals and trades)
    const userBalance = await db.getWalletBalance(destinationAddress, tokenName);
    
    if (userBalance.available < amount) {
      res.status(400).json({
        success: false,
        error: `Insufficient balance. You can withdraw up to ${userBalance.available.toFixed(tokenName === 'USDC' ? 2 : 4)} ${tokenName}. (Deposited: ${userBalance.deposited.toFixed(2)}, Withdrawn: ${userBalance.withdrawn.toFixed(2)}, Traded: ${userBalance.traded.toFixed(2)})`,
      });
      return;
    }

    // Also check the bot wallet has enough funds
    const botBalance = await getBalance();
    const botAvailable = tokenName === 'USDC' ? botBalance.USDC : botBalance.MOVE;

    if (botAvailable < amount) {
      res.status(400).json({
        success: false,
        error: `Bot wallet has insufficient ${tokenName}. Available: ${botAvailable.toFixed(tokenName === 'USDC' ? 2 : 4)}`,
      });
      return;
    }

    logger.info('Processing withdrawal request', {
      destinationAddress,
      token: tokenName,
      amount,
      userAvailable: userBalance.available,
    });

    const txHash = await withdrawTokens(destinationAddress, tokenType, amount);

    // Record the withdrawal
    await db.recordWithdrawal(destinationAddress, tokenName, amount, txHash, 'success');

    // Get updated balance
    const updatedBalance = await db.getWalletBalance(destinationAddress, tokenName);

    res.json({
      success: true,
      data: {
        txHash,
        amount,
        token: tokenName,
        destinationAddress,
        remainingBalance: updatedBalance,
      },
    });
  } catch (error) {
    logger.error('Failed to withdraw tokens', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to withdraw tokens',
    });
  }
});

export default router;
