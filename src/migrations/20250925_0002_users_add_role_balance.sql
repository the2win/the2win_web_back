-- Ensure users has role and balance columns for existing DBs (compatible with MySQL without IF NOT EXISTS)
SET @role_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role');
SET @sql_role := IF(@role_exists = 0, 'ALTER TABLE users ADD COLUMN role ENUM(''user'',''admin'') NOT NULL DEFAULT ''user''', 'SELECT 1');
PREPARE stmt_role FROM @sql_role; EXECUTE stmt_role; DEALLOCATE PREPARE stmt_role;

SET @bal_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'balance');
SET @sql_bal := IF(@bal_exists = 0, 'ALTER TABLE users ADD COLUMN balance DECIMAL(18,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt_bal FROM @sql_bal; EXECUTE stmt_bal; DEALLOCATE PREPARE stmt_bal;