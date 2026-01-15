import { useState, useCallback } from 'react';
import type { ApiResponse, TokenBalances, TWAPStatus, TradeExecution, TWAPConfig } from '../types';

const API_BASE = '/api';

// API key can be set via environment variable or localStorage
function getApiKey(): string | null {
  // Check localStorage first (for runtime configuration)
  const storedKey = localStorage.getItem('twap_api_key');
  if (storedKey) return storedKey;

  // Fall back to environment variable (set at build time)
  return import.meta.env.VITE_API_KEY || null;
}

export function setApiKey(key: string): void {
  localStorage.setItem('twap_api_key', key);
}

export function clearApiKey(): void {
  localStorage.removeItem('twap_api_key');
}

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async <T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<ApiResponse<T>> => {
    setLoading(true);
    setError(null);

    try {
      const apiKey = getApiKey();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['X-API-Key'] = apiKey;
      }

      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers,
        ...options,
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Request failed');
      }

      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network error';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  // Wallet APIs
  const generateWallet = useCallback(() => {
    return request<{ address: string; privateKey: string }>('/wallet/generate', {
      method: 'POST',
    });
  }, [request]);

  const importWallet = useCallback((privateKey: string) => {
    return request<{ address: string }>('/wallet/import', {
      method: 'POST',
      body: JSON.stringify({ privateKey }),
    });
  }, [request]);

  const getBalance = useCallback(() => {
    return request<TokenBalances>('/wallet/balance');
  }, [request]);

  const getWalletAddress = useCallback(() => {
    return request<{ address: string }>('/wallet/address');
  }, [request]);

  const getWalletStatus = useCallback(() => {
    return request<{ configured: boolean; address: string | null }>('/wallet/status');
  }, [request]);

  const withdrawTokens = useCallback((destinationAddress: string, token: 'USDC' | 'MOVE', amount: number) => {
    return request<{ txHash: string; amount: number; token: string; destinationAddress: string }>('/wallet/withdraw', {
      method: 'POST',
      body: JSON.stringify({ destinationAddress, token, amount }),
    });
  }, [request]);

  const getUserBalance = useCallback((walletAddress: string) => {
    return request<{
      USDC: { deposited: number; withdrawn: number; traded: number; available: number };
      MOVE: { deposited: number; withdrawn: number; traded: number; available: number };
    }>(`/wallet/user-balance/${encodeURIComponent(walletAddress)}`);
  }, [request]);

  const getDeposits = useCallback((walletAddress: string) => {
    return request<Array<{ txHash: string; token: string; amount: number; timestamp: string }>>(
      `/wallet/deposits/${encodeURIComponent(walletAddress)}`
    );
  }, [request]);

  const scanDeposits = useCallback(() => {
    return request<{ newDepositsFound: number }>('/wallet/scan-deposits', {
      method: 'POST',
    });
  }, [request]);

  // TWAP APIs
  const startTWAP = useCallback((config: Partial<TWAPConfig> & { walletAddress?: string }) => {
    return request<TWAPStatus>('/twap/start', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }, [request]);

  const stopTWAP = useCallback(() => {
    return request<TWAPStatus>('/twap/stop', {
      method: 'POST',
    });
  }, [request]);

  const getTWAPStatus = useCallback((walletAddress?: string) => {
    const params = walletAddress ? `?walletAddress=${encodeURIComponent(walletAddress)}` : '';
    return request<TWAPStatus>(`/twap/status${params}`);
  }, [request]);

  const getTWAPSessions = useCallback((walletAddress?: string) => {
    const params = walletAddress ? `?walletAddress=${encodeURIComponent(walletAddress)}` : '';
    return request<Array<{
      id: number;
      config: TWAPConfig;
      startedAt: number;
      stoppedAt: number | null;
      tradesCompleted: number;
      totalTrades: number;
      status: 'active' | 'completed' | 'stopped' | 'failed';
    }>>(`/twap/sessions${params}`);
  }, [request]);

  const getQuote = useCallback((amountIn: number) => {
    return request<{ amountIn: number; amountOut: number; priceImpact: number }>('/twap/quote', {
      method: 'POST',
      body: JSON.stringify({ amountIn }),
    });
  }, [request]);

  // History APIs
  const getTradeHistory = useCallback((walletAddress?: string) => {
    const params = walletAddress ? `?walletAddress=${encodeURIComponent(walletAddress)}` : '';
    return request<TradeExecution[]>(`/history${params}`);
  }, [request]);

  const clearTradeHistory = useCallback((walletAddress?: string) => {
    const params = walletAddress ? `?walletAddress=${encodeURIComponent(walletAddress)}` : '';
    return request<void>(`/history${params}`, {
      method: 'DELETE',
    });
  }, [request]);

  return {
    loading,
    error,
    generateWallet,
    importWallet,
    getBalance,
    getWalletAddress,
    getWalletStatus,
    withdrawTokens,
    getUserBalance,
    getDeposits,
    scanDeposits,
    startTWAP,
    stopTWAP,
    getTWAPStatus,
    getTWAPSessions,
    getQuote,
    getTradeHistory,
    clearTradeHistory,
  };
}
