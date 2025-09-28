-- Create deposit_requests table
CREATE TABLE IF NOT EXISTS deposit_requests (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  method VARCHAR(32) NOT NULL,
  receipt_path VARCHAR(255) NULL,
  status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  created_at BIGINT NOT NULL,
  reviewed_at BIGINT NULL,
  reviewed_by VARCHAR(32) NULL,
  INDEX idx_dr_user_created (user_id, created_at),
  INDEX idx_dr_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create withdraw_requests table
CREATE TABLE IF NOT EXISTS withdraw_requests (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  method VARCHAR(32) NOT NULL,
  dest VARCHAR(255) NULL,
  status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  created_at BIGINT NOT NULL,
  reviewed_at BIGINT NULL,
  reviewed_by VARCHAR(32) NULL,
  INDEX idx_wr_user_created (user_id, created_at),
  INDEX idx_wr_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
