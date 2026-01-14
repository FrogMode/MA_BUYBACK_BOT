import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import type { TWAPStatus } from '../types';

interface TWAPConfigProps {
  status: TWAPStatus | null;
  onStatusChange: (status: TWAPStatus) => void;
  walletConfigured: boolean;
}

export function TWAPConfig({ status, onStatusChange, walletConfigured }: TWAPConfigProps) {
  const [totalAmount, setTotalAmount] = useState('1000');
  const [numTrades, setNumTrades] = useState('10');
  const [intervalHours, setIntervalHours] = useState('1');
  const [slippageBps, setSlippageBps] = useState('50');
  const { startTWAP, stopTWAP, getTWAPStatus, loading, error } = useApi();

  // Fetch initial status
  useEffect(() => {
    const fetchStatus = async () => {
      const result = await getTWAPStatus();
      if (result.success && result.data) {
        onStatusChange(result.data);
      }
    };
    fetchStatus();
  }, []);

  const handleStart = async () => {
    const config = {
      totalAmount: parseFloat(totalAmount),
      numTrades: parseInt(numTrades, 10),
      intervalMs: parseFloat(intervalHours) * 60 * 60 * 1000,
      slippageBps: parseInt(slippageBps, 10),
    };

    const result = await startTWAP(config);
    if (result.success && result.data) {
      onStatusChange(result.data);
    }
  };

  const handleStop = async () => {
    const result = await stopTWAP();
    if (result.success && result.data) {
      onStatusChange(result.data);
    }
  };

  const isActive = status?.isActive ?? false;
  const amountPerTrade = parseFloat(totalAmount) / parseInt(numTrades, 10);

  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-4">TWAP Configuration</h2>

      {isActive && status ? (
        <div className="space-y-4">
          <div className="bg-green-900/30 border border-green-600 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="font-semibold text-green-400">TWAP Active</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400">Progress</p>
                <p className="font-medium">
                  {status.tradesCompleted} / {status.totalTrades} trades
                </p>
              </div>
              <div>
                <p className="text-gray-400">Amount per Trade</p>
                <p className="font-medium">
                  {status.config ? (status.config.totalAmount / status.config.numTrades).toFixed(2) : '--'} USDC
                </p>
              </div>
              {status.nextTradeAt && (
                <div className="col-span-2">
                  <p className="text-gray-400">Next Trade</p>
                  <p className="font-medium">
                    {new Date(status.nextTradeAt).toLocaleTimeString()}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{
                width: `${(status.tradesCompleted / status.totalTrades) * 100}%`,
              }}
            ></div>
          </div>

          <button
            onClick={handleStop}
            disabled={loading}
            className="btn-danger w-full"
          >
            {loading ? 'Stopping...' : 'Stop TWAP'}
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
            <p className="text-gray-400 text-xs mt-1">
              {(parseInt(slippageBps, 10) / 100).toFixed(2)}% slippage
            </p>
          </div>

          <div className="bg-gray-700 rounded-lg p-3">
            <p className="text-sm text-gray-300">
              <span className="font-medium">{amountPerTrade.toFixed(2)} USDC</span> per trade,{' '}
              <span className="font-medium">{numTrades}</span> trades over{' '}
              <span className="font-medium">
                {(parseFloat(intervalHours) * parseInt(numTrades, 10)).toFixed(1)} hours
              </span>
            </p>
          </div>

          <button
            onClick={handleStart}
            disabled={loading || !walletConfigured}
            className="btn-primary w-full"
          >
            {loading ? 'Starting...' : 'Start TWAP'}
          </button>

          {!walletConfigured && (
            <p className="text-yellow-400 text-sm text-center">
              Configure a wallet first to start TWAP
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 bg-red-900/30 border border-red-600 rounded-lg p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
