// ============================================================
// server.js - Network Traffic Monitoring System Backend
// Express + MySQL with full REST API and Transaction Support
// ============================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const pool = require('./db');
const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend/public')));

// ── Logging Middleware ────────────────────────────────────────
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// ============================================================
// TRAFFIC LOG ENDPOINTS
// ============================================================

// GET /logs - Retrieve all traffic logs
app.get('/logs', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT l.*, a.alert_type, a.severity 
             FROM traffic_log l
             LEFT JOIN alert a ON l.log_id = a.log_id
             ORDER BY l.timestamp DESC
             LIMIT 100`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('GET /logs error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /logs - Add new traffic log
app.post('/logs', async (req, res) => {
    const { source_ip, destination_ip, protocol, speed, data_size } = req.body;

    // Validate required fields
    if (!source_ip || !destination_ip || !speed || !data_size) {
        return res.status(400).json({
            success: false,
            message: 'Missing required fields: source_ip, destination_ip, speed, data_size'
        });
    }

    const conn = await pool.getConnection();
    try {
        // Use transaction for safe insertion
        await conn.beginTransaction();

        const [result] = await conn.query(
            `INSERT INTO traffic_log (source_ip, destination_ip, protocol, speed, data_size) 
             VALUES (?, ?, ?, ?, ?)`,
            [source_ip, destination_ip, protocol || null, speed, data_size]
        );

        const logId = result.insertId;

        // Auto-generate alert if traffic is very high (speed > 200 Mbps)
        if (parseFloat(speed) > 200) {
            await conn.query(
                `INSERT INTO alert (log_id, alert_type, severity) VALUES (?, ?, ?)`,
                [logId, 'High Traffic Detected', 'High']
            );
        }
        // Auto-generate alert for suspicious large data transfers
        if (parseFloat(data_size) > 500) {
            await conn.query(
                `INSERT INTO alert (log_id, alert_type, severity) VALUES (?, ?, ?)`,
                [logId, 'Suspicious Large Transfer', 'Critical']
            );
        }

        await conn.commit();
        res.status(201).json({
            success: true,
            message: 'Traffic log added successfully',
            log_id: logId
        });
    } catch (err) {
        await conn.rollback();
        console.error('POST /logs error:', err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

// PUT /logs/:id - Update traffic log with TRANSACTION + SAVEPOINT
app.put('/logs/:id', async (req, res) => {
    const { id } = req.params;
    const { speed, data_size, simulate_error } = req.body;

    const conn = await pool.getConnection();
    const transactionLog = [];

    try {
        // START TRANSACTION
        await conn.beginTransaction();
        transactionLog.push({ step: 'START TRANSACTION', status: 'OK', time: new Date().toISOString() });

        // Check log exists
        const [existing] = await conn.query('SELECT * FROM traffic_log WHERE log_id = ?', [id]);
        if (existing.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Log not found' });
        }

        const oldValues = { speed: existing[0].speed, data_size: existing[0].data_size };

        // First Update - speed
        if (speed !== undefined) {
            await conn.query('UPDATE traffic_log SET speed = ? WHERE log_id = ?', [speed, id]);
            transactionLog.push({ step: `UPDATE speed → ${speed} Mbps`, status: 'OK', time: new Date().toISOString() });
        }

        // SAVEPOINT after first update
        await conn.query('SAVEPOINT sp_after_speed');
        transactionLog.push({ step: 'SAVEPOINT sp_after_speed', status: 'SAVED', time: new Date().toISOString() });

        // Simulate concurrency error if requested
        if (simulate_error === true) {
            // Simulate a second "user" modifying the same record
            transactionLog.push({ step: 'Simulating concurrent update conflict...', status: 'CONFLICT', time: new Date().toISOString() });
            throw new Error('Concurrency conflict: Another user modified this record');
        }

        // Second Update - data_size
        if (data_size !== undefined) {
            await conn.query('UPDATE traffic_log SET data_size = ? WHERE log_id = ?', [data_size, id]);
            transactionLog.push({ step: `UPDATE data_size → ${data_size} MB`, status: 'OK', time: new Date().toISOString() });
        }

        // COMMIT
        await conn.commit();
        transactionLog.push({ step: 'COMMIT', status: 'COMMITTED', time: new Date().toISOString() });

        res.json({
            success: true,
            message: 'Traffic log updated successfully',
            old_values: oldValues,
            new_values: { speed, data_size },
            transaction_log: transactionLog
        });

    } catch (err) {
        // ROLLBACK to savepoint if exists, else full rollback
        try {
            await conn.query('ROLLBACK TO SAVEPOINT sp_after_speed');
            transactionLog.push({ step: 'ROLLBACK TO sp_after_speed', status: 'ROLLED BACK', time: new Date().toISOString() });
            await conn.commit(); // Commit what was before savepoint
            transactionLog.push({ step: 'COMMIT (partial)', status: 'PARTIAL COMMIT', time: new Date().toISOString() });
        } catch (rollbackErr) {
            await conn.rollback();
            transactionLog.push({ step: 'FULL ROLLBACK', status: 'ROLLED BACK', time: new Date().toISOString() });
        }

        console.error('PUT /logs/:id error:', err.message);
        res.status(500).json({
            success: false,
            message: err.message,
            transaction_log: transactionLog
        });
    } finally {
        conn.release();
    }
});

// DELETE /logs/:id - Delete a traffic log
app.delete('/logs/:id', async (req, res) => {
    const { id } = req.params;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Delete associated alerts first
        await conn.query('DELETE FROM alert WHERE log_id = ?', [id]);

        const [result] = await conn.query('DELETE FROM traffic_log WHERE log_id = ?', [id]);

        if (result.affectedRows === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Log not found' });
        }

        await conn.commit();
        res.json({ success: true, message: `Log #${id} deleted successfully` });
    } catch (err) {
        await conn.rollback();
        console.error('DELETE /logs/:id error:', err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

// ============================================================
// DEVICE ENDPOINTS
// ============================================================

// GET /devices - Get all devices with their protocol mappings
app.get('/devices', async (req, res) => {
    try {
        const [devices] = await pool.query(
            `SELECT d.*, 
                    GROUP_CONCAT(dpm.proto_name ORDER BY dpm.proto_name SEPARATOR ', ') AS protocols
             FROM device d
             LEFT JOIN device_proto_map dpm ON d.device_id = dpm.device_id
             GROUP BY d.device_id
             ORDER BY d.device_id`
        );
        res.json({ success: true, data: devices });
    } catch (err) {
        console.error('GET /devices error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /devices - Add new device
app.post('/devices', async (req, res) => {
    const { ip_address, status, protocols } = req.body;

    if (!ip_address) {
        return res.status(400).json({ success: false, message: 'ip_address is required' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [result] = await conn.query(
            'INSERT INTO device (ip_address, status) VALUES (?, ?)',
            [ip_address, status || 'Active']
        );

        const deviceId = result.insertId;

        // Assign protocols if provided
        if (protocols && protocols.length > 0) {
            for (const proto of protocols) {
                await conn.query(
                    'INSERT IGNORE INTO device_proto_map (device_id, proto_name) VALUES (?, ?)',
                    [deviceId, proto]
                );
            }
        }

        // Create initial session
        const sessionId = `sess_${deviceId}_${Date.now()}`;
        await conn.query(
            'INSERT INTO device_session (device_id, session_id) VALUES (?, ?)',
            [deviceId, sessionId]
        );

        await conn.commit();
        res.status(201).json({
            success: true,
            message: 'Device added successfully',
            device_id: deviceId,
            session_id: sessionId
        });
    } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'IP address already exists' });
        }
        console.error('POST /devices error:', err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

// PUT /devices/:id - Update device status
app.put('/devices/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['Active', 'Inactive'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Valid status (Active/Inactive) required' });
    }

    try {
        const [result] = await pool.query(
            'UPDATE device SET status = ? WHERE device_id = ?',
            [status, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Device not found' });
        }

        res.json({ success: true, message: `Device #${id} status updated to ${status}` });
    } catch (err) {
        console.error('PUT /devices/:id error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ALERT ENDPOINTS
// ============================================================

// GET /alerts - Get all alerts with log details
app.get('/alerts', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT a.*, 
                    l.source_ip, l.destination_ip, l.protocol, l.speed, l.data_size
             FROM alert a
             LEFT JOIN traffic_log l ON a.log_id = l.log_id
             ORDER BY a.time_generated DESC`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('GET /alerts error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /alerts - Manually generate an alert
app.post('/alerts', async (req, res) => {
    const { log_id, alert_type, severity } = req.body;

    if (!alert_type || !severity) {
        return res.status(400).json({ success: false, message: 'alert_type and severity are required' });
    }

    const validSeverities = ['Low', 'Medium', 'High', 'Critical'];
    if (!validSeverities.includes(severity)) {
        return res.status(400).json({
            success: false,
            message: `Severity must be one of: ${validSeverities.join(', ')}`
        });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [result] = await conn.query(
            'INSERT INTO alert (log_id, alert_type, severity) VALUES (?, ?, ?)',
            [log_id || null, alert_type, severity]
        );

        const alertId = result.insertId;

        // Link alert to device if log_id provided
        if (log_id) {
            // Find device that matches source_ip in the log
            const [logs] = await conn.query('SELECT source_ip FROM traffic_log WHERE log_id = ?', [log_id]);
            if (logs.length > 0) {
                const [devices] = await conn.query(
                    'SELECT device_id FROM device WHERE ip_address = ?',
                    [logs[0].source_ip]
                );
                if (devices.length > 0) {
                    await conn.query(
                        'INSERT IGNORE INTO device_alert (device_id, alert_id) VALUES (?, ?)',
                        [devices[0].device_id, alertId]
                    );
                }
            }
        }

        await conn.commit();
        res.status(201).json({
            success: true,
            message: 'Alert generated successfully',
            alert_id: alertId
        });
    } catch (err) {
        await conn.rollback();
        console.error('POST /alerts error:', err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

// ============================================================
// PROTOCOL ENDPOINTS
// ============================================================

// GET /protocols - Get all protocols
app.get('/protocols', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM protocol ORDER BY proto_name');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// DASHBOARD STATS ENDPOINT
// ============================================================

// GET /stats - Get dashboard summary statistics
app.get('/stats', async (req, res) => {
    try {
        const [[logCount]] = await pool.query('SELECT COUNT(*) AS total FROM traffic_log');
        const [[deviceCount]] = await pool.query('SELECT COUNT(*) AS total FROM device');
        const [[activeDevices]] = await pool.query("SELECT COUNT(*) AS total FROM device WHERE status='Active'");
        const [[alertCount]] = await pool.query('SELECT COUNT(*) AS total FROM alert');
        const [[criticalAlerts]] = await pool.query("SELECT COUNT(*) AS total FROM alert WHERE severity='Critical'");
        const [[avgSpeed]] = await pool.query('SELECT AVG(speed) AS avg_speed FROM traffic_log');
        const [[totalData]] = await pool.query('SELECT SUM(data_size) AS total_data FROM traffic_log');

        res.json({
            success: true,
            data: {
                total_logs: logCount.total,
                total_devices: deviceCount.total,
                active_devices: activeDevices.total,
                total_alerts: alertCount.total,
                critical_alerts: criticalAlerts.total,
                avg_speed: parseFloat(avgSpeed.avg_speed || 0).toFixed(2),
                total_data: parseFloat(totalData.total_data || 0).toFixed(2)
            }
        });
    } catch (err) {
        console.error('GET /stats error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// CONCURRENCY SIMULATION ENDPOINT
// ============================================================

// POST /simulate-concurrency - Simulate two users updating same log
app.post('/simulate-concurrency', async (req, res) => {
    const { log_id } = req.body;

    if (!log_id) {
        return res.status(400).json({ success: false, message: 'log_id is required' });
    }

    const conn = await pool.getConnection();
    const timeline = [];

    try {
        // Check log exists
        const [existing] = await conn.query('SELECT * FROM traffic_log WHERE log_id = ?', [log_id]);
        if (existing.length === 0) {
            conn.release();
            return res.status(404).json({ success: false, message: 'Log not found' });
        }

        timeline.push({ actor: 'System', action: `Starting concurrency simulation on Log #${log_id}`, status: 'info' });

        // User 1 starts transaction
        await conn.beginTransaction();
        timeline.push({ actor: 'User 1', action: 'START TRANSACTION', status: 'ok' });

        // User 1 - first update (speed)
        const newSpeed = (parseFloat(existing[0].speed) + 10).toFixed(2);
        await conn.query('UPDATE traffic_log SET speed = ? WHERE log_id = ?', [newSpeed, log_id]);
        timeline.push({ actor: 'User 1', action: `UPDATE speed → ${newSpeed} Mbps`, status: 'ok' });

        // Savepoint after User 1's first update
        await conn.query('SAVEPOINT user1_update');
        timeline.push({ actor: 'User 1', action: 'SAVEPOINT user1_update', status: 'ok' });

        // Simulate User 2 trying to update (conflict)
        timeline.push({ actor: 'User 2', action: 'Attempts to UPDATE same log...', status: 'warning' });
        timeline.push({ actor: 'User 2', action: 'BLOCKED — lock held by User 1', status: 'error' });

        // User 1 second update (data_size)
        const newDataSize = (parseFloat(existing[0].data_size) + 5).toFixed(2);
        await conn.query('UPDATE traffic_log SET data_size = ? WHERE log_id = ?', [newDataSize, log_id]);
        timeline.push({ actor: 'User 1', action: `UPDATE data_size → ${newDataSize} MB`, status: 'ok' });

        // User 1 commits
        await conn.commit();
        timeline.push({ actor: 'User 1', action: 'COMMIT — transaction complete', status: 'ok' });
        timeline.push({ actor: 'User 2', action: 'Lock released — can now proceed', status: 'ok' });
        timeline.push({ actor: 'System', action: 'Concurrency conflict resolved via locking', status: 'info' });

        res.json({
            success: true,
            message: 'Concurrency simulation complete',
            log_id: log_id,
            original: { speed: existing[0].speed, data_size: existing[0].data_size },
            updated: { speed: newSpeed, data_size: newDataSize },
            timeline
        });

    } catch (err) {
        await conn.rollback();
        timeline.push({ actor: 'System', action: `ERROR: ${err.message} — ROLLBACK`, status: 'error' });
        console.error('Concurrency simulation error:', err);
        res.status(500).json({ success: false, message: err.message, timeline });
    } finally {
        conn.release();
    }
});

// ── Root route ────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// ── 404 Handler ───────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.url} not found` });
});

// ── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

// ── Start Server ──────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🚀 Network Monitor Backend running at http://localhost:${PORT}`);
    console.log(`📊 Dashboard available at http://localhost:${PORT}/\n`);
});

module.exports = app;
