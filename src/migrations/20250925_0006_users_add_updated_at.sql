-- Ensure users.updated_at exists and auto-updates
SET @updated_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'updated_at'
);
SET @sql_add_updated := IF(@updated_exists = 0,
  'ALTER TABLE users ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1'
);
PREPARE s1 FROM @sql_add_updated; EXECUTE s1; DEALLOCATE PREPARE s1;

-- If column exists but does not auto-update, try to enforce ON UPDATE
SET @needs_on_update := (
  SELECT IF(EXTRA LIKE '%on update current_timestamp%', 0, 1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'updated_at'
);
SET @sql_fix_updated := IF(@updated_exists = 1 AND @needs_on_update = 1,
  'ALTER TABLE users MODIFY COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1'
);
PREPARE s2 FROM @sql_fix_updated; EXECUTE s2; DEALLOCATE PREPARE s2;
