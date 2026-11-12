
/* ==========================================
   NETSIM - DHCP NETWORK SIMULATOR
   Database-Integrated Dashboard
========================================== */

// NETWORK CONFIGURATION

const networkConfig = {
    serverIP: "192.168.1.1",
    poolStart: 100,
    poolEnd: 199,
    subnetMask: "255.255.255.0",
    gateway: "192.168.1.1",
    leaseDuration: "24 Hours"
};

// DEMO CLIENTS

const clients = [
    {
        id: 1,
        name: "Client 01",
        icon: "💻",
        mac: "AA:BB:CC:00:00:01"
    },
    {
        id: 2,
        name: "Client 02",
        icon: "🖥️",
        mac: "AA:BB:CC:00:00:02"
    },
    {
        id: 3,
        name: "Client 03",
        icon: "📱",
        mac: "AA:BB:CC:00:00:03"
    }
];

// SIMULATION STATE

let simulationRunning = false;
let simulationTimer = null;
let currentClient = null;
let offeredIP = null;

// ==========================================
// 1. API COMMUNICATION
// ==========================================

async function apiRequest(url, options = {}) {

    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Server request failed.");
    }

    return data;
}

// ==========================================
// 2. DASHBOARD INITIALIZATION
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {

    updateDate();
    initializeDashboard();

    document.getElementById("startSimulation")
        ?.addEventListener("click", startSimulation);

    document.getElementById("resetSimulation")
        ?.addEventListener("click", resetSimulation);

    try {

        await refreshDashboard();

        addLog("NetSim dashboard initialized", "success");

        addLog(
            "DHCP server online at 192.168.1.1",
            "success"
        );

    } catch (error) {

        console.error("Dashboard initialization failed:", error);

        addLog(
            "Unable to connect to the database: " + error.message,
            "error"
        );

    }

});

function initializeDashboard() {

    document.querySelectorAll(".stat-card")
        .forEach((card, index) => {

            card.style.animation =
                `fadeInUp 0.6s ease ${index * 0.12}s both`;

        });

}

// ==========================================
// 3. DATE
// ==========================================

function updateDate() {

    const dateElement =
        document.getElementById("currentDate");

    if (dateElement) {

        dateElement.textContent =
            new Date().toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric"
            });

    }

}

// ==========================================
// 4. FETCH DATABASE INFORMATION
// ==========================================

async function refreshDashboard() {

    const data = await apiRequest("/api/ip-addresses");

    updateStatistics(data);

    updateClientNodes(data.addresses);

    return data;

}

// ==========================================
// 5. UPDATE DASHBOARD STATISTICS
// ==========================================

function updateStatistics(data) {

    setText("totalIPs", data.total);

    setText("allocatedIPs", data.allocated);

    setText("availableIPs", data.available);

    setText("clientCount", data.allocated);

}

function setText(id, value) {

    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
    }

}

// ==========================================
// 6. NETWORK TOPOLOGY
// ==========================================

function updateClientNodes(addresses) {

    clients.forEach(client => {

        const assigned = addresses.find(
            entry =>
                entry.mac_address &&
                entry.mac_address.toUpperCase() === client.mac
        );

        const element = document.getElementById(
            `client${client.id}IP`
        );

        if (element) {

            element.textContent = assigned
                ? assigned.ip_address
                : "Not assigned";

        }

        const node = document.querySelectorAll(
            ".client-node"
        )[client.id - 1];

        if (node) {

            node.classList.toggle(
                "connected",
                Boolean(assigned)
            );

        }

    });

}

// ==========================================
// 7. GET NEXT AVAILABLE IP FROM DATABASE
// ==========================================

function getNextAvailableIP(addresses) {

    const available = addresses.find(
        entry => entry.status === "Available"
    );

    return available ? available.ip_address : null;

}

// ==========================================
// 8. ALLOCATE IP THROUGH FLASK API
// ==========================================

async function allocateIP(client, ip) {

    const result = await apiRequest(
        "/api/ip-addresses/allocate",
        {
            method: "POST",

            body: JSON.stringify({

                ip_address: ip,

                client_name: client.name,

                mac_address: client.mac

            })

        }
    );

    await refreshDashboard();

    return result;

}

// ==========================================
// 9. DHCP DORA PROTOCOL
// ==========================================

const doraSteps = [

    {
        id: "step1",
        title: "DHCP DISCOVER",
        message:
            "Client broadcasts a DHCP discovery message."
    },

    {
        id: "step2",
        title: "DHCP OFFER",
        message:
            "Server offers an available IP address."
    },

    {
        id: "step3",
        title: "DHCP REQUEST",
        message:
            "Client requests the offered IP address."
    },

    {
        id: "step4",
        title: "DHCP ACKNOWLEDGE",
        message:
            "Server confirms the IP address allocation."
    }

];

// ==========================================
// 10. START DHCP SIMULATION
// ==========================================

async function startSimulation() {

    if (simulationRunning) return;

    const startButton =
        document.getElementById("startSimulation");

    try {

        // GET CURRENT DATABASE RECORDS

        const data = await refreshDashboard();

        // FIND A CLIENT THAT DOES NOT HAVE AN IP

        currentClient = clients.find(client => {

            return !data.addresses.some(
                entry =>
                    entry.mac_address &&
                    entry.mac_address.toUpperCase() === client.mac
            );

        });

        if (!currentClient) {

            addLog(
                "All three demo clients already have IP addresses.",
                "info"
            );

            setSimulationStatus(
                "All demo clients have received IP addresses."
            );

            return;

        }

        // FIND AN AVAILABLE ADDRESS

        offeredIP = getNextAvailableIP(data.addresses);

        if (!offeredIP) {

            addLog("IP address pool exhausted!", "error");

            setSimulationStatus(
                "No available IP addresses."
            );

            return;

        }

        simulationRunning = true;

        if (startButton) {
            startButton.disabled = true;
        }

        // RESET PREVIOUS DORA HIGHLIGHTS

        document.querySelectorAll(".dora-step")
            .forEach(element => {

                element.classList.remove(
                    "active",
                    "completed"
                );

            });

        let currentStep = 0;

        addLog(
            `Starting DHCP process for ${currentClient.name}`,
            "info"
        );

        setSimulationStatus(
            `Initializing DHCP for ${currentClient.name}...`
        );

        // EXECUTE DORA STEPS

        const runStep = async () => {

            if (!simulationRunning) return;

            // ALL FOUR STEPS COMPLETED

            if (currentStep >= doraSteps.length) {

                simulationRunning = false;

                if (startButton) {
                    startButton.disabled = false;
                }

                return;

            }

            const step = doraSteps[currentStep];

            // RESET PREVIOUS HIGHLIGHTS

            document.querySelectorAll(".dora-step")
                .forEach(element => {

                    element.classList.remove(
                        "active"
                    );

                });

            // MARK PREVIOUS STEPS COMPLETED

            doraSteps.slice(0, currentStep)
                .forEach(previous => {

                    document.getElementById(previous.id)
                        ?.classList.add("completed");

                });

            // ACTIVATE CURRENT STEP

            const stepElement =
                document.getElementById(step.id);

            stepElement?.classList.add("active");

            setSimulationStatus(step.message);

            addLog(
                `${currentClient.name}: ${step.message}`,
                "info"
            );

            // DHCP OFFER

            if (currentStep === 1) {

                addLog(
                    `Server offers ${offeredIP}`,
                    "success"
                );

            }

            // DHCP REQUEST

            if (currentStep === 2) {

                addLog(
                    `${currentClient.name} requests ${offeredIP}`,
                    "info"
                );

            }

            // DHCP ACKNOWLEDGE AND DATABASE ALLOCATION

            if (currentStep === 3) {

                try {

                    await allocateIP(currentClient, offeredIP);

                    stepElement?.classList.remove("active");

                    stepElement?.classList.add("completed");

                    addLog(
                        `DHCP ACK: ${offeredIP} confirmed`,
                        "success"
                    );

                    addLog(
                        `${currentClient.name} successfully assigned ${offeredIP}`,
                        "success"
                    );

                    setSimulationStatus(
                        `Success! ${currentClient.name} received ${offeredIP}.`
                    );

                    addLog(
                        "IP allocation saved successfully in SQLite database.",
                        "success"
                    );

                } catch (error) {

                    addLog(
                        "IP allocation failed: " + error.message,
                        "error"
                    );

                    setSimulationStatus(
                        "Simulation failed: " + error.message
                    );

                    stepElement?.classList.remove("active");

                }

                simulationRunning = false;

                if (startButton) {
                    startButton.disabled = false;
                }

                return;

            }

            currentStep++;

            simulationTimer = setTimeout(
                runStep,
                1200
            );

        };

        runStep();

    } catch (error) {

        simulationRunning = false;

        if (startButton) {
            startButton.disabled = false;
        }

        console.error(error);

        addLog(
            "Simulation error: " + error.message,
            "error"
        );

        setSimulationStatus(
            "Unable to start simulation. Check Flask server."
        );

    }

}

// ==========================================
// 11. RESET DHCP SIMULATION
// ==========================================

async function resetSimulation() {

    clearTimeout(simulationTimer);

    simulationRunning = false;

    const startButton =
        document.getElementById("startSimulation");

    if (startButton) {
        startButton.disabled = false;
    }

    // RESET DORA VISUALS

    document.querySelectorAll(".dora-step")
        .forEach(element => {

            element.classList.remove(
                "active",
                "completed"
            );

        });

    currentClient = null;

    offeredIP = null;

    setSimulationStatus(
        "Resetting DHCP simulation..."
    );

    try {

        // FETCH CURRENT DATABASE RECORDS

        const data = await apiRequest("/api/ip-addresses");

        // RELEASE ONLY THE THREE DEMO CLIENTS.
        // OTHER IP MANAGEMENT ALLOCATIONS ARE PRESERVED.

        for (const client of clients) {

            const assigned = data.addresses.find(
                entry =>
                    entry.mac_address &&
                    entry.mac_address.toUpperCase() === client.mac &&
                    entry.status === "Allocated"
            );

            if (assigned) {

                await apiRequest(
                    "/api/ip-addresses/release",
                    {
                        method: "POST",

                        body: JSON.stringify({
                            ip_address: assigned.ip_address
                        })

                    }
                );

                addLog(
                    `${assigned.ip_address} released from ${client.name}`,
                    "info"
                );

            }

        }

        // REFRESH DATABASE STATISTICS

        await refreshDashboard();

        setSimulationStatus(
            "Simulation reset successfully. Ready for a new DHCP session."
        );

        addLog(
            "DHCP simulation reset successfully.",
            "success"
        );

    } catch (error) {

        console.error(error);

        setSimulationStatus(
            "Reset failed: " + error.message
        );

        addLog(
            "Unable to reset simulation: " + error.message,
            "error"
        );

    }

}

// ==========================================
// 12. ACTIVITY LOGS
// ==========================================

function addLog(message, type = "info") {

    const container =
        document.getElementById("activityLogs");

    if (!container) return;

    const emptyState =
        container.querySelector(".empty-state");

    if (emptyState) {
        emptyState.remove();
    }

    const log = document.createElement("div");

    log.className = `log-entry ${type}`;

    const timestamp = document.createElement("span");

    timestamp.className = "log-time";

    timestamp.textContent =
        new Date().toLocaleTimeString();

    const description = document.createElement("span");

    description.className = "log-message";

    description.textContent = message;

    log.append(timestamp, description);

    container.prepend(log);

    // LIMIT LOG HISTORY

    while (container.children.length > 30) {

        container.lastElementChild.remove();

    }

}

// ==========================================
// 13. SIMULATION STATUS
// ==========================================

function setSimulationStatus(message) {

    const status =
        document.getElementById("simulationStatus");

    if (status) {

        status.textContent = message;

    }

}

// ==========================================
// END OF NETSIM DATABASE-INTEGRATED MODULE
// ==========================================
