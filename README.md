# 🌐 Network Traffic Monitoring System

A full-stack web application for real-time monitoring, analysis, and management of network traffic.

**Stack:** Node.js + Express | MySQL | Vanilla HTML/CSS/JS

---

## 📁 Project Structure

```
network-monitor/
├── backend/
│   ├── server.js       ← Express REST API (all endpoints)
│   ├── db.js           ← MySQL connection pool
│   ├── package.json
│   └── .env            ← Database credentials (edit this!)
├── frontend/
│   └── public/
│       └── index.html  ← Complete SPA dashboard
└── database/
    └── schema.sql      ← Tables + seed data
```

---

## 🚀 Quick Start

### Step 1 — Prerequisites
- **Node.js** v16+ → https://nodejs.org
- **MySQL** v8.0+ → https://dev.mysql.com/downloads/

### Step 2 — Database Setup

```bash
# Open MySQL shell
mysql -u root -p

# Run the schema script
source /path/to/network-monitor/database/schema.sql
# OR: mysql -u root -p < database/schema.sql

# Verify tables created
USE network_monitor;
SHOW TABLES;
```

### Step 3 — Configure Environment

Edit `backend/.env`:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_actual_password
DB_NAME=network_monitor
DB_PORT=3306
PORT=3001
```

### Step 4 — Install & Run Backend

```bash
cd backend
npm install
npm start
# OR for development with auto-reload:
npm run dev
```

You should see:
```
✅ MySQL Connected successfully to database: network_monitor
🚀 Network Monitor Backend running at http://localhost:3001
📊 Dashboard available at http://localhost:3001/
```

### Step 5 — Open Dashboard

Open your browser and go to: **http://localhost:3001**

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/logs` | Get all traffic logs |
| POST | `/logs` | Add new traffic log |
| PUT | `/logs/:id` | Update log (with transaction) |
| DELETE | `/logs/:id` | Delete log + linked alerts |
| GET | `/devices` | Get all devices |
| POST | `/devices` | Register new device |
| PUT | `/devices/:id` | Update device status |
| GET | `/alerts` | Get all alerts |
| POST | `/alerts` | Generate new alert |
| GET | `/protocols` | Get all protocols |
| GET | `/stats` | Dashboard statistics |
| POST | `/simulate-concurrency` | Concurrency simulation |

---

## 🔒 Transaction Flow (PUT /logs/:id)

```sql
START TRANSACTION
  → UPDATE traffic_log SET speed = ? WHERE log_id = ?
  → SAVEPOINT sp_after_speed
  → UPDATE traffic_log SET data_size = ? WHERE log_id = ?
  → [if error] ROLLBACK TO SAVEPOINT sp_after_speed
  → COMMIT
```

---

## 🎨 Dashboard Features

| Feature | Location |
|---------|----------|
| Live stats cards | Dashboard |
| Traffic log table + Add/Edit/Delete | Traffic Logs |
| Device register + status toggle | Devices |
| Alert generation + history | Alerts |
| Protocol/port grid | Protocols |
| Transaction simulation + concurrency | Transactions |

---

## 🛡️ Auto-Alert Rules

The system automatically generates alerts when adding logs:
- **Speed > 200 Mbps** → `High Traffic Detected` (High severity)
- **Data > 500 MB** → `Suspicious Large Transfer` (Critical severity)

---

## 🐛 Troubleshooting

| Issue | Fix |
|-------|-----|
| `ECONNREFUSED` | MySQL not running. Start it: `sudo service mysql start` |
| `ER_ACCESS_DENIED` | Wrong password in `.env` |
| `ER_BAD_DB_ERROR` | Run `schema.sql` first |
| Port conflict | Change `PORT=3001` in `.env` |
| CORS error | Both frontend and backend must be on same server (or use Chrome extension) |
