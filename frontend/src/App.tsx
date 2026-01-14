import { useState, useCallback, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useApi } from './hooks/useApi';
import { WalletSetup } from './components/WalletSetup';
import { BalanceDisplay } from './components/BalanceDisplay';
import { TWAPConfig } from './components/TWAPConfig';
import { TradeHistory } from './components/TradeHistory';
import { StatusDisplay } from './components/StatusDisplay';
import type { TokenBalances, TWAPStatus, TradeExecution } from './types';

function App() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balances, setBalances] = useState<TokenBalances | null>(null);
  const [twapStatus, setTwapStatus] = useState<TWAPStatus | null>(null);
  const [trades, setTrades] = useState<TradeExecution[]>([]);
  const { getWalletStatus } = useApi();

  // WebSocket handlers
  const handleTradeExecuted = useCallback((trade: TradeExecution) => {
    setTrades((prev) => [...prev, trade]);
  }, []);

  const handleBalanceUpdate = useCallback((newBalances: TokenBalances) => {
    setBalances(newBalances);
  }, []);

  const handleTWAPStatusUpdate = useCallback((status: TWAPStatus) => {
    setTwapStatus(status);
  }, []);

  const handleError = useCallback((message: string) => {
    console.error('WebSocket error:', message);
  }, []);

  const { connected, reconnecting } = useWebSocket({
    onTradeExecuted: handleTradeExecuted,
    onBalanceUpdate: handleBalanceUpdate,
    onTWAPStatus: handleTWAPStatusUpdate,
    onError: handleError,
  });

  // Check initial wallet status
  useEffect(() => {
    const checkWallet = async () => {
      const result = await getWalletStatus();
      if (result.success && result.data?.address) {
        setWalletAddress(result.data.address);
      }
    };
    checkWallet();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900">
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-movement-primary">
              TWAP Buyback Bot
            </h1>
            <span className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-300">
              Movement
            </span>
          </div>
          <StatusDisplay wsConnected={connected} wsReconnecting={reconnecting} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <WalletSetup
              address={walletAddress}
              onWalletConfigured={setWalletAddress}
            />
            {walletAddress && (
              <BalanceDisplay
                balances={balances}
                onRefresh={setBalances}
              />
            )}
          </div>

          <div className="space-y-6">
            <TWAPConfig
              status={twapStatus}
              onStatusChange={setTwapStatus}
              walletConfigured={!!walletAddress}
            />
          </div>
        </div>

        <div className="mt-6">
          <TradeHistory trades={trades} onRefresh={setTrades} />
        </div>
      </main>

      <footer className="bg-gray-800 border-t border-gray-700 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <p className="text-center text-gray-400 text-sm">
            TWAP Buyback Bot for Movement Blockchain
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
