import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import type { TradeExecution } from '../types';

interface TradeHistoryProps {
  trades: TradeExecution[];
  onRefresh: (trades: TradeExecution[]) => void;
}

export function TradeHistory({ trades, onRefresh }: TradeHistoryProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { getTradeHistory, clearTradeHistory } = useApi();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const result = await getTradeHistory();
      if (result.success && result.data) {
        onRefresh(result.data);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClear = async () => {
    await clearTradeHistory();
    onRefresh([]);
  };

  // Fetch initial history
  useEffect(() => {
    handleRefresh();
  }, []);

  const getStatusBadge = (status: TradeExecution['status']) => {
    switch (status) {
      case 'success':
        return <span className="px-2 py-1 bg-green-900/50 text-green-400 rounded text-xs">Success</span>;
      case 'failed':
        return <span className="px-2 py-1 bg-red-900/50 text-red-400 rounded text-xs">Failed</span>;
      case 'pending':
        return <span className="px-2 py-1 bg-yellow-900/50 text-yellow-400 rounded text-xs">Pending</span>;
    }
  };

  const truncateTxHash = (hash: string) => {
    if (hash.length <= 16) return hash;
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Trade History</h2>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn-secondary text-sm"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          {trades.length > 0 && (
            <button onClick={handleClear} className="btn-secondary text-sm">
              Clear
            </button>
          )}
        </div>
      </div>

      {trades.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p>No trades executed yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 px-2 text-gray-400">Time</th>
                <th className="text-right py-2 px-2 text-gray-400">Amount In</th>
                <th className="text-right py-2 px-2 text-gray-400">Amount Out</th>
                <th className="text-center py-2 px-2 text-gray-400">Status</th>
                <th className="text-left py-2 px-2 text-gray-400">Tx Hash</th>
              </tr>
            </thead>
            <tbody>
              {[...trades].reverse().map((trade) => (
                <tr key={trade.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="py-2 px-2">
                    {new Date(trade.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2 px-2 text-right font-mono">
                    {trade.amountIn.toFixed(2)} USDC
                  </td>
                  <td className="py-2 px-2 text-right font-mono">
                    {trade.amountOut.toFixed(4)} MOVE
                  </td>
                  <td className="py-2 px-2 text-center">
                    {getStatusBadge(trade.status)}
                  </td>
                  <td className="py-2 px-2">
                    {trade.txHash ? (
                      <a
                        href={`https://explorer.movementnetwork.xyz/txn/${trade.txHash}?network=porto+testnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-movement-primary hover:underline font-mono text-xs"
                      >
                        {truncateTxHash(trade.txHash)}
                      </a>
                    ) : (
                      <span className="text-gray-500">--</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
