
document.addEventListener("DOMContentLoaded", () => {

    const searchInput = document.getElementById("searchInput");
    const actionFilter = document.getElementById("actionFilter");
    const refreshButton = document.getElementById("refreshButton");
    const tableBody = document.getElementById("logsTableBody");

    let searchTimer;

    // ======================================
    // FETCH ACTIVITY LOGS
    // ======================================

    async function loadActivityLogs() {

        const search = searchInput.value.trim();
        const action = actionFilter.value;

        const params = new URLSearchParams({
            search: search,
            action: action
        });

        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty">
                    Loading activity records...
                </td>
            </tr>
        `;

        try {

            const response = await fetch(
                `/api/activity-logs?${params.toString()}`
            );

            if (!response.ok) {
                throw new Error("Unable to retrieve activity logs.");
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error("Activity log request failed.");
            }

            updateStatistics(data.statistics);

            displayLogs(data.logs);

            document.getElementById("message").textContent = "";

        } catch (error) {

            console.error(error);

            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty">
                        Failed to load activity records.
                        Please check the Flask server.
                    </td>
                </tr>
            `;

            document.getElementById("message").textContent =
                error.message;

        }

    }

    // ======================================
    // UPDATE STATISTICS
    // ======================================

    function updateStatistics(stats) {

        document.getElementById("totalEvents").textContent =
            stats.total;

        document.getElementById("totalAllocations").textContent =
            stats.allocations;

        document.getElementById("totalReleases").textContent =
            stats.releases;

    }

    // ======================================
    // DISPLAY ACTIVITY RECORDS
    // ======================================

    function displayLogs(logs) {

        tableBody.innerHTML = "";

        if (!logs || logs.length === 0) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty">
                        No activity records found.
                    </td>
                </tr>
            `;

            return;

        }

        logs.forEach(log => {

            const row = document.createElement("tr");

            const statusClass =
                log.action === "IP Allocated"
                    ? "allocated"
                    : "released";

            const formattedDate = log.timestamp
                ? new Date(
                    log.timestamp.replace(" ", "T")
                ).toLocaleString("en-IN")
                : "Unavailable";

            const values = [
                log.id,
                log.ip_address,
                log.client_name || "Unknown",
                log.action,
                formattedDate
            ];

            values.forEach((value, index) => {

                const cell = document.createElement("td");

                if (index === 3) {

                    const badge = document.createElement("span");

                    badge.className = `status ${statusClass}`;
                    badge.textContent = value;

                    cell.appendChild(badge);

                } else {

                    cell.textContent = value;

                }

                row.appendChild(cell);

            });

            tableBody.appendChild(row);

        });

    }

    // ======================================
    // SEARCH
    // ======================================

    searchInput.addEventListener("input", () => {

        clearTimeout(searchTimer);

        searchTimer = setTimeout(() => {
            loadActivityLogs();
        }, 300);

    });

    // ======================================
    // FILTER
    // ======================================

    actionFilter.addEventListener("change", () => {
        loadActivityLogs();
    });

    // ======================================
    // REFRESH
    // ======================================

    refreshButton.addEventListener("click", () => {
        loadActivityLogs();
    });

    // INITIAL LOAD

    loadActivityLogs();

});
