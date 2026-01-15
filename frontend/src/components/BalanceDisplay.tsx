import { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import { useApi } from '../hooks/useApi';
import type { TokenBalances } from '../types';

interface BalanceDisplayProps {
  onBalanceUpdate?: (balances: TokenBalances) => void;
}

interface UserBalanceSummary {
  deposited: number;
  withdrawn: number;
  traded: number;
  available: number;
}

const MOVEMENT_RPC = 'https://mainnet.movementnetwork.xyz/v1';
const MOVE_TOKEN = '0x1::aptos_coin::AptosCoin';
const USDC_TOKEN = '0x83121c9f9b0527d1f056e21a950d6bf3b9e9e2e8353d0e95ccea726713cbea39::usdc::USDC';

export function BalanceDisplay({ onBalanceUpdate }: BalanceDisplayProps) {
  const { account, connected } = useWallet();
  const { getBalance: getServerBalance, withdrawTokens, getWalletAddress, getUserBalance, scanDeposits } = useApi();
  const [balances, setBalances] = useState<TokenBalances | null>(null);
  const [serverBalances, setServerBalances] = useState<TokenBalances | null>(null);
  const [userBalances, setUserBalances] = useState<{ USDC: UserBalanceSummary; MOVE: UserBalanceSummary } | null>(null);
  const [serverAddress, setServerAddress] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);
  const [showDepositInfo, setShowDepositInfo] = useState(false);
  const [copied, setCopied] = useState(false);

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
      let usdcBalance = 0;

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

        const usdcCoinStore = resources.find(
          (r) => r.type === `0x1::coin::CoinStore<${USDC_TOKEN}>`
        );

        if (usdcCoinStore) {
          const data = usdcCoinStore.data as { coin: { value: string } };
          usdcBalance = parseInt(data.coin.value, 10) / 1e6;
        }
      } catch (err) {
        console.error('Error fetching balances:', err);
      }

      const newBalances = {
        MOVE: moveBalance,
        USDC: usdcBalance,
      };

      setBalances(newBalances);
      onBalanceUpdate?.(newBalances);

      // Also fetch server wallet balance and user's deposited balance
      try {
        const serverBalanceResponse = await getServerBalance();
        if (serverBalanceResponse.success && serverBalanceResponse.data) {
          setServerBalances(serverBalanceResponse.data);
        }

        const serverAddressResponse = await getWalletAddress();
        if (serverAddressResponse.success && serverAddressResponse.data) {
          setServerAddress(serverAddressResponse.data.address);
        }

        // Fetch user's deposited balance tracking
        const userBalanceResponse = await getUserBalance(address);
        if (userBalanceResponse.success && userBalanceResponse.data) {
          setUserBalances(userBalanceResponse.data);
        }
      } catch (err) {
        console.error('Error fetching server balances:', err);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [address, onBalanceUpdate, getServerBalance, getWalletAddress, getUserBalance]);

  useEffect(() => {
    if (connected && address) {
      fetchBalances();
    }
  }, [connected, address, fetchBalances]);

  const handleWithdraw = async (token: 'USDC' | 'MOVE') => {
    if (!address || !userBalances) return;

    const userBalance = token === 'USDC' ? userBalances.USDC : userBalances.MOVE;
    const amount = userBalance.available;
    
    if (amount <= 0) {
      setWithdrawError(`No ${token} available to withdraw`);
      return;
    }

    setIsWithdrawing(true);
    setWithdrawError(null);
    setWithdrawSuccess(null);

    try {
      const response = await withdrawTokens(address, token, amount);
      if (response.success && response.data) {
        setWithdrawSuccess(`Successfully withdrew ${amount.toFixed(token === 'USDC' ? 2 : 4)} ${token}. Tx: ${response.data.txHash.slice(0, 10)}...`);
        // Refresh balances after withdrawal
        await fetchBalances();
      } else {
        setWithdrawError(response.error || 'Withdrawal failed');
      }
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleScanDeposits = async () => {
    setIsRefreshing(true);
    try {
      await scanDeposits();
      await fetchBalances();
    } catch (err) {
      console.error('Failed to scan deposits:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyAddress = () => {
    if (serverAddress) {
      navigator.clipboard.writeText(serverAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!connected || !address) {
    return null;
  }

  const hasAvailableFunds = userBalances && (userBalances.USDC.available > 0 || userBalances.MOVE.available > 0);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gradient">Your Wallet</h2>
        <button
          onClick={fetchBalances}
          disabled={isRefreshing}
          className="btn-secondary text-sm"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
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

      {/* Bot Trading Balance Section */}
      <div className="border-t border-white/10 pt-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-medium text-white/70">Your Bot Trading Balance</h3>
            <p className="text-xs text-white/40">Deposits are detected automatically</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDepositInfo(!showDepositInfo)}
              className="btn-secondary text-xs"
            >
              {showDepositInfo ? 'Hide' : 'Deposit'}
            </button>
            <button
              onClick={handleScanDeposits}
              disabled={isRefreshing}
              className="btn-secondary text-xs"
            >
              {isRefreshing ? '...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Deposit Info */}
        {showDepositInfo && serverAddress && (
          <div className="glass-subtle rounded-lg p-3 mb-3">
            <p className="text-white/60 text-xs mb-2">
              Send USDC or MOVE to this address. Deposits are detected automatically within ~10 seconds.
            </p>
            <div className="flex items-center gap-2 p-2 bg-white/5 rounded">
              <code className="text-movement-yellow text-xs font-mono break-all flex-1 select-all">
                {serverAddress}
              </code>
              <button
                onClick={copyAddress}
                className="btn-secondary text-xs py-1 px-2 flex-shrink-0"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-white/30 text-xs mt-2">
              After sending, click "Refresh" or wait for automatic detection.
            </p>
          </div>
        )}

        {/* User's deposited balances */}
        {userBalances && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="glass-subtle rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/50 text-xs mb-0.5">USDC Available</p>
                  <p className="text-lg font-bold text-white">
                    {userBalances.USDC.available.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </p>
                  {userBalances.USDC.deposited > 0 && (
                    <p className="text-white/30 text-xs">
                      Deposited: {userBalances.USDC.deposited.toFixed(2)} | Traded: {userBalances.USDC.traded.toFixed(2)}
                    </p>
                  )}
                </div>
                {userBalances.USDC.available > 0 && (
                  <button
                    onClick={() => handleWithdraw('USDC')}
                    disabled={isWithdrawing}
                    className="btn-secondary text-xs py-1 px-2"
                  >
                    Withdraw
                  </button>
                )}
              </div>
            </div>
            <div className="glass-subtle rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/50 text-xs mb-0.5">MOVE Available</p>
                  <p className="text-lg font-bold text-movement-yellow">
                    {userBalances.MOVE.available.toLocaleString(undefined, {
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 4
                    })}
                  </p>
                  {userBalances.MOVE.deposited > 0 && (
                    <p className="text-white/30 text-xs">
                      Deposited: {userBalances.MOVE.deposited.toFixed(4)} | Traded: {userBalances.MOVE.traded.toFixed(4)}
                    </p>
                  )}
                </div>
                {userBalances.MOVE.available > 0 && (
                  <button
                    onClick={() => handleWithdraw('MOVE')}
                    disabled={isWithdrawing}
                    className="btn-secondary text-xs py-1 px-2"
                  >
                    Withdraw
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {!hasAvailableFunds && !showDepositInfo && (
          <p className="text-white/40 text-xs text-center py-2">
            No funds deposited yet. Click "Deposit" to see the bot wallet address.
          </p>
        )}

        {withdrawError && (
          <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20">
            <p className="text-red-400 text-xs">{withdrawError}</p>
          </div>
        )}

        {withdrawSuccess && (
          <div className="mt-2 p-2 rounded bg-green-500/10 border border-green-500/20">
            <p className="text-green-400 text-xs">{withdrawSuccess}</p>
          </div>
        )}
      </div>
    </div>
  );
}
