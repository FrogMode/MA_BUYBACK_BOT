import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import { logger } from '../utils/logger.js';
import type { TradeExecution, TokenBalances, TWAPStatus, WSMessage } from '../types/index.js';

let wss: WebSocketServer | null = null;
const clients: Set<WebSocket> = new Set();

export function initWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req) => {
    const clientIp = req.socket.remoteAddress;
    logger.info('WebSocket client connected', { clientIp, totalClients: clients.size + 1 });
    clients.add(ws);

    ws.on('close', () => {
      logger.info('WebSocket client disconnected', { clientIp, totalClients: clients.size - 1 });
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', {
        clientIp,
        error: error.message,
      });
      clients.delete(ws);
    });

    // Send a welcome message with initial status
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

  logger.info('WebSocket server initialized');
  return wss;
}

function broadcast(message: WSMessage): void {
  const data = JSON.stringify(message);
  let sentCount = 0;

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
      sentCount++;
    }
  });

  logger.debug('WebSocket broadcast sent', {
    type: message.type,
    sentTo: sentCount,
    totalClients: clients.size,
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
  logger.warn('Broadcasting error to clients', { error: errorMessage });
  const message: WSMessage = {
    type: 'error',
    data: { message: errorMessage },
  };
  broadcast(message);
}

export function getConnectedClients(): number {
  return clients.size;
}
