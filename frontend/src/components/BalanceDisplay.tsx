import { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import type { TokenBalances } from '../types';

interface BalanceDisplayProps {
  onBalanceUpdate?: (balances: TokenBalances) => void;
}

const MOVEMENT_RPC = 'https://aptos.testnet.porto.movementlabs.xyz/v1';
const MOVE_TOKEN = '0x1::aptos_coin::AptosCoin';

export function BalanceDisplay({ onBalanceUpdate }: BalanceDisplayProps) {
  const { account, connected } = useWallet();
  const [balances, setBalances] = useState<TokenBalances | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const address = account?.address?.toString();

  const fetchBalances = useCallback(async () => {
    if (!address) return;

    setIsRefreshing(true);
    try {
      const config = new AptosConfig({
        network: Network.CUSTOM,
        fullnode: MOVEMENT_RPC,
      });
      const aptos = new Aptos(config);

      let moveBalance = 0;

      try {
        const resources = await aptos.getAccountResources({
          accountAddress: address,
        });

        const moveCoinStore = resources.find(
          (r) => r.type === `0x1::coin::CoinStore<${MOVE_TOKEN}>`
        );

        if (moveCoinStore) {
          const data = moveCoinStore.data as { coin: { value: string } };
          moveBalance = parseInt(data.coin.value, 10) / 1e8;
        }
      } catch (err) {
        console.error('Error fetching balances:', err);
      }

      const newBalances = {
        MOVE: moveBalance,
        USDC: 0,
      };

      setBalances(newBalances);
      onBalanceUpdate?.(newBalances);
    } finally {
      setIsRefreshing(false);
    }
  }, [address, onBalanceUpdate]);

  useEffect(() => {
    if (connected && address) {
      fetchBalances();
    }
  }, [connected, address, fetchBalances]);

  if (!connected || !address) {
    return null;
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gradient">Balances</h2>
        <button
          onClick={fetchBalances}
          disabled={isRefreshing}
          className="btn-secondary text-sm"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="glass-subtle rounded-xl p-4">
          <p className="text-white/50 text-sm mb-1">USDC</p>
          <p className="text-2xl font-bold text-white">
            {balances ? balances.USDC.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }) : '--'}
          </p>
        </div>
        <div className="glass-subtle rounded-xl p-4">
          <p className="text-white/50 text-sm mb-1">MOVE</p>
          <p className="text-2xl font-bold text-movement-yellow">
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
