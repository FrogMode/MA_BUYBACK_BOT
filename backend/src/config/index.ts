import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),

  // Network
  network: (process.env.NETWORK || 'testnet') as 'mainnet' | 'testnet',

  // Movement RPC endpoints
  rpcUrl: process.env.RPC_URL || getDefaultRpcUrl(),

  // DEX Configuration
  dexContractAddress: process.env.DEX_CONTRACT_ADDRESS || '',
  dexModuleName: process.env.DEX_MODULE_NAME || 'router',

  // Token addresses
  moveToken: process.env.MOVE_TOKEN || '0x1::aptos_coin::AptosCoin',
  usdcToken: process.env.USDC_TOKEN || '',

  // Wallet (optional - can be set via API)
  privateKey: process.env.PRIVATE_KEY || '',

  // Default TWAP settings
  defaultIntervalMs: parseInt(process.env.DEFAULT_INTERVAL_MS || '3600000', 10), // 1 hour
  defaultSlippageBps: parseInt(process.env.DEFAULT_SLIPPAGE_BPS || '50', 10), // 0.5%
};

function getDefaultRpcUrl(): string {
  const network = process.env.NETWORK || 'testnet';
  if (network === 'mainnet') {
    return 'https://mainnet.movementnetwork.xyz/v1';
  }
  return 'https://aptos.testnet.porto.movementlabs.xyz/v1';
}

export const MOVEMENT_NETWORKS = {
  mainnet: {
    name: 'Movement Mainnet',
    rpcUrl: 'https://mainnet.movementnetwork.xyz/v1',
    chainId: 126,
    explorerUrl: 'https://explorer.movementnetwork.xyz',
  },
  testnet: {
    name: 'Movement Porto Testnet',
    rpcUrl: 'https://aptos.testnet.porto.movementlabs.xyz/v1',
    chainId: 177,
    explorerUrl: 'https://explorer.movementnetwork.xyz/?network=porto+testnet',
  },
} as const;

export function getNetworkConfig() {
  return MOVEMENT_NETWORKS[config.network];
}
