import { pool } from './db';
// Minimal idempotent migrations (safe CREATE TABLE IF NOT EXISTS + ALTER checks)
export async function runMigrations() {
    const conn = await pool.getConnection();
    try {
        // users (already expected from schema; kept for completeness)
        await conn.query(`CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(32) PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      balance DECIMAL(18,2) NOT NULL DEFAULT 0,
      otp_code VARCHAR(12) NULL,
      otp_expires_at BIGINT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
        await conn.query(`CREATE TABLE IF NOT EXISTS transactions (
      id VARCHAR(32) PRIMARY KEY,
      user_id VARCHAR(32) NOT NULL,
      type ENUM('DEPOSIT','WITHDRAW','BET','WIN') NOT NULL,
      amount DECIMAL(18,2) NOT NULL,
      created_at BIGINT NOT NULL,
      meta JSON NULL,
      INDEX idx_user_created (user_id, created_at),
      CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
        await conn.query(`CREATE TABLE IF NOT EXISTS crash_rounds (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      round_id BIGINT NOT NULL,
      server_seed_hash CHAR(64) NOT NULL,
      server_seed VARCHAR(128) NULL,
      nonce BIGINT NOT NULL,
      crash_point DECIMAL(10,2) NULL,
      waiting_ends_at BIGINT NOT NULL,
      locked_ends_at BIGINT NOT NULL,
      started_at BIGINT NULL,
      crashed_at BIGINT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_round (round_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
        await conn.query(`CREATE TABLE IF NOT EXISTS crash_bets (
      id VARCHAR(36) PRIMARY KEY,
      round_id BIGINT NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      amount DECIMAL(18,2) NOT NULL,
      cashed_out TINYINT(1) NOT NULL DEFAULT 0,
      cashout_multiplier DECIMAL(10,2) NULL,
      created_at BIGINT NOT NULL,
      cashed_out_at BIGINT NULL,
      INDEX idx_round (round_id),
      INDEX idx_user_round (user_id, round_id),
      CONSTRAINT fk_cb_round FOREIGN KEY (round_id) REFERENCES crash_rounds(round_id) ON DELETE CASCADE,
      CONSTRAINT fk_cb_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    }
    finally {
        conn.release();
    }
}
