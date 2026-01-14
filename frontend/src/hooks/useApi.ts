import { useState, useCallback } from 'react';
import type { ApiResponse, TokenBalances, TWAPStatus, TradeExecution, TWAPConfig } from '../types';

const API_BASE = '/api';

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
      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
        },
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

  // TWAP APIs
  const startTWAP = useCallback((config: Partial<TWAPConfig>) => {
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

  const getTWAPStatus = useCallback(() => {
    return request<TWAPStatus>('/twap/status');
  }, [request]);

  const getQuote = useCallback((amountIn: number) => {
    return request<{ amountIn: number; amountOut: number; priceImpact: number }>('/twap/quote', {
      method: 'POST',
      body: JSON.stringify({ amountIn }),
    });
  }, [request]);

  // History APIs
  const getTradeHistory = useCallback(() => {
    return request<TradeExecution[]>('/history');
  }, [request]);

  const clearTradeHistory = useCallback(() => {
    return request<void>('/history', {
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
    startTWAP,
    stopTWAP,
    getTWAPStatus,
    getQuote,
    getTradeHistory,
    clearTradeHistory,
  };
}
