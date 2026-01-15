import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useApi } from '../hooks/useApi';
import type { TWAPStatus, TradeExecution } from '../types';

interface TWAPConfigProps {
  onStatusChange: (status: TWAPStatus) => void;
  onTradeExecuted: (trade: TradeExecution) => void;
  initialStatus?: TWAPStatus | null;
}

export function TWAPConfig({ onStatusChange, onTradeExecuted: _onTradeExecuted, initialStatus }: TWAPConfigProps) {
  const { connected, account } = useWallet();
  const { startTWAP: apiStartTWAP, stopTWAP: apiStopTWAP, getTWAPStatus } = useApi();
  const [totalAmount, setTotalAmount] = useState('1000');
  const [numTrades, setNumTrades] = useState('10');
  const [intervalHours, setIntervalHours] = useState('1');
  const [slippageBps, setSlippageBps] = useState('50');
  const [isActive, setIsActive] = useState(false);
  const [tradesCompleted, setTradesCompleted] = useState(0);
  const [totalTradesCount, setTotalTradesCount] = useState(0);
  const [nextTradeAt, setNextTradeAt] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const inputTotalTrades = parseInt(numTrades, 10) || 0;
  const amountPerTrade = parseFloat(totalAmount) / inputTotalTrades || 0;
  const displayTotalTrades = isActive ? totalTradesCount : inputTotalTrades;
  const progress = displayTotalTrades > 0 ? (tradesCompleted / displayTotalTrades) * 100 : 0;

  // Restore state from initialStatus when it changes
  useEffect(() => {
    if (initialStatus) {
      setIsActive(initialStatus.isActive);
      setTradesCompleted(initialStatus.tradesCompleted);
      setTotalTradesCount(initialStatus.totalTrades);
      setNextTradeAt(initialStatus.nextTradeAt);
      setStartedAt(initialStatus.startedAt);
      
      if (initialStatus.config) {
        setTotalAmount(initialStatus.config.totalAmount.toString());
        setNumTrades(initialStatus.config.numTrades.toString());
        setIntervalHours((initialStatus.config.intervalMs / (60 * 60 * 1000)).toString());
        setSlippageBps(initialStatus.config.slippageBps.toString());
      }

      // Start polling if TWAP is active
      if (initialStatus.isActive && !pollIntervalRef.current) {
        startPolling();
      }
    }
  }, [initialStatus]);

  // Reset when wallet disconnects
  useEffect(() => {
    if (!connected) {
      setIsActive(false);
      setTradesCompleted(0);
      setTotalTradesCount(0);
      setNextTradeAt(null);
      setStartedAt(null);
      stopPolling();
    }
  }, [connected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const startPolling = () => {
    if (pollIntervalRef.current) return;
    
    const walletAddress = account?.address?.toString();
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await getTWAPStatus(walletAddress);
        if (response.success && response.data) {
          const status = response.data;
          setIsActive(status.isActive);
          setTradesCompleted(status.tradesCompleted);
          setTotalTradesCount(status.totalTrades);
          setNextTradeAt(status.nextTradeAt);
          setStartedAt(status.startedAt);
          onStatusChange(status);

          // Stop polling if TWAP is no longer active
          if (!status.isActive) {
            stopPolling();
          }
        }
      } catch (err) {
        console.error('Failed to poll TWAP status:', err);
      }
    }, 5000); // Poll every 5 seconds
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const handleStart = async () => {
    if (!connected || !account) {
      setError('Please connect your wallet first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const intervalMs = parseFloat(intervalHours) * 60 * 60 * 1000;
      const walletAddress = account.address.toString();

      const response = await apiStartTWAP({
        totalAmount: parseFloat(totalAmount),
        intervalMs,
        numTrades: inputTotalTrades,
        slippageBps: parseInt(slippageBps, 10),
        walletAddress,
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to start TWAP');
      }

      if (response.data) {
        setIsActive(true);
        setTradesCompleted(response.data.tradesCompleted);
        setTotalTradesCount(response.data.totalTrades);
        setNextTradeAt(response.data.nextTradeAt);
        setStartedAt(response.data.startedAt);
        onStatusChange(response.data);
        
        // Start polling for updates
        startPolling();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start TWAP');
      setIsActive(false);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiStopTWAP();

      if (!response.success) {
        throw new Error(response.error || 'Failed to stop TWAP');
      }

      stopPolling();
      setIsActive(false);
      setNextTradeAt(null);

      if (response.data) {
        onStatusChange(response.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop TWAP');
    } finally {
      setLoading(false);
    }
  };

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
                  {tradesCompleted} / {displayTotalTrades} trades
                </p>
              </div>
              <div>
                <p className="text-white/50">Amount per Trade</p>
                <p className="font-medium text-white">
                  {(parseFloat(totalAmount) / displayTotalTrades).toFixed(2)} USDC
                </p>
              </div>
              {startedAt && (
                <div>
                  <p className="text-white/50">Started</p>
                  <p className="font-medium text-white">
                    {new Date(startedAt).toLocaleTimeString()}
                  </p>
                </div>
              )}
              {nextTradeAt && (
                <div>
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
            {loading ? 'Stopping...' : 'Stop TWAP'}
          </button>
          
          <p className="text-white/40 text-xs text-center">
            Stopping will cancel remaining trades. Untraded USDC stays in your wallet.
          </p>
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
