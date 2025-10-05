-- Admin Overrides Table (for crash, wingo, boxes)
CREATE TABLE IF NOT EXISTS admin_overrides (
  id VARCHAR(36) PRIMARY KEY,
  game ENUM('crash','wingo','boxes') NOT NULL,
  payload JSON NOT NULL,
  created_by VARCHAR(32) NOT NULL,
  created_at BIGINT NOT NULL,
  consumed_at BIGINT NULL,
  INDEX idx_game_created (game, created_at)
);
