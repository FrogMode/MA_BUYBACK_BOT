import { useState, useEffect, useCallback, useRef } from 'react';
import type { WSMessage, TradeExecution, TokenBalances, TWAPStatus } from '../types';

interface UseWebSocketOptions {
  onTradeExecuted?: (trade: TradeExecution) => void;
  onBalanceUpdate?: (balances: TokenBalances) => void;
  onTWAPStatus?: (status: TWAPStatus) => void;
  onError?: (message: string) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef(options);

  // Keep options ref updated
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:3001`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
      setReconnecting(false);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      wsRef.current = null;

      // Auto-reconnect after 3 seconds
      setReconnecting(true);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'trade_executed':
            optionsRef.current.onTradeExecuted?.(message.data as TradeExecution);
            break;
          case 'balance_update':
            optionsRef.current.onBalanceUpdate?.(message.data as TokenBalances);
            break;
          case 'twap_status':
            optionsRef.current.onTWAPStatus?.(message.data as TWAPStatus);
            break;
          case 'error':
            optionsRef.current.onError?.((message.data as { message: string }).message);
            break;
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    wsRef.current = ws;
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setReconnecting(false);
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connected,
    reconnecting,
    connect,
    disconnect,
  };
}
