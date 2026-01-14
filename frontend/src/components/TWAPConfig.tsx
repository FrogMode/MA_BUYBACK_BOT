import { useState, useEffect, useRef, useCallback } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import type { TWAPStatus, TradeExecution } from '../types';

interface TWAPConfigProps {
  onStatusChange: (status: TWAPStatus) => void;
  onTradeExecuted: (trade: TradeExecution) => void;
}

export function TWAPConfig({ onStatusChange, onTradeExecuted }: TWAPConfigProps) {
  const { connected, account } = useWallet();
  const [totalAmount, setTotalAmount] = useState('1000');
  const [numTrades, setNumTrades] = useState('10');
  const [intervalHours, setIntervalHours] = useState('1');
  const [slippageBps, setSlippageBps] = useState('50');
  const [isActive, setIsActive] = useState(false);
  const [tradesCompleted, setTradesCompleted] = useState(0);
  const [nextTradeAt, setNextTradeAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalTrades = parseInt(numTrades, 10) || 0;
  const amountPerTrade = parseFloat(totalAmount) / totalTrades || 0;
  const progress = totalTrades > 0 ? (tradesCompleted / totalTrades) * 100 : 0;

  const executeTrade = useCallback(async () => {
    if (!connected || !account) {
      setError('Wallet not connected');
      return;
    }

    const tradeId = `trade-${Date.now()}-${tradesCompleted + 1}`;

    try {
      // For now, simulate a swap transaction
      // In production, this would be a real DEX swap call
      const trade: TradeExecution = {
        id: tradeId,
        timestamp: Date.now(),
        amountIn: amountPerTrade,
        amountOut: amountPerTrade * 0.5, // Simulated rate
        txHash: '',
        status: 'pending',
      };

      onTradeExecuted({ ...trade, status: 'pending' });

      // Simulated transaction - replace with actual DEX swap
      // const response = await signAndSubmitTransaction({
      //   sender: account.address,
      //   data: {
      //     function: `${DEX_CONTRACT}::router::swap`,
      //     functionArguments: [amountPerTrade, minAmountOut],
      //   },
      // });

      // For demo, simulate success
      const simulatedTxHash = `0x${Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')}`;

      trade.txHash = simulatedTxHash;
      trade.status = 'success';

      onTradeExecuted(trade);
      setTradesCompleted((prev) => prev + 1);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Trade failed';
      setError(errorMessage);

      onTradeExecuted({
        id: tradeId,
        timestamp: Date.now(),
        amountIn: amountPerTrade,
        amountOut: 0,
        txHash: '',
        status: 'failed',
        error: errorMessage,
      });
    }
  }, [connected, account, amountPerTrade, tradesCompleted, onTradeExecuted]);

  const handleStart = async () => {
    if (!connected) {
      setError('Please connect your wallet first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setIsActive(true);
      setTradesCompleted(0);

      const intervalMs = parseFloat(intervalHours) * 60 * 60 * 1000;

      // Execute first trade immediately
      await executeTrade();

      // Set up interval for remaining trades
      if (totalTrades > 1) {
        setNextTradeAt(Date.now() + intervalMs);
        intervalRef.current = setInterval(async () => {
          await executeTrade();
          setNextTradeAt(Date.now() + intervalMs);
        }, intervalMs);
      }

      onStatusChange({
        isActive: true,
        config: {
          totalAmount: parseFloat(totalAmount),
          intervalMs,
          numTrades: totalTrades,
          slippageBps: parseInt(slippageBps, 10),
          tokenIn: 'USDC',
          tokenOut: 'MOVE',
        },
        tradesCompleted: 0,
        totalTrades,
        nextTradeAt: totalTrades > 1 ? Date.now() + intervalMs : null,
        startedAt: Date.now(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start TWAP');
      setIsActive(false);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsActive(false);
    setNextTradeAt(null);

    onStatusChange({
      isActive: false,
      config: null,
      tradesCompleted,
      totalTrades: 0,
      nextTradeAt: null,
      startedAt: null,
    });
  };

  // Check if TWAP is complete
  useEffect(() => {
    if (isActive && tradesCompleted >= totalTrades && totalTrades > 0) {
      handleStop();
    }
  }, [tradesCompleted, totalTrades, isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gradient mb-4">TWAP Configuration</h2>

      {isActive ? (
        <div className="space-y-4">
          <div className="glass-subtle rounded-xl p-4 border-movement-yellow/20">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2.5 h-2.5 bg-movement-yellow rounded-full animate-pulse"></div>
              <span className="font-semibold text-movement-yellow">TWAP Active</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-white/50">Progress</p>
                <p className="font-medium text-white">
                  {tradesCompleted} / {totalTrades} trades
                </p>
              </div>
              <div>
                <p className="text-white/50">Amount per Trade</p>
                <p className="font-medium text-white">
                  {amountPerTrade.toFixed(2)} USDC
                </p>
              </div>
              {nextTradeAt && (
                <div className="col-span-2">
                  <p className="text-white/50">Next Trade</p>
                  <p className="font-medium text-white">
                    {new Date(nextTradeAt).toLocaleTimeString()}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
            <div
              className="bg-movement-yellow h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            ></div>
          </div>

          <button
            onClick={handleStop}
            disabled={loading}
            className="btn-danger w-full"
          >
            Stop TWAP
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label">Total Amount (USDC)</label>
            <input
              type="number"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              placeholder="1000"
              className="input w-full"
              min="0"
              step="100"
            />
          </div>

          <div>
            <label className="label">Number of Trades</label>
            <input
              type="number"
              value={numTrades}
              onChange={(e) => setNumTrades(e.target.value)}
              placeholder="10"
              className="input w-full"
              min="1"
              step="1"
            />
          </div>

          <div>
            <label className="label">Interval (hours)</label>
            <input
              type="number"
              value={intervalHours}
              onChange={(e) => setIntervalHours(e.target.value)}
              placeholder="1"
              className="input w-full"
              min="0.01"
              step="0.5"
            />
          </div>

          <div>
            <label className="label">Slippage Tolerance (bps)</label>
            <input
              type="number"
              value={slippageBps}
              onChange={(e) => setSlippageBps(e.target.value)}
              placeholder="50"
              className="input w-full"
              min="1"
              max="1000"
              step="1"
            />
            <p className="text-white/40 text-xs mt-1">
              {(parseInt(slippageBps, 10) / 100).toFixed(2)}% slippage
            </p>
          </div>

          <div className="glass-subtle rounded-lg p-3">
            <p className="text-sm text-white/70">
              <span className="font-medium text-movement-yellow">{amountPerTrade.toFixed(2)} USDC</span> per trade,{' '}
              <span className="font-medium text-white">{numTrades}</span> trades over{' '}
              <span className="font-medium text-white">
                {(parseFloat(intervalHours) * parseInt(numTrades, 10)).toFixed(1)} hours
              </span>
            </p>
          </div>

          <button
            onClick={handleStart}
            disabled={loading || !connected}
            className="btn-primary w-full"
          >
            {loading ? 'Starting...' : 'Start TWAP'}
          </button>

          {!connected && (
            <p className="text-movement-yellow/70 text-sm text-center">
              Connect your wallet to start TWAP
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 glass-subtle border-red-500/30 rounded-lg p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
