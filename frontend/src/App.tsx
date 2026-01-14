import { useState, useCallback } from 'react';
import { WalletProvider } from './components/WalletProvider';
import { WalletDropdown } from './components/WalletDropdown';
import { BalanceDisplay } from './components/BalanceDisplay';
import { TWAPConfig } from './components/TWAPConfig';
import { TradeHistory } from './components/TradeHistory';
import { StatusDisplay } from './components/StatusDisplay';
import type { TokenBalances, TWAPStatus, TradeExecution } from './types';

function AppContent() {
  const [, setBalances] = useState<TokenBalances | null>(null);
  const [, setTwapStatus] = useState<TWAPStatus | null>(null);
  const [trades, setTrades] = useState<TradeExecution[]>([]);

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
            />
          </div>

          <div className="space-y-6">
            <BalanceDisplay onBalanceUpdate={handleBalanceUpdate} />
            <TradeHistory trades={trades} onRefresh={setTrades} />
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
