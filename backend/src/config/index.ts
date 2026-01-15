import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Network
  network: (process.env.NETWORK || 'mainnet') as 'mainnet' | 'testnet',

  // Movement RPC endpoints
  rpcUrl: process.env.RPC_URL || getDefaultRpcUrl(),

  // Mosaic DEX Aggregator Configuration
  mosaicApiUrl: process.env.MOSAIC_API_URL || 'https://api.mosaic.ag/v1',
  mosaicApiKey: process.env.MOSAIC_API_KEY || '',

  // Legacy DEX Configuration (fallback if Mosaic not configured)
  dexContractAddress: process.env.DEX_CONTRACT_ADDRESS || '',
  dexModuleName: process.env.DEX_MODULE_NAME || 'router',

  // Token addresses (Movement Mainnet)
  moveToken: process.env.MOVE_TOKEN || '0x1::aptos_coin::AptosCoin',
  usdcToken: process.env.USDC_TOKEN || '0x83121c9f9b0527d1f056e21a950d6bf3b9e9e2e8353d0e95ccea726713cbea39::usdc::USDC',

  // Wallet (loaded from environment only for security)
  privateKey: process.env.PRIVATE_KEY || '',

  // Default TWAP settings
  defaultIntervalMs: parseInt(process.env.DEFAULT_INTERVAL_MS || '3600000', 10), // 1 hour
  defaultSlippageBps: parseInt(process.env.DEFAULT_SLIPPAGE_BPS || '50', 10), // 0.5%

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/twap_bot',

  // Authentication
  apiKey: process.env.API_KEY || '',

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
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
