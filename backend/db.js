// ============================================================
// db.js - MySQL Database Connection Module
// Uses mysql2 with connection pooling for performance
// ============================================================

const mysql = require('mysql2/promise');
require('dotenv').config();

// Create a connection pool for efficient query management
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'network_monitor',
    port: parseInt(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10,        // Max simultaneous connections
    queueLimit: 0,              // Unlimited queue
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Test connection on startup
async function testConnection() {
    try {
        const conn = await pool.getConnection();
        console.log('✅ MySQL Connected successfully to database:', process.env.DB_NAME);
        conn.release();
    } catch (err) {
        console.error('❌ MySQL Connection Failed:', err.message);
        process.exit(1);
    }
}

testConnection();

module.exports = pool;
