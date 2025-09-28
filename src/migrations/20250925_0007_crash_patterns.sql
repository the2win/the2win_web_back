CREATE TABLE IF NOT EXISTS crash_patterns (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  sequence JSON NOT NULL,
  current_index INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed 5 default patterns if not exist
INSERT IGNORE INTO crash_patterns (id, name, sequence, active)
VALUES
 (UUID(), 'Balanced',       JSON_ARRAY(1.5,2.0,1.3,3.0,1.8,2.5), 1),
 (UUID(), 'LowRisk',        JSON_ARRAY(1.3,1.4,1.5,1.6,1.7,1.8), 0),
 (UUID(), 'HighRisk',       JSON_ARRAY(3.0,5.0,2.0,10.0,1.2,8.0), 0),
 (UUID(), 'StaircaseUp',    JSON_ARRAY(1.5,1.7,2.0,2.3,2.7,3.0), 0),
 (UUID(), 'RandomSpikes',   JSON_ARRAY(1.2,4.0,1.3,7.5,1.4,2.5), 0);
