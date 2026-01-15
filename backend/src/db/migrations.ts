import { query } from './index.js';
import { logger } from '../utils/logger.js';

export async function runMigrations(): Promise<void> {
  logger.info('Running database migrations...');

  try {
    // Create trades table
    await query(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        amount_in DECIMAL NOT NULL,
        amount_out DECIMAL NOT NULL,
        tx_hash TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
        error TEXT,
        session_id INTEGER,
        wallet_address TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info('Trades table ready');

    // Create twap_sessions table
    await query(`
      CREATE TABLE IF NOT EXISTS twap_sessions (
        id SERIAL PRIMARY KEY,
        config JSONB NOT NULL,
        started_at BIGINT NOT NULL,
        stopped_at BIGINT,
        trades_completed INTEGER DEFAULT 0,
        total_trades INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'stopped', 'failed')),
        wallet_address TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info('TWAP sessions table ready');

    // Add wallet_address column if it doesn't exist (for existing databases)
    await query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'trades' AND column_name = 'wallet_address') THEN
          ALTER TABLE trades ADD COLUMN wallet_address TEXT;
        END IF;
      END $$;
    `);

    await query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'twap_sessions' AND column_name = 'wallet_address') THEN
          ALTER TABLE twap_sessions ADD COLUMN wallet_address TEXT;
        END IF;
      END $$;
    `);

    // Create index for faster trade lookups
    await query(`
      CREATE INDEX IF NOT EXISTS idx_trades_session_id ON trades(session_id)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp DESC)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet_address)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_twap_sessions_status ON twap_sessions(status)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_twap_sessions_wallet ON twap_sessions(wallet_address)
    `);

    // Create wallet_balances table to track deposits and withdrawals per wallet
    await query(`
      CREATE TABLE IF NOT EXISTS wallet_balances (
        id SERIAL PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        token TEXT NOT NULL,
        deposited DECIMAL NOT NULL DEFAULT 0,
        withdrawn DECIMAL NOT NULL DEFAULT 0,
        traded DECIMAL NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(wallet_address, token)
      )
    `);
    logger.info('Wallet balances table ready');

    // Create deposit_transactions table to track individual deposits
    await query(`
      CREATE TABLE IF NOT EXISTS deposit_transactions (
        id SERIAL PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        token TEXT NOT NULL,
        amount DECIMAL NOT NULL,
        tx_hash TEXT,
        confirmed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info('Deposit transactions table ready');

    // Create withdrawal_transactions table to track individual withdrawals
    await query(`
      CREATE TABLE IF NOT EXISTS withdrawal_transactions (
        id SERIAL PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        token TEXT NOT NULL,
        amount DECIMAL NOT NULL,
        tx_hash TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info('Withdrawal transactions table ready');

    await query(`
      CREATE INDEX IF NOT EXISTS idx_wallet_balances_address ON wallet_balances(wallet_address)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_deposit_transactions_wallet ON deposit_transactions(wallet_address)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_withdrawal_transactions_wallet ON withdrawal_transactions(wallet_address)
    `);

    logger.info('Database migrations completed successfully');
  } catch (error) {
    logger.error('Database migration failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
