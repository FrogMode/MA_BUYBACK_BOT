export interface TWAPConfig {
  totalAmount: number;
  intervalMs: number;
  numTrades: number;
  slippageBps: number;
  tokenIn: string;
  tokenOut: string;
}

export interface TradeExecution {
  id: string;
  timestamp: number;
  amountIn: number;
  amountOut: number;
  txHash: string;
  status: 'pending' | 'success' | 'failed';
  error?: string;
}

export interface TWAPStatus {
  isActive: boolean;
  config: TWAPConfig | null;
  tradesCompleted: number;
  totalTrades: number;
  nextTradeAt: number | null;
  startedAt: number | null;
}

export interface WalletInfo {
  address: string;
  balances: TokenBalances;
}

export interface TokenBalances {
  MOVE: number;
  USDC: number;
}

export interface WSMessage {
  type: 'trade_executed' | 'balance_update' | 'twap_status' | 'error';
  data: TradeExecution | TokenBalances | TWAPStatus | { message: string };
}

export interface SwapQuote {
  amountIn: number;
  amountOut: number;
  priceImpact: number;
  route: string[];
  // Internal: Mosaic transaction data (not exposed to clients)
  _mosaicTx?: {
    function: string;
    typeArguments: string[];
    functionArguments: (string | string[] | boolean | number)[];
  };
}
