
document.addEventListener("DOMContentLoaded", () => {

    const clientName = document.getElementById("clientName");
    const macAddress = document.getElementById("macAddress");
    const ipSelect = document.getElementById("ipAddress");
    const leaseDuration = document.getElementById("leaseDuration");

    const startButton = document.getElementById("startDora");
    const clearButton = document.getElementById("clearSimulation");

    const statusBox = document.getElementById("simStatus");
    const logsContainer = document.getElementById("simLogs");

    let running = false;

    const sleep = ms =>
        new Promise(resolve => setTimeout(resolve, ms));


    // ====================================
    // LOAD AVAILABLE IP ADDRESSES
    // ====================================

    async function loadAvailableIPs() {

        try {

            const response = await fetch("/api/ip-addresses", {
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error("Unable to retrieve IP addresses.");
            }

            const data = await response.json();

            const available = data.addresses.filter(
                item => item.status === "Available"
            );

            ipSelect.innerHTML = "";

            ipSelect.add(new Option(
                "Select an available IP",
                ""
            ));

            available.forEach(item => {

                ipSelect.add(new Option(
                    item.ip_address,
                    item.ip_address
                ));

            });

            if (available.length === 0) {

                ipSelect.innerHTML = "";

                ipSelect.add(new Option(
                    "No IP addresses available",
                    ""
                ));

            }

            ipSelect.disabled = available.length === 0;

        } catch (error) {

            console.error(error);

            ipSelect.innerHTML = "";

            ipSelect.add(new Option(
                "Unable to load IP addresses",
                ""
            ));

        }
    }


    // ====================================
    // ADD ACTIVITY LOG
    // ====================================

    function addLog(message, type = "normal") {

        const empty = logsContainer.querySelector("p");

        if (empty) {
            logsContainer.innerHTML = "";
        }

        const entry = document.createElement("div");

        entry.className = "sim-log-entry";

        const time = document.createElement("small");

        time.textContent = new Date().toLocaleTimeString();

        const content = document.createElement("div");

        content.textContent = message;

        if (type === "success") {
            content.className = "success-message";
        }

        if (type === "error") {
            content.className = "error-message";
        }

        entry.append(time, content);

        logsContainer.prepend(entry);
    }


    // ====================================
    // UPDATE DORA STEP
    // ====================================

    function updateStep(stepNumber) {

        for (let i = 1; i <= 4; i++) {

            const step = document.getElementById("dora" + i);

            step.classList.remove("active", "completed");

            if (i < stepNumber) {
                step.classList.add("completed");
            }

            if (i === stepNumber) {
                step.classList.add("active");
            }
        }
    }


    // ====================================
    // COMPLETE DORA WORKFLOW
    // ====================================

    function completeSteps() {

        for (let i = 1; i <= 4; i++) {

            const step = document.getElementById("dora" + i);

            step.classList.remove("active");
            step.classList.add("completed");
        }
    }


    // ====================================
    // RESET VISUAL WORKFLOW
    // ====================================

    function resetSteps() {

        for (let i = 1; i <= 4; i++) {

            document.getElementById("dora" + i)
                .classList.remove("active", "completed");

        }
    }


    // ====================================
    // FORMAT LEASE DURATION
    // ====================================

    function formatDuration(seconds) {

        if (seconds < 60) {
            return seconds + " seconds";
        }

        if (seconds < 3600) {
            return (seconds / 60) + " minutes";
        }

        if (seconds < 86400) {
            return (seconds / 3600) + " hours";
        }

        return (seconds / 86400) + " days";
    }


    // ====================================
    // RUN DORA SIMULATION
    // ====================================

    async function startSimulation() {

        if (running) return;

        const client = clientName.value.trim();
        const mac = macAddress.value.trim();
        const ip = ipSelect.value;
        const duration = Number(leaseDuration.value);

        if (!client || !mac || !ip) {

            statusBox.textContent =
                "Please enter client name, MAC address and select an IP.";

            statusBox.className = "sim-status error-message";

            return;
        }

        const macPattern =
            /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

        if (!macPattern.test(mac)) {

            statusBox.textContent =
                "Invalid MAC address. Use format AA:BB:CC:DD:EE:FF.";

            statusBox.className = "sim-status error-message";

            return;
        }

        if (!Number.isInteger(duration) || duration < 10 || duration > 31536000) {

            statusBox.textContent =
                "Lease duration must be between 10 seconds and 365 days.";

            statusBox.className = "sim-status error-message";

            return;
        }

        running = true;

        startButton.disabled = true;
        clearButton.disabled = true;

        resetSteps();

        logsContainer.innerHTML = "";

        statusBox.className = "sim-status";
        statusBox.textContent = "Starting DHCP DORA process...";

        try {

            // STEP 1: DISCOVER

            updateStep(1);

            statusBox.textContent =
                "DISCOVER: " + client +
                " broadcasts a DHCP discovery message.";

            addLog(client + " broadcasts DHCPDISCOVER.");

            await sleep(1000);


            // STEP 2: OFFER

            updateStep(2);

            statusBox.textContent =
                "OFFER: DHCP server offers " + ip + ".";

            addLog(
                "DHCP server offers IP address " + ip + "."
            );

            await sleep(1000);


            // STEP 3: REQUEST

            updateStep(3);

            statusBox.textContent =
                "REQUEST: " + client +
                " requests " + ip + ".";

            addLog(
                client + " sends DHCPREQUEST for " + ip + "."
            );

            await sleep(1000);


            // STEP 4: ACKNOWLEDGEMENT

            updateStep(4);

            statusBox.textContent =
                "ACK: Server is confirming the allocation.";

            addLog(
                "DHCP server sends DHCPACK for " + ip + "."
            );

            await sleep(700);


            // SAVE ALLOCATION AND LEASE TO DATABASE

            const response = await fetch(
                "/api/ip-addresses/allocate",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({

                        ip_address: ip,

                        client_name: client,

                        mac_address: mac,

                        lease_duration_seconds: duration

                    })
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {

                throw new Error(
                    result.message || "IP allocation failed."
                );
            }


            // SUCCESSFUL ALLOCATION

            completeSteps();

            const expiryDate = result.lease_expires_at
                ? new Date(result.lease_expires_at).toLocaleString()
                : "Not available";

            statusBox.className =
                "sim-status success-message";

            statusBox.innerHTML = "";

            const success = document.createElement("div");
            success.textContent =
                "SUCCESS! " + client + " received " + ip + ".";

            const durationInfo = document.createElement("div");
            durationInfo.textContent =
                "Lease Duration: " + formatDuration(duration);

            const expiryInfo = document.createElement("div");
            expiryInfo.textContent =
                "Lease Expires At: " + expiryDate;

            statusBox.append(
                success,
                durationInfo,
                expiryInfo
            );

            addLog(
                client + " successfully allocated " + ip + ".",
                "success"
            );

            addLog(
                "DHCP lease duration: " + formatDuration(duration) + "."
            );

            addLog(
                "Lease expires at: " + expiryDate + "."
            );

        } catch (error) {

            statusBox.textContent = error.message;

            statusBox.className =
                "sim-status error-message";

            addLog(error.message, "error");

            resetSteps();

        } finally {

            running = false;

            startButton.disabled = false;
            clearButton.disabled = false;

            await loadAvailableIPs();

        }
    }


    // ====================================
    // CLEAR SIMULATION DISPLAY
    // ====================================

    function clearSimulation() {

        if (running) return;

        resetSteps();

        logsContainer.innerHTML =
            "<p>No simulation events yet.</p>";

        statusBox.textContent =
            "Simulation display cleared. Existing IP allocations are unchanged.";

        statusBox.className = "sim-status";

        clientName.value = "";
        macAddress.value = "";

        loadAvailableIPs();
    }


    // ====================================
    // EVENT LISTENERS
    // ====================================

    startButton.addEventListener(
        "click",
        startSimulation
    );

    clearButton.addEventListener(
        "click",
        clearSimulation
    );


    // ====================================
    // INITIAL LOAD
    // ====================================

    loadAvailableIPs();

});
