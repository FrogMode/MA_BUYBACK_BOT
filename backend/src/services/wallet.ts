import {
  Account,
  Aptos,
  AptosConfig,
  Ed25519PrivateKey,
  Network,
} from '@aptos-labs/ts-sdk';
import { config, getNetworkConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { withRPCRetry } from '../utils/retry.js';
import type { WalletInfo, TokenBalances } from '../types/index.js';

let currentAccount: Account | null = null;
let aptosClient: Aptos | null = null;

function getAptosClient(): Aptos {
  if (!aptosClient) {
    const networkConfig = getNetworkConfig();
    const aptosConfig = new AptosConfig({
      network: Network.CUSTOM,
      fullnode: networkConfig.rpcUrl,
    });
    aptosClient = new Aptos(aptosConfig);
    logger.debug('Aptos client initialized', { rpcUrl: networkConfig.rpcUrl });
  }
  return aptosClient;
}

/**
 * Initialize wallet from environment variable.
 * This should be called on server startup.
 */
export function initializeWallet(): boolean {
  if (!config.privateKey) {
    logger.warn('No PRIVATE_KEY configured in environment');
    return false;
  }

  try {
    const cleanKey = config.privateKey.startsWith('0x')
      ? config.privateKey.slice(2)
      : config.privateKey;

    const privateKey = new Ed25519PrivateKey(cleanKey);
    const account = Account.fromPrivateKey({ privateKey });
    currentAccount = account;

    logger.info('Wallet initialized successfully', {
      address: account.accountAddress.toString(),
    });
    return true;
  } catch (error) {
    logger.error('Failed to initialize wallet from environment', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export function getWalletAddress(): string | null {
  if (!currentAccount) {
    // Try to initialize from config on first access
    if (config.privateKey) {
      initializeWallet();
    }
  }
  return currentAccount?.accountAddress.toString() || null;
}

export function getAccount(): Account | null {
  if (!currentAccount && config.privateKey) {
    initializeWallet();
  }
  return currentAccount;
}

export async function getBalance(): Promise<TokenBalances> {
  const account = getAccount();
  if (!account) {
    throw new Error('No wallet configured. Set PRIVATE_KEY environment variable.');
  }

  const aptos = getAptosClient();
  const address = account.accountAddress;

  return withRPCRetry(async () => {
    let moveBalance = 0;
    let usdcBalance = 0;

    try {
      const resources = await aptos.getAccountResources({
        accountAddress: address,
      });

      // Find coin store for MOVE
      const moveCoinStore = resources.find(
        (r) => r.type === `0x1::coin::CoinStore<${config.moveToken}>`
      );
      if (moveCoinStore) {
        const data = moveCoinStore.data as { coin: { value: string } };
        moveBalance = parseInt(data.coin.value, 10) / 1e8;
      }

      // Find coin store for USDC if configured
      if (config.usdcToken) {
        const usdcCoinStore = resources.find(
          (r) => r.type === `0x1::coin::CoinStore<${config.usdcToken}>`
        );
        if (usdcCoinStore) {
          const data = usdcCoinStore.data as { coin: { value: string } };
          usdcBalance = parseInt(data.coin.value, 10) / 1e6;
        }
      }

      logger.debug('Balance fetched successfully', {
        address: address.toString(),
        MOVE: moveBalance,
        USDC: usdcBalance,
      });
    } catch (error) {
      // Account might not exist yet - this is not necessarily an error
      logger.debug('Error fetching balance (account may not exist)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      MOVE: moveBalance,
      USDC: usdcBalance,
    };
  }, 'getBalance');
}

export async function getWalletInfo(): Promise<WalletInfo | null> {
  const address = getWalletAddress();
  if (!address) {
    return null;
  }

  const balances = await getBalance();
  return {
    address,
    balances,
  };
}

export function isWalletConfigured(): boolean {
  return currentAccount !== null || !!config.privateKey;
}

/**
 * Test RPC connectivity by making a simple call.
 * Returns the response time in milliseconds, or -1 if failed.
 */
export async function testRPCConnection(): Promise<number> {
  const aptos = getAptosClient();
  const start = Date.now();

  try {
    await aptos.getLedgerInfo();
    const duration = Date.now() - start;
    logger.debug('RPC connection test successful', { durationMs: duration });
    return duration;
  } catch (error) {
    logger.error('RPC connection test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return -1;
  }
}

/**
 * Withdraw tokens from the server wallet to a destination address.
 * This allows users to retrieve their funds if they stop a TWAP early.
 */
export async function withdrawTokens(
  destinationAddress: string,
  tokenType: string,
  amount: number
): Promise<string> {
  const account = getAccount();
  if (!account) {
    throw new Error('No wallet configured. Set PRIVATE_KEY environment variable.');
  }

  const aptos = getAptosClient();

  // Determine decimals based on token type
  const decimals = tokenType === config.moveToken ? 1e8 : 1e6;
  const rawAmount = Math.floor(amount * decimals);

  logger.info('Initiating token withdrawal', {
    from: account.accountAddress.toString(),
    to: destinationAddress,
    tokenType,
    amount,
    rawAmount,
  });

  try {
    // Build the transfer transaction
    const transaction = await aptos.transaction.build.simple({
      sender: account.accountAddress,
      data: {
        function: '0x1::coin::transfer',
        typeArguments: [tokenType],
        functionArguments: [destinationAddress, rawAmount],
      },
    });

    // Sign and submit
    const pendingTx = await aptos.signAndSubmitTransaction({
      signer: account,
      transaction,
    });

    logger.info('Withdrawal transaction submitted', {
      txHash: pendingTx.hash,
    });

    // Wait for confirmation
    const committedTx = await aptos.waitForTransaction({
      transactionHash: pendingTx.hash,
    });

    if (!committedTx.success) {
      logger.error('Withdrawal transaction failed on-chain', {
        txHash: pendingTx.hash,
        vmStatus: committedTx.vm_status,
      });
      throw new Error(`Transaction failed: ${committedTx.vm_status}`);
    }

    logger.info('Withdrawal completed successfully', {
      txHash: pendingTx.hash,
      to: destinationAddress,
      amount,
      tokenType,
    });

    return pendingTx.hash;
  } catch (error) {
    logger.error('Withdrawal failed', {
      error: error instanceof Error ? error.message : String(error),
      to: destinationAddress,
      amount,
      tokenType,
    });
    throw error;
  }
}

export { getAptosClient };
