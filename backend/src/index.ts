import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config, getNetworkConfig } from './config/index.js';
import { initWebSocket, getConnectedClients } from './services/websocket.js';
import walletRoutes from './routes/wallet.js';
import twapRoutes from './routes/twap.js';
import historyRoutes from './routes/history.js';

const app = express();
const server = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  const networkConfig = getNetworkConfig();
  res.json({
    status: 'ok',
    network: config.network,
    networkName: networkConfig.name,
    rpcUrl: networkConfig.rpcUrl,
    wsClients: getConnectedClients(),
  });
});

// API Routes
app.use('/api/wallet', walletRoutes);
app.use('/api/twap', twapRoutes);
app.use('/api/history', historyRoutes);

// Initialize WebSocket
initWebSocket(server);

// Start server
server.listen(config.port, () => {
  const networkConfig = getNetworkConfig();
  console.log('='.repeat(50));
  console.log('TWAP Buyback Bot Backend');
  console.log('='.repeat(50));
  console.log(`Server running on port ${config.port}`);
  console.log(`Network: ${networkConfig.name}`);
  console.log(`RPC URL: ${networkConfig.rpcUrl}`);
  console.log(`Explorer: ${networkConfig.explorerUrl}`);
  console.log('='.repeat(50));
  console.log('API Endpoints:');
  console.log(`  POST /api/wallet/generate - Generate new wallet`);
  console.log(`  POST /api/wallet/import - Import wallet from private key`);
  console.log(`  GET  /api/wallet/balance - Get wallet balance`);
  console.log(`  GET  /api/wallet/address - Get wallet address`);
  console.log(`  POST /api/twap/start - Start TWAP execution`);
  console.log(`  POST /api/twap/stop - Stop TWAP execution`);
  console.log(`  GET  /api/twap/status - Get TWAP status`);
  console.log(`  POST /api/twap/quote - Get swap quote`);
  console.log(`  GET  /api/history - Get trade history`);
  console.log('='.repeat(50));
  console.log(`WebSocket available at ws://localhost:${config.port}`);
  console.log('='.repeat(50));
});
