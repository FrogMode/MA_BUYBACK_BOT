import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config, getNetworkConfig } from './config/index.js';
import { initWebSocket, getConnectedClients } from './services/websocket.js';
import { initializeWallet, testRPCConnection, isWalletConfigured, getWalletAddress } from './services/wallet.js';
import { restoreActiveSession } from './services/twap.js';
import { startDepositMonitoring, stopDepositMonitoring } from './services/deposits.js';
import { testConnection as testDBConnection } from './db/index.js';
import { runMigrations } from './db/migrations.js';
import { apiKeyAuth } from './middleware/auth.js';
import { logger } from './utils/logger.js';
import walletRoutes from './routes/wallet.js';
import twapRoutes from './routes/twap.js';
import historyRoutes from './routes/history.js';

const app = express();
const server = createServer(app);

// Track health metrics
let lastRPCCheck: number | null = null;
let lastRPCLatency: number = -1;
let dbConnected: boolean = false;

// Middleware
app.use(cors());
app.use(express.json());

// Health check (no auth required)
app.get('/health', async (_req, res) => {
  const networkConfig = getNetworkConfig();

  // Check RPC connection (cached, refresh every 30 seconds)
  const now = Date.now();
  if (!lastRPCCheck || now - lastRPCCheck > 30000) {
    lastRPCLatency = await testRPCConnection();
    lastRPCCheck = now;
  }

  // Check DB connection
  try {
    dbConnected = await testDBConnection();
  } catch {
    dbConnected = false;
  }

  const rpcHealthy = lastRPCLatency >= 0;
  const walletConfigured = isWalletConfigured();

  const status = rpcHealthy && dbConnected ? 'healthy' : 'degraded';

  res.json({
    status,
    network: config.network,
    networkName: networkConfig.name,
    rpcUrl: networkConfig.rpcUrl,
    rpcLatencyMs: lastRPCLatency,
    rpcHealthy,
    dbConnected,
    walletConfigured,
    walletAddress: walletConfigured ? getWalletAddress() : null,
    wsClients: getConnectedClients(),
    timestamp: new Date().toISOString(),
  });
});

// Apply API key authentication to all /api routes
app.use('/api', apiKeyAuth);

// API Routes
app.use('/api/wallet', walletRoutes);
app.use('/api/twap', twapRoutes);
app.use('/api/history', historyRoutes);

// Initialize WebSocket
initWebSocket(server);

// Startup sequence
async function startup() {
  logger.info('='.repeat(50));
  logger.info('TWAP Buyback Bot Backend Starting');
  logger.info('='.repeat(50));

  const networkConfig = getNetworkConfig();

  // 1. Initialize database
  logger.info('Initializing database...');
  try {
    const dbOk = await testDBConnection();
    if (dbOk) {
      await runMigrations();
      dbConnected = true;
      logger.info('Database initialized successfully');
    } else {
      logger.warn('Database connection failed - running without persistence');
    }
  } catch (error) {
    logger.warn('Database initialization failed - running without persistence', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // 2. Initialize wallet
  logger.info('Initializing wallet...');
  if (config.privateKey) {
    const walletOk = initializeWallet();
    if (walletOk) {
      logger.info('Wallet initialized', { address: getWalletAddress() });
    } else {
      logger.error('Wallet initialization failed');
    }
  } else {
    logger.warn('No PRIVATE_KEY configured - wallet features disabled');
  }

  // 3. Test RPC connection
  logger.info('Testing RPC connection...');
  lastRPCLatency = await testRPCConnection();
  lastRPCCheck = Date.now();
  if (lastRPCLatency >= 0) {
    logger.info('RPC connection successful', { latencyMs: lastRPCLatency });
  } else {
    logger.error('RPC connection failed');
  }

  // 4. Restore any active TWAP sessions
  if (dbConnected) {
    await restoreActiveSession();
  }

  // 5. Start deposit monitoring (check for new deposits every 10 seconds)
  if (isWalletConfigured() && dbConnected) {
    startDepositMonitoring(10000);
    logger.info('Automatic deposit monitoring started (checking every 10s)');
  }

  // 6. Start server
  server.listen(config.port, () => {
    logger.info('='.repeat(50));
    logger.info(`Server running on port ${config.port}`);
    logger.info(`Network: ${networkConfig.name}`);
    logger.info(`RPC URL: ${networkConfig.rpcUrl}`);
    logger.info(`Explorer: ${networkConfig.explorerUrl}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`API Auth: ${config.apiKey ? 'Enabled' : 'Disabled (no API_KEY set)'}`);
    logger.info(`Database: ${dbConnected ? 'Connected' : 'Not connected'}`);
    logger.info('='.repeat(50));
    logger.info('API Endpoints:');
    logger.info('  GET  /health - Health check (no auth)');
    logger.info('  GET  /api/wallet/balance - Get wallet balance');
    logger.info('  GET  /api/wallet/address - Get wallet address');
    logger.info('  GET  /api/wallet/status - Get wallet status');
    logger.info('  POST /api/twap/start - Start TWAP execution');
    logger.info('  POST /api/twap/stop - Stop TWAP execution');
    logger.info('  GET  /api/twap/status - Get TWAP status');
    logger.info('  POST /api/twap/quote - Get swap quote');
    logger.info('  GET  /api/history - Get trade history');
    logger.info('  DELETE /api/history - Clear trade history');
    logger.info('='.repeat(50));
    logger.info(`WebSocket available at ws://localhost:${config.port}`);
    logger.info('='.repeat(50));
  });
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  stopDepositMonitoring();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  stopDepositMonitoring();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Start the server
startup().catch((error) => {
  logger.error('Startup failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
