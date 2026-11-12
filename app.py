from flask import Flask, render_template, jsonify, request
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone

app = Flask(__name__)

DB_NAME = "netsim_ipam.db"

# LEASE CONFIGURATION
DEFAULT_LEASE_SECONDS = 86400
MIN_LEASE_SECONDS = 10
MAX_LEASE_SECONDS = 31536000
EXPIRY_CHECK_INTERVAL = 5


# ==========================================
# TIME HELPERS
# ==========================================

def current_time():
    return datetime.now(timezone.utc)


def current_timestamp():
    return current_time().isoformat(timespec="seconds")


def calculate_expiry(duration):
    return (
        current_time() + timedelta(seconds=duration)
    ).isoformat(timespec="seconds")


def get_remaining_seconds(expiry):
    if not expiry:
        return None

    try:
        expiry_time = datetime.fromisoformat(expiry)
        remaining = (expiry_time - current_time()).total_seconds()
        return max(0, int(remaining))
    except (ValueError, TypeError):
        return None


# ==========================================
# DATABASE CONNECTION
# ==========================================

def get_db():
    connection = sqlite3.connect(DB_NAME, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


# ==========================================
# DATABASE INITIALIZATION
# ==========================================

def initialize_database():

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ip_addresses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT UNIQUE NOT NULL,
            status TEXT DEFAULT 'Available',
            client_name TEXT,
            mac_address TEXT,
            allocated_at TEXT
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ip_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT NOT NULL,
            action TEXT NOT NULL,
            client_name TEXT,
            timestamp TEXT NOT NULL
        )
    """)

    columns = [
        row["name"]
        for row in cursor.execute(
            "PRAGMA table_info(ip_addresses)"
        ).fetchall()
    ]

    if "lease_duration_seconds" not in columns:
        cursor.execute("""
            ALTER TABLE ip_addresses
            ADD COLUMN lease_duration_seconds INTEGER
            DEFAULT 86400
        """)

    if "lease_expires_at" not in columns:
        cursor.execute("""
            ALTER TABLE ip_addresses
            ADD COLUMN lease_expires_at TEXT
        """)

    for number in range(100, 200):

        ip = f"192.168.1.{number}"

        cursor.execute("""
            INSERT OR IGNORE INTO ip_addresses (ip_address)
            VALUES (?)
        """, (ip,))

    cursor.execute("""
        UPDATE ip_addresses
        SET lease_duration_seconds = ?,
            lease_expires_at = ?
        WHERE status = 'Allocated'
        AND lease_expires_at IS NULL
    """, (
        DEFAULT_LEASE_SECONDS,
        calculate_expiry(DEFAULT_LEASE_SECONDS)
    ))

    conn.commit()
    conn.close()

    print("Database initialized successfully.")
    print("DHCP lease management enabled.")


# ==========================================
# ACTIVITY LOGGER
# ==========================================

def record_activity(cursor, ip, action, client, timestamp):

    cursor.execute("""
        INSERT INTO ip_activity
        (ip_address, action, client_name, timestamp)
        VALUES (?, ?, ?, ?)
    """, (ip, action, client, timestamp))


# ==========================================
# AUTOMATIC LEASE EXPIRATION
# ==========================================

def expire_expired_leases():

    conn = get_db()
    cursor = conn.cursor()

    now = current_timestamp()

    try:

        cursor.execute("BEGIN IMMEDIATE")

        expired = cursor.execute("""
            SELECT ip_address, client_name
            FROM ip_addresses
            WHERE status = 'Allocated'
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at <= ?
        """, (now,)).fetchall()

        for record in expired:

            ip = record["ip_address"]
            client = record["client_name"]

            cursor.execute("""
                UPDATE ip_addresses
                SET status = 'Available',
                    client_name = NULL,
                    mac_address = NULL,
                    allocated_at = NULL,
                    lease_expires_at = NULL,
                    lease_duration_seconds = ?
                WHERE ip_address = ?
                AND status = 'Allocated'
                AND lease_expires_at <= ?
            """, (
                DEFAULT_LEASE_SECONDS,
                ip,
                now
            ))

            if cursor.rowcount > 0:

                record_activity(
                    cursor,
                    ip,
                    "Lease Expired",
                    client,
                    now
                )

                print(
                    f"LEASE EXPIRED: {ip} released from {client}"
                )

        conn.commit()

        return len(expired)

    except Exception:

        conn.rollback()
        raise

    finally:

        conn.close()


# ==========================================
# BACKGROUND LEASE MONITOR
# ==========================================

def lease_monitor():

    print("DHCP Lease Monitor started.")

    while True:

        try:
            expire_expired_leases()

        except Exception as error:
            print("Lease monitor error:", error)

        time.sleep(EXPIRY_CHECK_INTERVAL)


# ==========================================
# VALIDATE LEASE DURATION
# ==========================================

def validate_lease_duration(value, default=None):

    if value is None:
        return default

    try:
        duration = int(value)
    except (ValueError, TypeError):
        return None

    if not MIN_LEASE_SECONDS <= duration <= MAX_LEASE_SECONDS:
        return None

    return duration


# ==========================================
# AUTOMATIC EXPIRATION BEFORE REQUESTS
# ==========================================

@app.before_request
def check_expired_leases():

    expire_expired_leases()


# ==========================================
# PAGE ROUTES
# ==========================================

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/ip-management")
def ip_management():
    return render_template("ip_management.html")


@app.route("/topology")
def topology():
    return render_template("topology.html")


@app.route("/simulation")
def simulation():
    return render_template("simulation.html")


@app.route("/activity-logs")
def activity_logs():
    return render_template("activity_logs.html")


@app.route("/lease-management")
def lease_management():
    return render_template("lease_management.html")


# ==========================================
# IP ADDRESS INFORMATION API
# ==========================================

@app.route("/api/ip-addresses", methods=["GET"])
def get_ip_addresses():

    conn = get_db()

    addresses = conn.execute("""
        SELECT * FROM ip_addresses
        ORDER BY id ASC
    """).fetchall()

    logs = conn.execute("""
        SELECT * FROM ip_activity
        ORDER BY id DESC LIMIT 10
    """).fetchall()

    conn.close()

    address_list = []

    for row in addresses:

        item = dict(row)

        item["remaining_seconds"] = get_remaining_seconds(
            item.get("lease_expires_at")
        )

        address_list.append(item)

    total = len(address_list)

    allocated = sum(
        1 for ip in address_list
        if ip["status"] == "Allocated"
    )

    return jsonify({
        "success": True,
        "addresses": address_list,
        "logs": [dict(row) for row in logs],
        "total": total,
        "allocated": allocated,
        "available": total - allocated
    })


# ==========================================
# LEASE CONFIGURATION API
# ==========================================

@app.route("/api/lease-settings", methods=["GET"])
def lease_settings():

    return jsonify({
        "success": True,
        "default_lease_seconds": DEFAULT_LEASE_SECONDS,
        "minimum_lease_seconds": MIN_LEASE_SECONDS,
        "maximum_lease_seconds": MAX_LEASE_SECONDS,
        "expiry_check_interval": EXPIRY_CHECK_INTERVAL
    })


# ==========================================
# LEASE INFORMATION API
# ==========================================

@app.route("/api/leases", methods=["GET"])
def get_leases():

    conn = get_db()

    records = conn.execute("""
        SELECT
            ip_address,
            client_name,
            mac_address,
            allocated_at,
            lease_duration_seconds,
            lease_expires_at
        FROM ip_addresses
        WHERE status = 'Allocated'
        ORDER BY id ASC
    """).fetchall()

    conn.close()

    leases = []

    for row in records:

        item = dict(row)

        item["remaining_seconds"] = get_remaining_seconds(
            item["lease_expires_at"]
        )

        leases.append(item)

    return jsonify({
        "success": True,
        "leases": leases,
        "total_active_leases": len(leases)
    })


# ==========================================
# ALLOCATE IP ADDRESS
# ==========================================

@app.route("/api/ip-addresses/allocate", methods=["POST"])
def allocate_ip():

    data = request.get_json(silent=True) or {}

    ip = str(data.get("ip_address") or "").strip()
    client = str(data.get("client_name") or "").strip()
    mac = str(data.get("mac_address") or "").strip()

    duration = validate_lease_duration(
        data.get("lease_duration_seconds"),
        DEFAULT_LEASE_SECONDS
    )

    if not ip or not client or not mac:

        return jsonify({
            "success": False,
            "message": "IP, client name and MAC address are required."
        }), 400

    if duration is None:

        return jsonify({
            "success": False,
            "message": "Lease duration must be between 10 seconds and 365 days."
        }), 400

    conn = get_db()
    cursor = conn.cursor()

    now = current_timestamp()
    expiry = calculate_expiry(duration)

    try:

        cursor.execute("""
            UPDATE ip_addresses
            SET status = 'Allocated',
                client_name = ?,
                mac_address = ?,
                allocated_at = ?,
                lease_duration_seconds = ?,
                lease_expires_at = ?
            WHERE ip_address = ?
            AND status = 'Available'
        """, (
            client,
            mac,
            now,
            duration,
            expiry,
            ip
        ))

        if cursor.rowcount == 0:

            conn.close()

            return jsonify({
                "success": False,
                "message": "IP unavailable or does not exist."
            }), 409

        record_activity(
            cursor,
            ip,
            "IP Allocated",
            client,
            now
        )

        conn.commit()

        return jsonify({
            "success": True,
            "message": f"{ip} allocated to {client}.",
            "ip_address": ip,
            "client_name": client,
            "lease_duration_seconds": duration,
            "lease_expires_at": expiry,
            "remaining_seconds": duration
        })

    except Exception:

        conn.rollback()
        raise

    finally:

        conn.close()


# ==========================================
# RENEW DHCP LEASE
# ==========================================

@app.route("/api/ip-addresses/renew", methods=["POST"])
def renew_lease():

    data = request.get_json(silent=True) or {}

    ip = str(data.get("ip_address") or "").strip()

    if not ip:

        return jsonify({
            "success": False,
            "message": "IP address is required."
        }), 400

    conn = get_db()
    cursor = conn.cursor()

    try:

        cursor.execute("BEGIN IMMEDIATE")

        record = cursor.execute("""
            SELECT *
            FROM ip_addresses
            WHERE ip_address = ?
            AND status = 'Allocated'
        """, (ip,)).fetchone()

        if record is None:

            conn.close()

            return jsonify({
                "success": False,
                "message": "IP is not currently allocated."
            }), 404

        duration = validate_lease_duration(
            data.get("lease_duration_seconds"),
            record["lease_duration_seconds"] or DEFAULT_LEASE_SECONDS
        )

        if duration is None:

            conn.close()

            return jsonify({
                "success": False,
                "message": "Invalid lease duration."
            }), 400

        now = current_timestamp()
        expiry = calculate_expiry(duration)

        cursor.execute("""
            UPDATE ip_addresses
            SET lease_duration_seconds = ?,
                lease_expires_at = ?
            WHERE ip_address = ?
            AND status = 'Allocated'
        """, (duration, expiry, ip))

        record_activity(
            cursor,
            ip,
            "Lease Renewed",
            record["client_name"],
            now
        )

        conn.commit()

        return jsonify({
            "success": True,
            "message": f"Lease renewed successfully for {ip}.",
            "ip_address": ip,
            "lease_duration_seconds": duration,
            "lease_expires_at": expiry,
            "remaining_seconds": duration
        })

    except Exception:

        conn.rollback()
        raise

    finally:

        if conn:
            try:
                conn.close()
            except sqlite3.Error:
                pass


# ==========================================
# RELEASE IP ADDRESS
# ==========================================

@app.route("/api/ip-addresses/release", methods=["POST"])
def release_ip():

    data = request.get_json(silent=True) or {}

    ip = str(data.get("ip_address") or "").strip()

    if not ip:

        return jsonify({
            "success": False,
            "message": "IP address is required."
        }), 400

    conn = get_db()
    cursor = conn.cursor()

    try:

        cursor.execute("BEGIN IMMEDIATE")

        record = cursor.execute("""
            SELECT *
            FROM ip_addresses
            WHERE ip_address = ?
            AND status = 'Allocated'
        """, (ip,)).fetchone()

        if record is None:

            conn.close()

            return jsonify({
                "success": False,
                "message": "IP is not allocated."
            }), 404

        client = record["client_name"]
        now = current_timestamp()

        cursor.execute("""
            UPDATE ip_addresses
            SET status = 'Available',
                client_name = NULL,
                mac_address = NULL,
                allocated_at = NULL,
                lease_expires_at = NULL,
                lease_duration_seconds = ?
            WHERE ip_address = ?
            AND status = 'Allocated'
        """, (DEFAULT_LEASE_SECONDS, ip))

        record_activity(
            cursor,
            ip,
            "IP Released",
            client,
            now
        )

        conn.commit()

        return jsonify({
            "success": True,
            "message": f"{ip} released successfully."
        })

    except Exception:

        conn.rollback()
        raise

    finally:

        conn.close()


# ==========================================
# ACTIVITY LOGS API
# ==========================================

@app.route("/api/activity-logs", methods=["GET"])
def get_activity_logs():

    search = request.args.get("search", "").strip()
    action = request.args.get("action", "all")

    conn = get_db()

    stats = conn.execute("""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN action = 'IP Allocated'
                THEN 1 ELSE 0 END) AS allocations,
            SUM(CASE WHEN action IN ('IP Released', 'Lease Expired')
                THEN 1 ELSE 0 END) AS releases
        FROM ip_activity
    """).fetchone()

    query = """
        SELECT * FROM ip_activity
        WHERE 1=1
    """

    params = []

    if search:

        query += """
            AND (
                ip_address LIKE ?
                OR client_name LIKE ?
            )
        """

        params.extend([
            f"%{search}%",
            f"%{search}%"
        ])

    if action != "all":

        query += " AND action = ?"
        params.append(action)

    query += " ORDER BY id DESC"

    logs = conn.execute(query, params).fetchall()

    conn.close()

    return jsonify({
        "success": True,
        "statistics": {
            "total": stats["total"] or 0,
            "allocations": stats["allocations"] or 0,
            "releases": stats["releases"] or 0
        },
        "logs": [dict(row) for row in logs]
    })


# ==========================================
# NETWORK TOPOLOGY API
# ==========================================

@app.route("/api/network-topology", methods=["GET"])
def get_network_topology():

    conn = get_db()

    clients = conn.execute("""
        SELECT
            id,
            ip_address,
            client_name,
            mac_address,
            allocated_at,
            status,
            lease_duration_seconds,
            lease_expires_at
        FROM ip_addresses
        WHERE status = 'Allocated'
        ORDER BY id ASC
    """).fetchall()

    statistics = conn.execute("""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'Allocated'
                THEN 1 ELSE 0 END) AS allocated
        FROM ip_addresses
    """).fetchone()

    conn.close()

    client_list = []

    for row in clients:

        item = dict(row)

        item["remaining_seconds"] = get_remaining_seconds(
            item["lease_expires_at"]
        )

        client_list.append(item)

    total = statistics["total"] or 0
    allocated = statistics["allocated"] or 0

    return jsonify({

        "success": True,

        "server": {
            "name": "DHCP Server",
            "ip_address": "192.168.1.1",
            "status": "Online"
        },

        "clients": client_list,

        "statistics": {
            "total_ips": total,
            "allocated_ips": allocated,
            "available_ips": total - allocated,
            "connected_clients": len(client_list)
        }

    })


# ==========================================
# HEALTH CHECK API
# ==========================================

@app.route("/api/health", methods=["GET"])
def health_check():

    return jsonify({
        "success": True,
        "server": "Online",
        "database": "Connected",
        "lease_management": "Active"
    })


# ==========================================
# APPLICATION START
# ==========================================

if __name__ == "__main__":

    initialize_database()

    monitor = threading.Thread(
        target=lease_monitor,
        daemon=True
    )

    monitor.start()

    print("------------------------------------")
    print("NetSim DHCP Network Simulator")
    print("Server: http://127.0.0.1:8080")
    print("Lease monitoring: ACTIVE")
    print("------------------------------------")

    app.run(
        host="127.0.0.1",
        port=8080,
        debug=False,
        use_reloader=False,
        threaded=True
    )