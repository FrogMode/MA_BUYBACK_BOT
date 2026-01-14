import {
  Account,
  Aptos,
  AptosConfig,
  Ed25519PrivateKey,
  Network,
  AccountAddress,
} from '@aptos-labs/ts-sdk';
import { config, getNetworkConfig } from '../config/index.js';
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
  }
  return aptosClient;
}

export function generateWallet(): { address: string; privateKey: string } {
  const account = Account.generate();
  currentAccount = account;

  return {
    address: account.accountAddress.toString(),
    privateKey: account.privateKey.toString(),
  };
}

export function importWallet(privateKeyHex: string): { address: string } {
  try {
    // Remove 0x prefix if present
    const cleanKey = privateKeyHex.startsWith('0x')
      ? privateKeyHex.slice(2)
      : privateKeyHex;

    const privateKey = new Ed25519PrivateKey(cleanKey);
    const account = Account.fromPrivateKey({ privateKey });
    currentAccount = account;

    return {
      address: account.accountAddress.toString(),
    };
  } catch (error) {
    throw new Error(`Failed to import wallet: ${error}`);
  }
}

export function getWalletAddress(): string | null {
  if (!currentAccount) {
    // Try to load from config
    if (config.privateKey) {
      importWallet(config.privateKey);
    }
  }
  return currentAccount?.accountAddress.toString() || null;
}

export function getAccount(): Account | null {
  if (!currentAccount && config.privateKey) {
    importWallet(config.privateKey);
  }
  return currentAccount;
}

export async function getBalance(): Promise<TokenBalances> {
  const account = getAccount();
  if (!account) {
    throw new Error('No wallet configured');
  }

  const aptos = getAptosClient();
  const address = account.accountAddress;

  let moveBalance = 0;
  let usdcBalance = 0;

  try {
    // Get native MOVE balance (APT equivalent on Movement)
    const resources = await aptos.getAccountResources({
      accountAddress: address,
    });

    // Find coin store for MOVE
    const moveCoinStore = resources.find(
      (r) => r.type === `0x1::coin::CoinStore<${config.moveToken}>`
    );
    if (moveCoinStore) {
      const data = moveCoinStore.data as { coin: { value: string } };
      moveBalance = parseInt(data.coin.value, 10) / 1e8; // 8 decimals
    }

    // Find coin store for USDC if configured
    if (config.usdcToken) {
      const usdcCoinStore = resources.find(
        (r) => r.type === `0x1::coin::CoinStore<${config.usdcToken}>`
      );
      if (usdcCoinStore) {
        const data = usdcCoinStore.data as { coin: { value: string } };
        usdcBalance = parseInt(data.coin.value, 10) / 1e6; // USDC typically 6 decimals
      }
    }
  } catch (error) {
    console.error('Error fetching balance:', error);
    // Account might not exist yet
  }

  return {
    MOVE: moveBalance,
    USDC: usdcBalance,
  };
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

export { getAptosClient };
