-- Ensure deposit_requests.updated_at exists and auto-updates
SET @dep_updated_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'deposit_requests' AND COLUMN_NAME = 'updated_at'
);
SET @sql_dep_add := IF(@dep_updated_exists = 0,
  'ALTER TABLE deposit_requests ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1'
);
PREPARE s_dep_add FROM @sql_dep_add; EXECUTE s_dep_add; DEALLOCATE PREPARE s_dep_add;

-- If column exists but lacks ON UPDATE or default, enforce it
SET @dep_needs_fix := (
  SELECT IF(EXTRA LIKE '%on update current_timestamp%', 0, 1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'deposit_requests' AND COLUMN_NAME = 'updated_at'
);
SET @sql_dep_fix := IF(@dep_updated_exists = 1 AND @dep_needs_fix = 1,
  'ALTER TABLE deposit_requests MODIFY COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1'
);
PREPARE s_dep_fix FROM @sql_dep_fix; EXECUTE s_dep_fix; DEALLOCATE PREPARE s_dep_fix;

-- Ensure withdraw_requests.updated_at exists and auto-updates
SET @wd_updated_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'withdraw_requests' AND COLUMN_NAME = 'updated_at'
);
SET @sql_wd_add := IF(@wd_updated_exists = 0,
  'ALTER TABLE withdraw_requests ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1'
);
PREPARE s_wd_add FROM @sql_wd_add; EXECUTE s_wd_add; DEALLOCATE PREPARE s_wd_add;

-- If column exists but lacks ON UPDATE or default, enforce it
SET @wd_needs_fix := (
  SELECT IF(EXTRA LIKE '%on update current_timestamp%', 0, 1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'withdraw_requests' AND COLUMN_NAME = 'updated_at'
);
SET @sql_wd_fix := IF(@wd_updated_exists = 1 AND @wd_needs_fix = 1,
  'ALTER TABLE withdraw_requests MODIFY COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1'
);
PREPARE s_wd_fix FROM @sql_wd_fix; EXECUTE s_wd_fix; DEALLOCATE PREPARE s_wd_fix;
