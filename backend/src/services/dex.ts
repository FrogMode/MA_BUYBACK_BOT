import { config } from '../config/index.js';
import { getAccount, getAptosClient } from './wallet.js';
import { logger } from '../utils/logger.js';
import { withRPCRetry, withTxRetry } from '../utils/retry.js';
import type { SwapQuote } from '../types/index.js';

export interface SwapParams {
  amountIn: number;
  tokenIn: string;
  tokenOut: string;
  slippageBps: number;
}

// Mosaic API response types
interface MosaicQuoteResponse {
  code: number;
  message: string;
  requestId: string;
  data: {
    srcAsset: string;
    dstAsset: string;
    srcAmount: number;
    dstAmount: number;
    feeAmount: number;
    isFeeIn: boolean;
    paths: Array<{
      source: string;
      srcAsset: string;
      dstAsset: string;
      srcAmount: number;
      dstAmount: number;
    }>;
    tx: {
      function: string;
      typeArguments: string[];
      functionArguments: (string | string[] | boolean | number)[];
    };
  };
}

/**
 * Get swap quote from Mosaic Aggregator API
 */
export async function getSwapQuote(params: SwapParams): Promise<SwapQuote> {
  const { amountIn, tokenIn, tokenOut, slippageBps } = params;

  // Convert to smallest unit (raw amount)
  const amountInRaw = Math.floor(amountIn * getDecimals(tokenIn));

  // Check if Mosaic API is configured
  if (!config.mosaicApiKey) {
    logger.warn('No Mosaic API key configured, returning simulated quote');
    return getSimulatedQuote(amountIn, tokenIn, tokenOut);
  }

  const account = getAccount();
  const senderAddress = account?.accountAddress.toString() || '0x0000000000000000000000000000000000000000000000000000000000000000';

  return withRPCRetry(async () => {
    const url = new URL(`${config.mosaicApiUrl}/quote`);
    url.searchParams.set('srcAsset', tokenIn);
    url.searchParams.set('dstAsset', tokenOut);
    url.searchParams.set('amount', amountInRaw.toString());
    url.searchParams.set('sender', senderAddress);
    url.searchParams.set('slippage', slippageBps.toString());

    logger.debug('Requesting Mosaic quote', {
      url: url.toString(),
      amountIn,
      tokenIn,
      tokenOut,
      slippageBps,
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-API-Key': config.mosaicApiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Mosaic API error', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      throw new Error(`Mosaic API error: ${response.status} ${response.statusText}`);
    }

    const data: MosaicQuoteResponse = await response.json();

    if (data.code !== 0) {
      logger.error('Mosaic API returned error code', {
        code: data.code,
        message: data.message,
      });
      throw new Error(`Mosaic API error: ${data.message}`);
    }

    const amountOut = data.data.dstAmount / getDecimals(tokenOut);
    const priceImpact = calculatePriceImpact(amountIn, amountOut, tokenIn, tokenOut);

    logger.info('Mosaic quote received', {
      amountIn,
      amountOut,
      priceImpact,
      paths: data.data.paths.map(p => p.source),
      requestId: data.requestId,
    });

    return {
      amountIn,
      amountOut,
      priceImpact,
      route: data.data.paths.map(p => p.source),
      // Store the transaction data for execution
      _mosaicTx: data.data.tx,
    } as SwapQuote & { _mosaicTx: MosaicQuoteResponse['data']['tx'] };
  }, 'getSwapQuote');
}

/**
 * Execute swap using Mosaic Aggregator
 */
export async function executeSwap(params: SwapParams): Promise<string> {
  const { amountIn, tokenIn, tokenOut, slippageBps } = params;

  const account = getAccount();
  if (!account) {
    throw new Error('No wallet configured');
  }

  const aptos = getAptosClient();

  // Check if Mosaic API is configured
  if (!config.mosaicApiKey) {
    logger.warn('No Mosaic API key configured, simulating swap');
    return simulateSwap(amountIn, tokenIn, tokenOut);
  }

  // Get fresh quote with transaction data
  const quote = await getSwapQuote(params) as SwapQuote & { _mosaicTx?: MosaicQuoteResponse['data']['tx'] };
  
  if (!quote._mosaicTx) {
    throw new Error('Failed to get transaction data from Mosaic');
  }

  return withTxRetry(async () => {
    logger.info('Executing Mosaic swap', {
      amountIn,
      tokenIn,
      tokenOut,
      slippageBps,
      expectedOut: quote.amountOut,
      function: quote._mosaicTx!.function,
    });

    // Build transaction using Mosaic's response
    const transaction = await aptos.transaction.build.simple({
      sender: account.accountAddress,
      data: {
        function: quote._mosaicTx!.function as `${string}::${string}::${string}`,
        typeArguments: quote._mosaicTx!.typeArguments,
        functionArguments: quote._mosaicTx!.functionArguments,
      },
    });

    // Sign and submit
    const pendingTx = await aptos.signAndSubmitTransaction({
      signer: account,
      transaction,
    });

    logger.info('Transaction submitted, waiting for confirmation', {
      txHash: pendingTx.hash,
    });

    // Wait for transaction to be confirmed
    const committedTx = await aptos.waitForTransaction({
      transactionHash: pendingTx.hash,
    });

    if (!committedTx.success) {
      logger.error('Transaction failed on-chain', {
        txHash: pendingTx.hash,
        vmStatus: committedTx.vm_status,
      });
      throw new Error(`Transaction failed: ${committedTx.vm_status}`);
    }

    logger.info('Swap executed successfully via Mosaic', {
      txHash: pendingTx.hash,
      amountIn,
      expectedOut: quote.amountOut,
      explorerUrl: `https://explorer.movementnetwork.xyz/txn/${pendingTx.hash}`,
    });

    return pendingTx.hash;
  }, 'executeSwap');
}

/**
 * Get token decimals
 */
function getDecimals(tokenType: string): number {
  // MOVE/APT uses 8 decimals, USDC typically uses 6
  if (tokenType === config.moveToken) {
    return 1e8;
  }
  if (tokenType === config.usdcToken) {
    return 1e6;
  }
  // Default to 8 decimals for unknown tokens
  return 1e8;
}

/**
 * Calculate estimated price impact
 */
function calculatePriceImpact(
  amountIn: number,
  amountOut: number,
  _tokenIn: string,
  _tokenOut: string
): number {
  // Simplified price impact calculation
  // In production, compare against spot price from the pool
  const baseImpact = 0.1;
  const sizeMultiplier = Math.min(amountIn / 10000, 1);
  return baseImpact + sizeMultiplier * 0.5;
}

/**
 * Get simulated quote when Mosaic API is not configured
 */
function getSimulatedQuote(amountIn: number, tokenIn: string, tokenOut: string): SwapQuote {
  // Simulate a reasonable exchange rate
  // USDC -> MOVE: ~2 MOVE per USDC (example rate)
  // MOVE -> USDC: ~0.5 USDC per MOVE
  let simulatedRate: number;
  
  if (tokenIn === config.usdcToken && tokenOut === config.moveToken) {
    simulatedRate = 2.0; // 1 USDC = 2 MOVE (example)
  } else if (tokenIn === config.moveToken && tokenOut === config.usdcToken) {
    simulatedRate = 0.5; // 1 MOVE = 0.5 USDC (example)
  } else {
    simulatedRate = 1.0;
  }

  const amountOut = amountIn * simulatedRate;

  return {
    amountIn,
    amountOut,
    priceImpact: 0.1,
    route: ['simulated'],
  };
}

/**
 * Simulate swap execution (for testing without Mosaic API)
 */
function simulateSwap(amountIn: number, tokenIn: string, tokenOut: string): string {
  const quote = getSimulatedQuote(amountIn, tokenIn, tokenOut);
  
  const fakeTxHash = `0x${Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')}`;

  logger.info('Simulated swap executed', {
    txHash: fakeTxHash,
    amountIn,
    expectedOut: quote.amountOut,
  });

  return fakeTxHash;
}

/**
 * Validate slippage setting
 */
export function validateSlippage(slippageBps: number): boolean {
  // Slippage should be between 0.01% (1 bps) and 10% (1000 bps)
  return slippageBps >= 1 && slippageBps <= 1000;
}

/**
 * Get list of supported tokens from Mosaic API
 */
export async function getSupportedTokens(): Promise<Array<{ id: string; name: string; symbol: string; decimals: number }>> {
  if (!config.mosaicApiKey) {
    logger.warn('No Mosaic API key configured, returning default tokens');
    return [
      { id: config.moveToken, name: 'Movement', symbol: 'MOVE', decimals: 8 },
      { id: config.usdcToken, name: 'USD Coin', symbol: 'USDC', decimals: 6 },
    ];
  }

  try {
    const response = await fetch(`${config.mosaicApiUrl}/tokens`, {
      method: 'GET',
      headers: {
        'X-API-Key': config.mosaicApiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch tokens: ${response.status}`);
    }

    const data = await response.json();
    
    return Object.values(data.tokenById || {}).map((token: any) => ({
      id: token.id,
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
    }));
  } catch (error) {
    logger.error('Failed to fetch supported tokens from Mosaic', {
      error: error instanceof Error ? error.message : String(error),
    });
    
    // Return default tokens on error
    return [
      { id: config.moveToken, name: 'Movement', symbol: 'MOVE', decimals: 8 },
      { id: config.usdcToken, name: 'USD Coin', symbol: 'USDC', decimals: 6 },
    ];
  }
}
