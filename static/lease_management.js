
document.addEventListener("DOMContentLoaded", () => {

    const tableBody = document.getElementById("leaseTableBody");
    const totalLeases = document.getElementById("totalLeases");
    const availableLeases = document.getElementById("availableLeases");
    const expiringLeases = document.getElementById("expiringLeases");

    const searchInput = document.getElementById("leaseSearch");
    const refreshButton = document.getElementById("refreshLeases");

    const messageBox = document.getElementById("leaseMessage");
    const historyContainer = document.getElementById("leaseHistory");

    let leases = [];

    let refreshInterval = null;


    // ==========================================
    // FORMAT REMAINING TIME
    // ==========================================

    function formatTime(seconds) {

        if (seconds === null || seconds === undefined) {
            return "Unknown";
        }

        if (seconds <= 0) {
            return "Expired";
        }

        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        }

        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        }

        return `${minutes}m ${secs}s`;
    }


    // ==========================================
    // FORMAT LEASE DURATION
    // ==========================================

    function formatDuration(seconds) {

        if (!seconds) return "Unknown";

        if (seconds < 60) {
            return seconds + " seconds";
        }

        if (seconds < 3600) {
            return Math.floor(seconds / 60) + " minutes";
        }

        if (seconds < 86400) {
            return Math.floor(seconds / 3600) + " hours";
        }

        return Math.floor(seconds / 86400) + " days";
    }


    // ==========================================
    // DISPLAY MESSAGE
    // ==========================================

    function showMessage(message, type) {

        messageBox.textContent = message;

        messageBox.className = "lease-message " + type;

        setTimeout(() => {
            messageBox.className = "lease-message";
        }, 4000);
    }


    // ==========================================
    // LOAD ACTIVE LEASES
    // ==========================================

    async function loadLeases() {

        try {

            const response = await fetch("/api/leases", {
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error("Unable to retrieve lease information.");
            }

            const data = await response.json();

            leases = data.leases || [];

            totalLeases.textContent = leases.length;

            await loadAvailableCount();

            renderLeases();

        } catch (error) {

            console.error(error);

            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-state">
                        Unable to load active leases.
                    </td>
                </tr>
            `;
        }
    }


    // ==========================================
    // LOAD AVAILABLE IP COUNT
    // ==========================================

    async function loadAvailableCount() {

        try {

            const response = await fetch("/api/ip-addresses", {
                cache: "no-store"
            });

            const data = await response.json();

            availableLeases.textContent = data.available || 0;

        } catch (error) {

            console.error("Available IP count error:", error);
        }
    }


    // ==========================================
    // RENDER ACTIVE LEASE TABLE
    // ==========================================

    function renderLeases() {

        const search = searchInput.value.toLowerCase().trim();

        const filtered = leases.filter(lease => {

            return (
                (lease.client_name || "").toLowerCase().includes(search) ||
                (lease.ip_address || "").toLowerCase().includes(search) ||
                (lease.mac_address || "").toLowerCase().includes(search)
            );
        });

        let expiringCount = 0;

        leases.forEach(lease => {

            if (
                lease.remaining_seconds !== null &&
                lease.remaining_seconds <= 60 &&
                lease.remaining_seconds > 0
            ) {
                expiringCount++;
            }
        });

        expiringLeases.textContent = expiringCount;

        if (filtered.length === 0) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-state">
                        No active leases found.
                    </td>
                </tr>
            `;

            return;
        }

        tableBody.innerHTML = "";

        filtered.forEach(lease => {

            const remaining = lease.remaining_seconds;

            let statusClass = "status-active";
            let statusText = "Active";

            if (remaining !== null && remaining <= 60) {
                statusClass = "status-warning";
                statusText = "Expiring Soon";
            }

            const row = document.createElement("tr");

            const values = [
                lease.client_name || "Unknown",
                lease.ip_address,
                lease.mac_address || "Unknown",
                lease.allocated_at || "Unknown",
                formatDuration(lease.lease_duration_seconds),
                formatTime(remaining)
            ];

            values.forEach(value => {

                const cell = document.createElement("td");
                cell.textContent = value;
                row.appendChild(cell);

            });

            const statusCell = document.createElement("td");

            const badge = document.createElement("span");
            badge.className = "lease-status " + statusClass;
            badge.textContent = statusText;

            statusCell.appendChild(badge);
            row.appendChild(statusCell);

            const actionCell = document.createElement("td");
            actionCell.className = "lease-actions";

            const renewButton = document.createElement("button");

            renewButton.className = "lease-btn renew-btn";
            renewButton.textContent = "Renew";

            renewButton.addEventListener("click", () => {
                renewLease(lease.ip_address);
            });

            const releaseButton = document.createElement("button");

            releaseButton.className = "lease-btn release-btn";
            releaseButton.textContent = "Release";

            releaseButton.addEventListener("click", () => {
                releaseLease(lease.ip_address);
            });

            actionCell.append(renewButton, releaseButton);

            row.appendChild(actionCell);

            tableBody.appendChild(row);

        });
    }


    // ==========================================
    // RENEW LEASE
    // ==========================================

    async function renewLease(ip) {

        const durationInput = prompt(
            "Enter new lease duration in seconds.\nMinimum: 10 seconds\nMaximum: 365 days",
            "86400"
        );

        if (durationInput === null) return;

        const duration = Number(durationInput);

        if (
            !Number.isInteger(duration) ||
            duration < 10 ||
            duration > 31536000
        ) {

            showMessage(
                "Invalid duration. Enter a value between 10 and 31536000 seconds.",
                "error"
            );

            return;
        }

        try {

            const response = await fetch(
                "/api/ip-addresses/renew",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        ip_address: ip,
                        lease_duration_seconds: duration
                    })
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "Lease renewal failed.");
            }

            showMessage(
                result.message,
                "success"
            );

            await refreshAll();

        } catch (error) {

            showMessage(error.message, "error");

        }
    }


    // ==========================================
    // RELEASE LEASE
    // ==========================================

    async function releaseLease(ip) {

        const confirmed = confirm(
            "Are you sure you want to release " + ip + "?"
        );

        if (!confirmed) return;

        try {

            const response = await fetch(
                "/api/ip-addresses/release",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        ip_address: ip
                    })
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "IP release failed.");
            }

            showMessage(
                result.message,
                "success"
            );

            await refreshAll();

        } catch (error) {

            showMessage(error.message, "error");

        }
    }


    // ==========================================
    // LOAD LEASE HISTORY
    // ==========================================

    async function loadHistory() {

        try {

            const response = await fetch(
                "/api/activity-logs",
                {
                    cache: "no-store"
                }
            );

            if (!response.ok) {
                throw new Error("Unable to retrieve lease history.");
            }

            const data = await response.json();

            const history = (data.logs || []).filter(log =>
                [
                    "IP Allocated",
                    "IP Released",
                    "Lease Renewed",
                    "Lease Expired"
                ].includes(log.action)
            ).slice(0, 15);

            historyContainer.innerHTML = "";

            if (history.length === 0) {

                historyContainer.innerHTML = `
                    <div class="empty-state">
                        No lease activity recorded yet.
                    </div>
                `;

                return;
            }

            history.forEach(log => {

                const item = document.createElement("div");
                item.className = "history-item";

                const details = document.createElement("div");

                const heading = document.createElement("strong");

                heading.textContent =
                    log.action + " - " + log.ip_address;

                const client = document.createElement("small");

                client.textContent =
                    "Client: " + (log.client_name || "Unknown");

                client.style.display = "block";

                details.append(heading, client);

                const timestamp = document.createElement("small");

                timestamp.textContent = log.timestamp;

                item.append(details, timestamp);

                historyContainer.appendChild(item);

            });

        } catch (error) {

            console.error("History loading error:", error);

            historyContainer.innerHTML = `
                <div class="empty-state">
                    Unable to load lease history.
                </div>
            `;
        }
    }


    // ==========================================
    // REFRESH ALL INFORMATION
    // ==========================================

    async function refreshAll() {

        await loadLeases();

        await loadHistory();

    }


    // ==========================================
    // EVENT LISTENERS
    // ==========================================

    searchInput.addEventListener(
        "input",
        renderLeases
    );

    refreshButton.addEventListener(
        "click",
        refreshAll
    );


    // ==========================================
    // LIVE COUNTDOWN
    // ==========================================

    setInterval(() => {

        leases.forEach(lease => {

            if (
                lease.remaining_seconds !== null &&
                lease.remaining_seconds > 0
            ) {
                lease.remaining_seconds--;
            }

        });

        renderLeases();

    }, 1000);


    // ==========================================
    // AUTOMATIC DATA REFRESH
    // ==========================================

    refreshInterval = setInterval(
        refreshAll,
        5000
    );


    // ==========================================
    // INITIALIZE
    // ==========================================

    refreshAll();

});
