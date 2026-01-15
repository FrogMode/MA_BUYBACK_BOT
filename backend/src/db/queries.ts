import { query } from './index.js';
import type { TradeExecution, TWAPConfig, TWAPStatus } from '../types/index.js';

// Trade queries
export interface DBTrade {
  id: string;
  timestamp: string;
  amount_in: string;
  amount_out: string;
  tx_hash: string | null;
  status: 'pending' | 'success' | 'failed';
  error: string | null;
  session_id: number | null;
  wallet_address: string | null;
  created_at: Date;
}

export async function insertTrade(trade: TradeExecution, sessionId?: number, walletAddress?: string): Promise<void> {
  await query(
    `INSERT INTO trades (id, timestamp, amount_in, amount_out, tx_hash, status, error, session_id, wallet_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       amount_out = EXCLUDED.amount_out,
       tx_hash = EXCLUDED.tx_hash,
       status = EXCLUDED.status,
       error = EXCLUDED.error`,
    [
      trade.id,
      trade.timestamp,
      trade.amountIn,
      trade.amountOut,
      trade.txHash || null,
      trade.status,
      trade.error || null,
      sessionId || null,
      walletAddress || null,
    ]
  );
}

export async function updateTradeStatus(
  tradeId: string,
  status: TradeExecution['status'],
  txHash?: string,
  amountOut?: number,
  error?: string
): Promise<void> {
  await query(
    `UPDATE trades SET status = $2, tx_hash = COALESCE($3, tx_hash), 
     amount_out = COALESCE($4, amount_out), error = $5 WHERE id = $1`,
    [tradeId, status, txHash || null, amountOut || null, error || null]
  );
}

export async function getTradeHistory(limit = 100, walletAddress?: string): Promise<TradeExecution[]> {
  let rows: DBTrade[];
  
  if (walletAddress) {
    rows = await query<DBTrade>(
      `SELECT * FROM trades WHERE wallet_address = $1 ORDER BY timestamp DESC LIMIT $2`,
      [walletAddress, limit]
    );
  } else {
    rows = await query<DBTrade>(
      `SELECT * FROM trades ORDER BY timestamp DESC LIMIT $1`,
      [limit]
    );
  }

  return rows.map((row) => ({
    id: row.id,
    timestamp: parseInt(row.timestamp, 10),
    amountIn: parseFloat(row.amount_in),
    amountOut: parseFloat(row.amount_out),
    txHash: row.tx_hash || '',
    status: row.status,
    error: row.error || undefined,
  }));
}

export async function getTradesBySession(sessionId: number): Promise<TradeExecution[]> {
  const rows = await query<DBTrade>(
    `SELECT * FROM trades WHERE session_id = $1 ORDER BY timestamp ASC`,
    [sessionId]
  );

  return rows.map((row) => ({
    id: row.id,
    timestamp: parseInt(row.timestamp, 10),
    amountIn: parseFloat(row.amount_in),
    amountOut: parseFloat(row.amount_out),
    txHash: row.tx_hash || '',
    status: row.status,
    error: row.error || undefined,
  }));
}

export async function clearTradeHistory(walletAddress?: string): Promise<void> {
  if (walletAddress) {
    await query(`DELETE FROM trades WHERE wallet_address = $1`, [walletAddress]);
  } else {
    await query(`DELETE FROM trades`);
  }
}

// TWAP Session queries
export interface DBTWAPSession {
  id: number;
  config: TWAPConfig;
  started_at: string;
  stopped_at: string | null;
  trades_completed: number;
  total_trades: number;
  status: 'active' | 'completed' | 'stopped' | 'failed';
  wallet_address: string | null;
  created_at: Date;
}

export async function createTWAPSession(config: TWAPConfig, walletAddress?: string): Promise<number> {
  const rows = await query<{ id: number }>(
    `INSERT INTO twap_sessions (config, started_at, total_trades, status, wallet_address)
     VALUES ($1, $2, $3, 'active', $4)
     RETURNING id`,
    [JSON.stringify(config), Date.now(), config.numTrades, walletAddress || null]
  );
  return rows[0].id;
}

export async function updateTWAPSession(
  sessionId: number,
  updates: {
    tradesCompleted?: number;
    status?: 'active' | 'completed' | 'stopped' | 'failed';
    stoppedAt?: number;
  }
): Promise<void> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.tradesCompleted !== undefined) {
    setClauses.push(`trades_completed = $${paramIndex++}`);
    values.push(updates.tradesCompleted);
  }

  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }

  if (updates.stoppedAt !== undefined) {
    setClauses.push(`stopped_at = $${paramIndex++}`);
    values.push(updates.stoppedAt);
  }

  if (setClauses.length === 0) return;

  values.push(sessionId);
  await query(
    `UPDATE twap_sessions SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
    values
  );
}

export async function getActiveSession(walletAddress?: string): Promise<DBTWAPSession | null> {
  let rows: DBTWAPSession[];
  
  if (walletAddress) {
    rows = await query<DBTWAPSession>(
      `SELECT * FROM twap_sessions WHERE status = 'active' AND wallet_address = $1 ORDER BY id DESC LIMIT 1`,
      [walletAddress]
    );
  } else {
    rows = await query<DBTWAPSession>(
      `SELECT * FROM twap_sessions WHERE status = 'active' ORDER BY id DESC LIMIT 1`
    );
  }
  return rows[0] || null;
}

export async function getTWAPSessionById(sessionId: number): Promise<DBTWAPSession | null> {
  const rows = await query<DBTWAPSession>(
    `SELECT * FROM twap_sessions WHERE id = $1`,
    [sessionId]
  );
  return rows[0] || null;
}

export async function getAllSessions(limit = 50, walletAddress?: string): Promise<DBTWAPSession[]> {
  if (walletAddress) {
    return query<DBTWAPSession>(
      `SELECT * FROM twap_sessions WHERE wallet_address = $1 ORDER BY id DESC LIMIT $2`,
      [walletAddress, limit]
    );
  }
  return query<DBTWAPSession>(
    `SELECT * FROM twap_sessions ORDER BY id DESC LIMIT $1`,
    [limit]
  );
}

// Wallet Balance Tracking queries
export interface DBWalletBalance {
  id: number;
  wallet_address: string;
  token: string;
  deposited: string;
  withdrawn: string;
  traded: string;
  created_at: Date;
  updated_at: Date;
}

export interface WalletBalanceSummary {
  deposited: number;
  withdrawn: number;
  traded: number;
  available: number; // deposited - withdrawn - traded
}

/**
 * Get the balance summary for a wallet and token
 */
export async function getWalletBalance(walletAddress: string, token: string): Promise<WalletBalanceSummary> {
  const rows = await query<DBWalletBalance>(
    `SELECT * FROM wallet_balances WHERE wallet_address = $1 AND token = $2`,
    [walletAddress, token]
  );

  if (rows.length === 0) {
    return { deposited: 0, withdrawn: 0, traded: 0, available: 0 };
  }

  const row = rows[0];
  const deposited = parseFloat(row.deposited);
  const withdrawn = parseFloat(row.withdrawn);
  const traded = parseFloat(row.traded);
  const available = deposited - withdrawn - traded;

  return { deposited, withdrawn, traded, available: Math.max(0, available) };
}

/**
 * Get all balances for a wallet (both USDC and MOVE)
 */
export async function getAllWalletBalances(walletAddress: string): Promise<Record<string, WalletBalanceSummary>> {
  const rows = await query<DBWalletBalance>(
    `SELECT * FROM wallet_balances WHERE wallet_address = $1`,
    [walletAddress]
  );

  const balances: Record<string, WalletBalanceSummary> = {};

  for (const row of rows) {
    const deposited = parseFloat(row.deposited);
    const withdrawn = parseFloat(row.withdrawn);
    const traded = parseFloat(row.traded);
    const available = deposited - withdrawn - traded;

    balances[row.token] = { deposited, withdrawn, traded, available: Math.max(0, available) };
  }

  return balances;
}

/**
 * Record a deposit for a wallet
 */
export async function recordDeposit(
  walletAddress: string,
  token: string,
  amount: number,
  txHash?: string
): Promise<void> {
  // Insert or update wallet balance
  await query(
    `INSERT INTO wallet_balances (wallet_address, token, deposited, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (wallet_address, token) DO UPDATE SET
       deposited = wallet_balances.deposited + $3,
       updated_at = NOW()`,
    [walletAddress, token, amount]
  );

  // Record the deposit transaction
  await query(
    `INSERT INTO deposit_transactions (wallet_address, token, amount, tx_hash, confirmed)
     VALUES ($1, $2, $3, $4, TRUE)`,
    [walletAddress, token, amount, txHash || null]
  );
}

/**
 * Record a withdrawal for a wallet
 */
export async function recordWithdrawal(
  walletAddress: string,
  token: string,
  amount: number,
  txHash: string,
  status: 'pending' | 'success' | 'failed' = 'success'
): Promise<void> {
  if (status === 'success') {
    // Update wallet balance
    await query(
      `UPDATE wallet_balances 
       SET withdrawn = withdrawn + $3, updated_at = NOW()
       WHERE wallet_address = $1 AND token = $2`,
      [walletAddress, token, amount]
    );
  }

  // Record the withdrawal transaction
  await query(
    `INSERT INTO withdrawal_transactions (wallet_address, token, amount, tx_hash, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [walletAddress, token, amount, txHash, status]
  );
}

/**
 * Record traded amount for a wallet (when TWAP executes a trade)
 */
export async function recordTrade(
  walletAddress: string,
  tokenIn: string,
  amountIn: number,
  tokenOut: string,
  amountOut: number
): Promise<void> {
  // Reduce the input token (traded away)
  await query(
    `UPDATE wallet_balances 
     SET traded = traded + $3, updated_at = NOW()
     WHERE wallet_address = $1 AND token = $2`,
    [walletAddress, tokenIn, amountIn]
  );

  // Add the output token as a deposit (received from trade)
  await query(
    `INSERT INTO wallet_balances (wallet_address, token, deposited, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (wallet_address, token) DO UPDATE SET
       deposited = wallet_balances.deposited + $3,
       updated_at = NOW()`,
    [walletAddress, tokenOut, amountOut]
  );
}

/**
 * Check if a wallet can withdraw a specific amount
 */
export async function canWithdraw(walletAddress: string, token: string, amount: number): Promise<boolean> {
  const balance = await getWalletBalance(walletAddress, token);
  return balance.available >= amount;
}

/**
 * Get a deposit by transaction hash
 */
export async function getDepositByTxHash(txHash: string): Promise<{
  id: number;
  wallet_address: string;
  token: string;
  amount: string;
  tx_hash: string;
  confirmed: boolean;
  created_at: Date;
} | null> {
  const rows = await query<{
    id: number;
    wallet_address: string;
    token: string;
    amount: string;
    tx_hash: string;
    confirmed: boolean;
    created_at: Date;
  }>(
    `SELECT * FROM deposit_transactions WHERE tx_hash = $1`,
    [txHash]
  );
  return rows[0] || null;
}

/**
 * Get all deposits for a wallet
 */
export async function getDepositsForWallet(walletAddress: string): Promise<Array<{
  txHash: string;
  token: string;
  amount: number;
  timestamp: Date;
}>> {
  const rows = await query<{
    tx_hash: string;
    token: string;
    amount: string;
    created_at: Date;
  }>(
    `SELECT tx_hash, token, amount, created_at FROM deposit_transactions 
     WHERE wallet_address = $1 AND confirmed = TRUE 
     ORDER BY created_at DESC`,
    [walletAddress]
  );

  return rows.map(row => ({
    txHash: row.tx_hash || '',
    token: row.token,
    amount: parseFloat(row.amount),
    timestamp: row.created_at,
  }));
}

/**
 * Get all deposit transaction hashes (for initializing the processed set)
 */
export async function getAllDepositTxHashes(): Promise<string[]> {
  const rows = await query<{ tx_hash: string }>(
    `SELECT tx_hash FROM deposit_transactions WHERE tx_hash IS NOT NULL`
  );
  return rows.map(row => row.tx_hash).filter(Boolean);
}
