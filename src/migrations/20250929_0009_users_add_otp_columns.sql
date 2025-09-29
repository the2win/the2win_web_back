-- Add OTP columns to users if missing
SET @otp_code_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'otp_code'
);
SET @sql_add_otp_code := IF(@otp_code_exists = 0,
  'ALTER TABLE users ADD COLUMN otp_code VARCHAR(12) NULL AFTER balance',
  'SELECT 1');
PREPARE stmt_add_otp_code FROM @sql_add_otp_code; EXECUTE stmt_add_otp_code; DEALLOCATE PREPARE stmt_add_otp_code;

SET @otp_exp_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'otp_expires_at'
);
SET @sql_add_otp_exp := IF(@otp_exp_exists = 0,
  'ALTER TABLE users ADD COLUMN otp_expires_at BIGINT NULL AFTER otp_code',
  'SELECT 1');
PREPARE stmt_add_otp_exp FROM @sql_add_otp_exp; EXECUTE stmt_add_otp_exp; DEALLOCATE PREPARE stmt_add_otp_exp;