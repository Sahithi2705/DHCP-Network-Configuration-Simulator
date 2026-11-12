
document.addEventListener("DOMContentLoaded", () => {

    const clientContainer =
        document.getElementById("clientContainer");

    const tableBody =
        document.getElementById("topologyTableBody");

    const refreshButton =
        document.getElementById("refreshTopology");

    // ======================================
    // FORMAT DATE
    // ======================================

    function formatDate(value) {

        if (!value) {
            return "Not available";
        }

        const date = new Date(value.replace(" ", "T"));

        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return date.toLocaleString("en-IN");
    }


    // ======================================
    // CREATE CLIENT NODE
    // ======================================

    function createClientNode(client, index) {

        const card = document.createElement("div");

        card.className = "client-node";

        const icon = document.createElement("div");
        icon.className = "client-icon";

        const icons = ["💻", "🖥️", "📱", "🖨️"];

        icon.textContent = icons[index % icons.length];

        const name = document.createElement("strong");
        name.textContent = client.client_name || "Unknown Client";

        const ip = document.createElement("small");
        ip.textContent = client.ip_address;

        const mac = document.createElement("small");
        mac.textContent = "MAC: " + (client.mac_address || "N/A");

        const status = document.createElement("span");
        status.className = "client-online";
        status.textContent = "● IP ALLOCATED";

        card.append(icon, name, ip, mac, status);

        return card;
    }


    // ======================================
    // CREATE TABLE ROW
    // ======================================

    function createTableRow(client) {

        const row = document.createElement("tr");

        const values = [
            client.client_name || "Unknown",
            client.ip_address,
            client.mac_address || "N/A",
            formatDate(client.allocated_at),
            "Allocated"
        ];

        values.forEach((value, index) => {

            const cell = document.createElement("td");

            cell.textContent = value;

            if (index === 4) {
                cell.style.color = "#20d6a1";
                cell.style.fontWeight = "600";
            }

            row.appendChild(cell);

        });

        return row;
    }


    // ======================================
    // UPDATE NETWORK STATISTICS
    // ======================================

    function updateStatistics(stats) {

        document.getElementById("topologyTotal")
            .textContent = stats.total_ips;

        document.getElementById("topologyAllocated")
            .textContent = stats.allocated_ips;

        document.getElementById("topologyClients")
            .textContent = stats.connected_clients;

    }


    // ======================================
    // DISPLAY NETWORK CLIENTS
    // ======================================

    function displayClients(clients) {

        clientContainer.innerHTML = "";
        tableBody.innerHTML = "";

        if (!clients || clients.length === 0) {

            const empty = document.createElement("div");

            empty.className = "empty-topology";

            empty.textContent =
                "No connected clients. Allocate an IP address to see devices here.";

            clientContainer.appendChild(empty);

            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 5;
            cell.className = "empty";
            cell.textContent = "No allocated clients found.";

            row.appendChild(cell);
            tableBody.appendChild(row);

            return;
        }

        clients.forEach((client, index) => {

            clientContainer.appendChild(
                createClientNode(client, index)
            );

            tableBody.appendChild(
                createTableRow(client)
            );

        });

    }


    // ======================================
    // LOAD NETWORK TOPOLOGY
    // ======================================

    async function loadTopology() {

        try {

            const response = await fetch(
                "/api/network-topology",
                { cache: "no-store" }
            );

            if (!response.ok) {
                throw new Error("Unable to load network topology.");
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error("Topology request failed.");
            }

            document.getElementById("serverName")
                .textContent = data.server.name;

            document.getElementById("serverIP")
                .textContent = data.server.ip_address;

            updateStatistics(data.statistics);

            displayClients(data.clients);

            document.getElementById("topologyMessage")
                .textContent = "";

        } catch (error) {

            console.error("Topology error:", error);

            document.getElementById("topologyMessage")
                .textContent = error.message;

        }

    }


    // ======================================
    // MANUAL REFRESH
    // ======================================

    refreshButton.addEventListener("click", () => {

        loadTopology();

    });


    // ======================================
    // INITIAL LOAD
    // ======================================

    loadTopology();


    // AUTOMATIC REFRESH EVERY 5 SECONDS

    setInterval(loadTopology, 5000);

});
