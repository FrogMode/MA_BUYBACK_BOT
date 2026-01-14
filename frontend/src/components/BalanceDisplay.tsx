import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import type { TokenBalances } from '../types';

interface BalanceDisplayProps {
  balances: TokenBalances | null;
  onRefresh?: (balances: TokenBalances) => void;
}

export function BalanceDisplay({ balances, onRefresh }: BalanceDisplayProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { getBalance } = useApi();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const result = await getBalance();
      if (result.success && result.data) {
        onRefresh?.(result.data);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  // Auto-refresh on mount
  useEffect(() => {
    if (!balances) {
      handleRefresh();
    }
  }, []);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Balances</h2>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="btn-secondary text-sm"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm">USDC</p>
          <p className="text-2xl font-bold">
            {balances ? balances.USDC.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }) : '--'}
          </p>
        </div>
        <div className="bg-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm">MOVE</p>
          <p className="text-2xl font-bold">
            {balances ? balances.MOVE.toLocaleString(undefined, {
              minimumFractionDigits: 4,
              maximumFractionDigits: 4
            }) : '--'}
          </p>
        </div>
      </div>
    </div>
  );
}
