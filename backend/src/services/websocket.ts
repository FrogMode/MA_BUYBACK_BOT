import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import type { TradeExecution, TokenBalances, TWAPStatus, WSMessage } from '../types/index.js';

let wss: WebSocketServer | null = null;
const clients: Set<WebSocket> = new Set();

export function initWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');
    clients.add(ws);

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });

    // Send a welcome message
    const welcomeMessage: WSMessage = {
      type: 'twap_status',
      data: {
        isActive: false,
        config: null,
        tradesCompleted: 0,
        totalTrades: 0,
        nextTradeAt: null,
        startedAt: null,
      },
    };
    ws.send(JSON.stringify(welcomeMessage));
  });

  console.log('WebSocket server initialized');
  return wss;
}

function broadcast(message: WSMessage): void {
  const data = JSON.stringify(message);

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

export function broadcastTradeExecution(trade: TradeExecution): void {
  const message: WSMessage = {
    type: 'trade_executed',
    data: trade,
  };
  broadcast(message);
}

export function broadcastBalanceUpdate(balances: TokenBalances): void {
  const message: WSMessage = {
    type: 'balance_update',
    data: balances,
  };
  broadcast(message);
}

export function broadcastTWAPStatus(status: TWAPStatus): void {
  const message: WSMessage = {
    type: 'twap_status',
    data: status,
  };
  broadcast(message);
}

export function broadcastError(errorMessage: string): void {
  const message: WSMessage = {
    type: 'error',
    data: { message: errorMessage },
  };
  broadcast(message);
}

export function getConnectedClients(): number {
  return clients.size;
}
