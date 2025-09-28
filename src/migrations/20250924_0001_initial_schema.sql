-- Users & Roles
CREATE TABLE IF NOT EXISTS users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agents (cash agents)
CREATE TABLE IF NOT EXISTS agents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
);

-- Bank Accounts (for withdrawals)
CREATE TABLE IF NOT EXISTS bank_accounts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  bank_name VARCHAR(120) NOT NULL,
  account_number VARCHAR(64) NOT NULL,
  account_holder VARCHAR(120) NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_account (user_id, account_number)
);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  type ENUM('deposit','withdraw','bet','payout','agent_deposit','adjustment') NOT NULL,
  method ENUM('cash_agent','binance','bank','game','system') DEFAULT 'system',
  amount DECIMAL(18,2) NOT NULL,
  status ENUM('pending','approved','rejected','completed') NOT NULL DEFAULT 'pending',
  reference VARCHAR(190) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at)
);

-- Receipts (upload metadata)
CREATE TABLE IF NOT EXISTS receipts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  transaction_id BIGINT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_tx (transaction_id)
);

-- Agent Deposits (association of agent facilitated deposits)
CREATE TABLE IF NOT EXISTS agent_deposits (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agent_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  receipt_id BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_agent (agent_id),
  INDEX idx_user (user_id),
  INDEX idx_receipt (receipt_id)
);

-- Crash Game Rounds
CREATE TABLE IF NOT EXISTS crash_rounds (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  server_seed VARCHAR(128) NOT NULL,
  server_seed_hash CHAR(64) NOT NULL,
  nonce BIGINT NOT NULL,
  crash_point DECIMAL(10,2) NULL,
  started_at TIMESTAMP NULL,
  ended_at TIMESTAMP NULL,
  INDEX idx_started (started_at)
);

CREATE TABLE IF NOT EXISTS crash_bets (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  round_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  cashed_out_multiplier DECIMAL(10,2) NULL,
  payout_amount DECIMAL(18,2) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_round (round_id),
  INDEX idx_round_user (round_id, user_id)
);

-- Wingo Rounds
CREATE TABLE IF NOT EXISTS wingo_rounds (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  round_number BIGINT NOT NULL UNIQUE,
  server_seed VARCHAR(128) NOT NULL,
  server_seed_hash CHAR(64) NOT NULL,
  nonce BIGINT NOT NULL,
  result_color ENUM('red','green','violet') NULL,
  started_at TIMESTAMP NULL,
  ended_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS wingo_bets (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  round_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  color_bet ENUM('red','green','violet') NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  payout_amount DECIMAL(18,2) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_round (round_id),
  INDEX idx_round_color (round_id, color_bet)
);

-- Boxes Plays
CREATE TABLE IF NOT EXISTS boxes_plays (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  server_seed VARCHAR(128) NOT NULL,
  server_seed_hash CHAR(64) NOT NULL,
  nonce BIGINT NOT NULL,
  selected_index INT NOT NULL,
  winning_index INT NOT NULL,
  prize_multiplier DECIMAL(10,2) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  payout_amount DECIMAL(18,2) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
);

-- Game Overrides (admin scheduled outcomes)
CREATE TABLE IF NOT EXISTS game_overrides (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  game ENUM('crash','wingo','boxes') NOT NULL,
  override_data JSON NOT NULL,
  applied TINYINT(1) NOT NULL DEFAULT 0,
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_creator (created_by),
  INDEX idx_game_applied (game, applied)
);
