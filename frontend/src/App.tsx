import { useState, useCallback, useEffect } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { WalletProvider } from './components/WalletProvider';
import { WalletDropdown } from './components/WalletDropdown';
import { BalanceDisplay } from './components/BalanceDisplay';
import { TWAPConfig } from './components/TWAPConfig';
import { TradeHistory } from './components/TradeHistory';
import { StatusDisplay } from './components/StatusDisplay';
import { useApi } from './hooks/useApi';
import { useWebSocket } from './hooks/useWebSocket';
import type { TokenBalances, TWAPStatus, TradeExecution } from './types';

function AppContent() {
  const { connected, account } = useWallet();
  const { getTradeHistory, getTWAPStatus } = useApi();
  const [, setBalances] = useState<TokenBalances | null>(null);
  const [twapStatus, setTwapStatus] = useState<TWAPStatus | null>(null);
  const [trades, setTrades] = useState<TradeExecution[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Handle real-time trade updates via WebSocket
  const handleWsTradeExecuted = useCallback((trade: TradeExecution) => {
    setTrades((prev) => {
      const existing = prev.findIndex((t) => t.id === trade.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = trade;
        return updated;
      }
      return [trade, ...prev];
    });
  }, []);

  // Handle real-time TWAP status updates via WebSocket
  const handleWsTWAPStatus = useCallback((status: TWAPStatus) => {
    setTwapStatus(status);
  }, []);

  // Handle real-time balance updates via WebSocket
  const handleWsBalanceUpdate = useCallback((balances: TokenBalances) => {
    setBalances(balances);
  }, []);

  // Connect to WebSocket for real-time updates
  useWebSocket({
    onTradeExecuted: handleWsTradeExecuted,
    onTWAPStatus: handleWsTWAPStatus,
    onBalanceUpdate: handleWsBalanceUpdate,
  });

  // Fetch trade history and TWAP status when wallet connects
  useEffect(() => {
    if (connected && account?.address) {
      const walletAddress = account.address.toString();
      
      const fetchData = async () => {
        setLoadingHistory(true);
        try {
          // Fetch trade history for this wallet
          const historyResponse = await getTradeHistory(walletAddress);
          if (historyResponse.success && historyResponse.data) {
            setTrades(historyResponse.data);
          }

          // Fetch TWAP status for this wallet
          const statusResponse = await getTWAPStatus(walletAddress);
          if (statusResponse.success && statusResponse.data) {
            setTwapStatus(statusResponse.data);
          }
        } catch (error) {
          console.error('Failed to fetch wallet data:', error);
        } finally {
          setLoadingHistory(false);
        }
      };

      fetchData();
    } else {
      // Clear data when wallet disconnects
      setTrades([]);
      setTwapStatus(null);
    }
  }, [connected, account?.address, getTradeHistory, getTWAPStatus]);

  const handleTradeExecuted = useCallback((trade: TradeExecution) => {
    setTrades((prev) => {
      // Update existing trade or add new one
      const existing = prev.findIndex((t) => t.id === trade.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = trade;
        return updated;
      }
      return [...prev, trade];
    });
  }, []);

  const handleStatusChange = useCallback((status: TWAPStatus) => {
    setTwapStatus(status);
  }, []);

  const handleBalanceUpdate = useCallback((newBalances: TokenBalances) => {
    setBalances(newBalances);
  }, []);

  return (
    <div className="min-h-screen bg-liquid noise">
      <header className="glass-subtle border-b border-white/5 relative" style={{ zIndex: 9999 }}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-movement-yellow flex items-center justify-center">
                <span className="text-black font-bold text-lg">M</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gradient">
                  TWAP Buyback Bot
                </h1>
                <p className="text-xs text-white/50">Movement Network</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <StatusDisplay />
            <WalletDropdown />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <TWAPConfig
              onStatusChange={handleStatusChange}
              onTradeExecuted={handleTradeExecuted}
              initialStatus={twapStatus}
            />
          </div>

          <div className="space-y-6">
            <BalanceDisplay onBalanceUpdate={handleBalanceUpdate} />
            <TradeHistory trades={trades} onRefresh={setTrades} loading={loadingHistory} />
          </div>
        </div>
      </main>

      <footer className="glass-subtle border-t border-white/5 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <p className="text-center text-white/40 text-sm">
            TWAP Buyback Bot for Movement Network
          </p>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <WalletProvider>
      <AppContent />
    </WalletProvider>
  );
}

export default App;
