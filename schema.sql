CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(32) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  otp_code VARCHAR(12) NULL,
  otp_expires_at BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS transactions (
  id VARCHAR(32) PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL,
  type ENUM('DEPOSIT','WITHDRAW','BET','WIN') NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  created_at BIGINT NOT NULL,
  meta JSON NULL,
  INDEX idx_user_created (user_id, created_at),
  CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Optional future table for crash rounds history
CREATE TABLE IF NOT EXISTS crash_rounds (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crash_bets (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Wingo game rounds and bets
CREATE TABLE IF NOT EXISTS wingo_rounds (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  round_id BIGINT NOT NULL,
  server_seed_hash CHAR(64) NOT NULL,
  server_seed VARCHAR(128) NULL,
  nonce BIGINT NOT NULL,
  result ENUM('GREEN','PURPLE','RED') NULL,
  betting_ends_at BIGINT NOT NULL,
  revealed_at BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_wingo_round (round_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wingo_bets (
  id VARCHAR(36) PRIMARY KEY,
  round_id BIGINT NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  selection ENUM('GREEN','PURPLE','RED') NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  payout_multiplier DECIMAL(10,2) NULL,
  created_at BIGINT NOT NULL,
  settled_at BIGINT NULL,
  win TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_wingo_round (round_id),
  INDEX idx_wingo_user_round (user_id, round_id),
  CONSTRAINT fk_wb_round FOREIGN KEY (round_id) REFERENCES wingo_rounds(round_id) ON DELETE CASCADE,
  CONSTRAINT fk_wb_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Boxes (10 boxes) plays (instant per-user)
CREATE TABLE IF NOT EXISTS boxes_plays (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL,
  server_seed_hash CHAR(64) NOT NULL,
  server_seed VARCHAR(128) NULL,
  nonce BIGINT NOT NULL,
  chosen_index TINYINT NOT NULL,
  win_index_2x TINYINT NOT NULL,
  win_index_3x TINYINT NOT NULL,
  win_index_5x TINYINT NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  multiplier_awarded DECIMAL(10,2) NULL,
  created_at BIGINT NOT NULL,
  revealed_at BIGINT NULL,
  INDEX idx_boxes_user_time (user_id, created_at),
  CONSTRAINT fk_boxes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;