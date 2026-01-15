import { config } from '../config/index.js';
import { getAptosClient, getWalletAddress } from './wallet.js';
import { logger } from '../utils/logger.js';
import * as db from '../db/queries.js';

// Track processed transactions to avoid duplicates (in-memory cache)
const processedTxHashes = new Set<string>();
let monitoringInterval: NodeJS.Timeout | null = null;

// Load already-processed tx hashes from database on startup
let initializedFromDb = false;

interface CoinTransferEvent {
  type: string;
  data: {
    amount: string;
  };
  guid: {
    account_address: string;
  };
}

async function initializeProcessedTxHashes(): Promise<void> {
  if (initializedFromDb) return;
  
  try {
    const allDeposits = await db.getAllDepositTxHashes();
    for (const txHash of allDeposits) {
      processedTxHashes.add(txHash);
    }
    initializedFromDb = true;
    logger.debug('Loaded processed tx hashes from database', { count: allDeposits.length });
  } catch (error) {
    logger.warn('Failed to load processed tx hashes from database', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Verify a deposit transaction and record it if valid.
 * This checks the actual on-chain transaction to verify the deposit amount.
 */
export async function verifyAndRecordDeposit(
  txHash: string,
  expectedSender: string
): Promise<{
  success: boolean;
  amount?: number;
  token?: string;
  error?: string;
}> {
  const botWalletAddress = getWalletAddress();
  if (!botWalletAddress) {
    return { success: false, error: 'Bot wallet not configured' };
  }

  // Check if already processed
  if (processedTxHashes.has(txHash)) {
    return { success: false, error: 'Transaction already processed' };
  }

  const aptos = getAptosClient();

  try {
    // Fetch the transaction from chain
    const tx = await aptos.getTransactionByHash({ transactionHash: txHash });

    if (!tx || !('success' in tx) || !tx.success) {
      return { success: false, error: 'Transaction not found or failed' };
    }

    // Verify the sender matches
    if ('sender' in tx && tx.sender.toLowerCase() !== expectedSender.toLowerCase()) {
      return { success: false, error: 'Transaction sender does not match' };
    }

    // Look for coin transfer events to the bot wallet
    let depositAmount = 0;
    let tokenType: string | null = null;

    if ('events' in tx && Array.isArray(tx.events)) {
      for (const event of tx.events) {
        // Check for deposit events (0x1::coin::DepositEvent)
        if (event.type.includes('::coin::DepositEvent')) {
          const eventData = event as CoinTransferEvent;
          
          // Check if this deposit is to the bot wallet
          if (eventData.guid?.account_address?.toLowerCase() === botWalletAddress.toLowerCase()) {
            const amount = parseInt(eventData.data.amount, 10);
            
            // Determine token type from the event type
            if (event.type.includes(config.usdcToken)) {
              depositAmount = amount / 1e6; // USDC has 6 decimals
              tokenType = 'USDC';
            } else if (event.type.includes(config.moveToken)) {
              depositAmount = amount / 1e8; // MOVE has 8 decimals
              tokenType = 'MOVE';
            }
          }
        }
      }
    }

    // Also check the payload for coin::transfer calls
    if (depositAmount === 0 && 'payload' in tx) {
      const payload = tx.payload as {
        function?: string;
        type_arguments?: string[];
        arguments?: string[];
      };

      if (payload.function === '0x1::coin::transfer' || 
          payload.function === '0x1::aptos_account::transfer_coins') {
        const typeArgs = payload.type_arguments || [];
        const args = payload.arguments || [];

        // Check if transfer is to bot wallet
        if (args[0]?.toLowerCase() === botWalletAddress.toLowerCase()) {
          const rawAmount = parseInt(args[1], 10);

          if (typeArgs[0]?.includes(config.usdcToken) || typeArgs[0] === config.usdcToken) {
            depositAmount = rawAmount / 1e6;
            tokenType = 'USDC';
          } else if (typeArgs[0]?.includes(config.moveToken) || typeArgs[0] === config.moveToken) {
            depositAmount = rawAmount / 1e8;
            tokenType = 'MOVE';
          }
        }
      }
    }

    if (depositAmount <= 0 || !tokenType) {
      return { success: false, error: 'No valid deposit found in transaction' };
    }

    // Record the deposit
    await db.recordDeposit(expectedSender, tokenType, depositAmount, txHash);
    processedTxHashes.add(txHash);

    logger.info('Deposit verified and recorded', {
      txHash,
      sender: expectedSender,
      amount: depositAmount,
      token: tokenType,
    });

    return {
      success: true,
      amount: depositAmount,
      token: tokenType,
    };
  } catch (error) {
    logger.error('Failed to verify deposit', {
      error: error instanceof Error ? error.message : String(error),
      txHash,
      expectedSender,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify transaction',
    };
  }
}

/**
 * Check for new deposits to the bot wallet by scanning recent transactions.
 * This runs automatically in the background.
 */
export async function checkForNewDeposits(): Promise<number> {
  const botWalletAddress = getWalletAddress();
  if (!botWalletAddress) {
    return 0;
  }

  // Initialize from DB on first run
  await initializeProcessedTxHashes();

  const aptos = getAptosClient();
  let newDepositsFound = 0;

  try {
    // Get recent transactions for the bot wallet
    const transactions = await aptos.getAccountTransactions({
      accountAddress: botWalletAddress,
      options: { limit: 100 },
    });

    for (const tx of transactions) {
      if (!('hash' in tx) || !('success' in tx) || !tx.success) {
        continue;
      }

      // Skip if already processed
      if (processedTxHashes.has(tx.hash)) {
        continue;
      }

      // Skip if this is an outgoing transaction from the bot
      if ('sender' in tx && tx.sender.toLowerCase() === botWalletAddress.toLowerCase()) {
        processedTxHashes.add(tx.hash);
        continue;
      }

      // Check for incoming coin transfers via events
      if ('events' in tx && Array.isArray(tx.events)) {
        for (const event of tx.events) {
          // Look for deposit events to the bot wallet
          if (event.type.includes('::coin::DepositEvent') || event.type.includes('::coin::Deposit')) {
            const eventData = event as CoinTransferEvent;
            
            // Check if this deposit is to the bot wallet
            const eventAddress = eventData.guid?.account_address || '';
            if (eventAddress.toLowerCase() === botWalletAddress.toLowerCase()) {
              const amount = parseInt(eventData.data.amount, 10);
              let tokenType: string | null = null;
              let depositAmount = 0;

              // Check token type from event type string
              if (event.type.includes(config.usdcToken) || event.type.includes('usdc::USDC')) {
                depositAmount = amount / 1e6;
                tokenType = 'USDC';
              } else if (event.type.includes(config.moveToken) || event.type.includes('AptosCoin')) {
                depositAmount = amount / 1e8;
                tokenType = 'MOVE';
              }

              if (tokenType && depositAmount > 0 && 'sender' in tx) {
                const senderAddress = tx.sender;
                
                // Double-check database to avoid duplicates
                const existingDeposit = await db.getDepositByTxHash(tx.hash);
                if (!existingDeposit) {
                  await db.recordDeposit(senderAddress, tokenType, depositAmount, tx.hash);
                  newDepositsFound++;
                  
                  logger.info('Auto-detected deposit', {
                    txHash: tx.hash,
                    sender: senderAddress,
                    amount: depositAmount,
                    token: tokenType,
                  });
                }
              }
            }
          }
        }
      }

      // Also check payload for direct coin::transfer calls
      if ('payload' in tx && 'sender' in tx) {
        const payload = tx.payload as {
          function?: string;
          type_arguments?: string[];
          arguments?: string[];
        };

        if (payload.function === '0x1::coin::transfer' || 
            payload.function === '0x1::aptos_account::transfer_coins' ||
            payload.function === '0x1::aptos_account::transfer') {
          const typeArgs = payload.type_arguments || [];
          const args = payload.arguments || [];

          // Check if transfer is to bot wallet
          if (args[0]?.toLowerCase() === botWalletAddress.toLowerCase()) {
            const rawAmount = parseInt(args[1], 10);
            let tokenType: string | null = null;
            let depositAmount = 0;

            const tokenArg = typeArgs[0] || '';
            if (tokenArg.includes(config.usdcToken) || tokenArg.includes('usdc::USDC')) {
              depositAmount = rawAmount / 1e6;
              tokenType = 'USDC';
            } else if (tokenArg.includes(config.moveToken) || tokenArg.includes('AptosCoin')) {
              depositAmount = rawAmount / 1e8;
              tokenType = 'MOVE';
            }

            if (tokenType && depositAmount > 0) {
              const senderAddress = tx.sender;
              
              const existingDeposit = await db.getDepositByTxHash(tx.hash);
              if (!existingDeposit) {
                await db.recordDeposit(senderAddress, tokenType, depositAmount, tx.hash);
                newDepositsFound++;
                
                logger.info('Auto-detected deposit (from payload)', {
                  txHash: tx.hash,
                  sender: senderAddress,
                  amount: depositAmount,
                  token: tokenType,
                });
              }
            }
          }
        }
      }

      processedTxHashes.add(tx.hash);
    }

    if (newDepositsFound > 0) {
      logger.info('Deposit scan complete', { newDepositsFound });
    }
  } catch (error) {
    logger.warn('Failed to check for new deposits', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return newDepositsFound;
}

/**
 * Start monitoring for deposits in the background.
 * Checks every intervalMs for new deposits to the bot wallet.
 */
export function startDepositMonitoring(intervalMs = 10000): void {
  if (monitoringInterval) {
    logger.warn('Deposit monitoring already running');
    return;
  }

  logger.info('Starting automatic deposit monitoring', { intervalMs });

  // Run immediately
  checkForNewDeposits();

  // Then run periodically (default: every 10 seconds for faster detection)
  monitoringInterval = setInterval(checkForNewDeposits, intervalMs);
}

/**
 * Stop deposit monitoring.
 */
export function stopDepositMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    logger.info('Deposit monitoring stopped');
  }
}

/**
 * Get all deposits for a wallet address.
 */
export async function getDepositsForWallet(walletAddress: string): Promise<Array<{
  txHash: string;
  token: string;
  amount: number;
  timestamp: Date;
}>> {
  return db.getDepositsForWallet(walletAddress);
}
