import { InputGenerateTransactionPayloadData } from '@aptos-labs/ts-sdk';
import { config } from '../config/index.js';
import { getAccount, getAptosClient } from './wallet.js';
import type { SwapQuote } from '../types/index.js';

export interface SwapParams {
  amountIn: number;
  tokenIn: string;
  tokenOut: string;
  slippageBps: number;
}

export async function getSwapQuote(params: SwapParams): Promise<SwapQuote> {
  const { amountIn, tokenIn, tokenOut } = params;

  // Convert to smallest unit
  const amountInRaw = Math.floor(amountIn * getDecimals(tokenIn));

  // For a real DEX integration, you would call the DEX's view function
  // This is a placeholder that simulates getting a quote
  // In production, replace with actual DEX contract call

  const aptos = getAptosClient();

  if (!config.dexContractAddress) {
    // Simulate quote when no DEX is configured (for testing)
    console.warn('No DEX contract configured, returning simulated quote');
    const simulatedRate = tokenIn === config.usdcToken ? 0.5 : 2.0; // Mock rate
    const amountOut = amountIn * simulatedRate;

    return {
      amountIn,
      amountOut,
      priceImpact: 0.1, // 0.1%
      route: [tokenIn, tokenOut],
    };
  }

  try {
    // Example: Call DEX view function to get quote
    // This structure depends on the specific DEX you're integrating with
    const result = await aptos.view({
      payload: {
        function: `${config.dexContractAddress}::${config.dexModuleName}::get_amount_out`,
        typeArguments: [tokenIn, tokenOut],
        functionArguments: [amountInRaw.toString()],
      },
    });

    const amountOutRaw = parseInt(result[0] as string, 10);
    const amountOut = amountOutRaw / getDecimals(tokenOut);

    // Calculate price impact (simplified)
    const priceImpact = calculatePriceImpact(amountIn, amountOut, tokenIn, tokenOut);

    return {
      amountIn,
      amountOut,
      priceImpact,
      route: [tokenIn, tokenOut],
    };
  } catch (error) {
    console.error('Error getting swap quote:', error);
    throw new Error(`Failed to get swap quote: ${error}`);
  }
}

export async function executeSwap(params: SwapParams): Promise<string> {
  const { amountIn, tokenIn, tokenOut, slippageBps } = params;

  const account = getAccount();
  if (!account) {
    throw new Error('No wallet configured');
  }

  const aptos = getAptosClient();

  // Get quote first to calculate minimum output
  const quote = await getSwapQuote(params);
  const minAmountOut = Math.floor(
    quote.amountOut * (1 - slippageBps / 10000) * getDecimals(tokenOut)
  );

  const amountInRaw = Math.floor(amountIn * getDecimals(tokenIn));

  if (!config.dexContractAddress) {
    // Simulate swap when no DEX is configured (for testing)
    console.warn('No DEX contract configured, simulating swap');
    // Return a fake transaction hash
    return `0x${Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('')}`;
  }

  try {
    // Build swap transaction
    // This structure depends on the specific DEX you're integrating with
    const payload: InputGenerateTransactionPayloadData = {
      function: `${config.dexContractAddress}::${config.dexModuleName}::swap_exact_input`,
      typeArguments: [tokenIn, tokenOut],
      functionArguments: [amountInRaw.toString(), minAmountOut.toString()],
    };

    const transaction = await aptos.transaction.build.simple({
      sender: account.accountAddress,
      data: payload,
    });

    const pendingTx = await aptos.signAndSubmitTransaction({
      signer: account,
      transaction,
    });

    // Wait for transaction confirmation
    const committedTx = await aptos.waitForTransaction({
      transactionHash: pendingTx.hash,
    });

    if (!committedTx.success) {
      throw new Error(`Transaction failed: ${committedTx.vm_status}`);
    }

    return pendingTx.hash;
  } catch (error) {
    console.error('Error executing swap:', error);
    throw new Error(`Failed to execute swap: ${error}`);
  }
}

function getDecimals(tokenType: string): number {
  // MOVE/APT uses 8 decimals, USDC typically uses 6
  if (tokenType === config.moveToken) {
    return 1e8;
  }
  if (tokenType === config.usdcToken) {
    return 1e6;
  }
  return 1e8; // Default to 8 decimals
}

function calculatePriceImpact(
  amountIn: number,
  amountOut: number,
  _tokenIn: string,
  _tokenOut: string
): number {
  // Simplified price impact calculation
  // In production, you would compare against the spot price from the pool
  // For now, estimate based on trade size (larger trades = higher impact)
  const baseImpact = 0.1; // 0.1% base
  const sizeMultiplier = Math.min(amountIn / 10000, 1); // Scale with size up to 10k
  return baseImpact + sizeMultiplier * 0.5;
}

export function validateSlippage(slippageBps: number): boolean {
  // Slippage should be between 0.01% (1 bps) and 10% (1000 bps)
  return slippageBps >= 1 && slippageBps <= 1000;
}
