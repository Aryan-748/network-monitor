-- ============================================================
-- Network Traffic Monitoring System - Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS network_monitor;
USE network_monitor;

-- 1. Protocol Table
CREATE TABLE IF NOT EXISTS protocol (
    proto_name VARCHAR(20) PRIMARY KEY,
    port_number INT NOT NULL
);

-- 2. Device Table
CREATE TABLE IF NOT EXISTS device (
    device_id INT AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL UNIQUE,
    status ENUM('Active', 'Inactive') DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Traffic Log Table
CREATE TABLE IF NOT EXISTS traffic_log (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    source_ip VARCHAR(45) NOT NULL,
    destination_ip VARCHAR(45) NOT NULL,
    protocol VARCHAR(20),
    speed DECIMAL(10,2) NOT NULL COMMENT 'Speed in Mbps',
    data_size DECIMAL(10,2) NOT NULL COMMENT 'Data size in MB',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (protocol) REFERENCES protocol(proto_name) ON DELETE SET NULL
);

-- 4. Alert Table
CREATE TABLE IF NOT EXISTS alert (
    alert_id INT AUTO_INCREMENT PRIMARY KEY,
    log_id INT,
    alert_type VARCHAR(100) NOT NULL,
    severity ENUM('Low', 'Medium', 'High', 'Critical') NOT NULL,
    time_generated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (log_id) REFERENCES traffic_log(log_id) ON DELETE SET NULL
);

-- 5. Device Protocol Mapping
CREATE TABLE IF NOT EXISTS device_proto_map (
    device_id INT NOT NULL,
    proto_name VARCHAR(20) NOT NULL,
    PRIMARY KEY (device_id, proto_name),
    FOREIGN KEY (device_id) REFERENCES device(device_id) ON DELETE CASCADE,
    FOREIGN KEY (proto_name) REFERENCES protocol(proto_name) ON DELETE CASCADE
);

-- 6. Device Session Table
CREATE TABLE IF NOT EXISTS device_session (
    device_id INT NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_id, session_id),
    FOREIGN KEY (device_id) REFERENCES device(device_id) ON DELETE CASCADE
);

-- 7. Device Alert Mapping
CREATE TABLE IF NOT EXISTS device_alert (
    device_id INT NOT NULL,
    alert_id INT NOT NULL,
    PRIMARY KEY (device_id, alert_id),
    FOREIGN KEY (device_id) REFERENCES device(device_id) ON DELETE CASCADE,
    FOREIGN KEY (alert_id) REFERENCES alert(alert_id) ON DELETE CASCADE
);

-- ============================================================
-- Seed Data
-- ============================================================

INSERT IGNORE INTO protocol (proto_name, port_number) VALUES
('TCP', 80),
('UDP', 53),
('HTTP', 80),
('HTTPS', 443),
('FTP', 21),
('SSH', 22),
('DNS', 53),
('SMTP', 25),
('ICMP', 0);

INSERT IGNORE INTO device (ip_address, status) VALUES
('192.168.1.10', 'Active'),
('192.168.1.20', 'Active'),
('192.168.1.30', 'Inactive'),
('10.0.0.1', 'Active'),
('10.0.0.2', 'Inactive');

INSERT INTO traffic_log (source_ip, destination_ip, protocol, speed, data_size) VALUES
('192.168.1.10', '8.8.8.8', 'TCP', 125.50, 45.20),
('192.168.1.20', '1.1.1.1', 'UDP', 85.30, 12.80),
('10.0.0.1', '192.168.1.10', 'HTTP', 220.00, 150.00),
('192.168.1.30', '8.8.4.4', 'HTTPS', 95.10, 30.50),
('10.0.0.2', '192.168.1.20', 'SSH', 10.00, 2.10);

INSERT INTO alert (log_id, alert_type, severity) VALUES
(3, 'High Traffic Detected', 'High'),
(1, 'Unusual Port Activity', 'Medium'),
(4, 'Suspicious Activity', 'Critical'),
(2, 'Data Threshold Exceeded', 'Low');

INSERT IGNORE INTO device_proto_map (device_id, proto_name) VALUES
(1, 'TCP'), (1, 'HTTP'), (1, 'HTTPS'),
(2, 'UDP'), (2, 'DNS'),
(3, 'SSH'), (3, 'FTP'),
(4, 'TCP'), (4, 'ICMP'),
(5, 'UDP'), (5, 'SMTP');

INSERT IGNORE INTO device_alert (device_id, alert_id) VALUES
(1, 1), (2, 2), (3, 3), (4, 4);
