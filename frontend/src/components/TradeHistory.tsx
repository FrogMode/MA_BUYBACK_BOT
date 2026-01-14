import type { TradeExecution } from '../types';

interface TradeHistoryProps {
  trades: TradeExecution[];
  onRefresh: (trades: TradeExecution[]) => void;
}

export function TradeHistory({ trades, onRefresh }: TradeHistoryProps) {
  const handleClear = () => {
    onRefresh([]);
  };

  const getStatusBadge = (status: TradeExecution['status']) => {
    switch (status) {
      case 'success':
        return <span className="px-2 py-0.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded text-xs">Success</span>;
      case 'failed':
        return <span className="px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-xs">Failed</span>;
      case 'pending':
        return <span className="px-2 py-0.5 bg-movement-yellow/20 text-movement-yellow border border-movement-yellow/30 rounded text-xs">Pending</span>;
    }
  };

  const truncateTxHash = (hash: string) => {
    if (!hash || hash.length <= 16) return hash || '--';
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gradient">Trade History</h2>
        <div className="flex gap-2">
          {trades.length > 0 && (
            <button onClick={handleClear} className="btn-secondary text-sm">
              Clear
            </button>
          )}
        </div>
      </div>

      {trades.length === 0 ? (
        <div className="text-center py-12 text-white/40">
          <p>No trades executed yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-2 text-white/50 font-medium">Time</th>
                <th className="text-right py-3 px-2 text-white/50 font-medium">Amount In</th>
                <th className="text-right py-3 px-2 text-white/50 font-medium">Amount Out</th>
                <th className="text-center py-3 px-2 text-white/50 font-medium">Status</th>
                <th className="text-left py-3 px-2 text-white/50 font-medium">Tx Hash</th>
              </tr>
            </thead>
            <tbody>
              {[...trades].reverse().map((trade) => (
                <tr key={trade.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-2 text-white/70">
                    {new Date(trade.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-white">
                    {trade.amountIn.toFixed(2)} USDC
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-movement-yellow">
                    {trade.amountOut.toFixed(4)} MOVE
                  </td>
                  <td className="py-3 px-2 text-center">
                    {getStatusBadge(trade.status)}
                  </td>
                  <td className="py-3 px-2">
                    {trade.txHash ? (
                      <a
                        href={`https://explorer.movementnetwork.xyz/txn/${trade.txHash}?network=porto+testnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-movement-yellow hover:text-movement-yellow-light font-mono text-xs transition-colors"
                      >
                        {truncateTxHash(trade.txHash)}
                      </a>
                    ) : (
                      <span className="text-white/30">--</span>
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
