# NetSim – DHCP Network Configuration Simulator

A web-based DHCP simulation and IP address management platform developed using Python, Flask, SQLite, HTML, CSS, and JavaScript.

## Overview

NetSim demonstrates the Dynamic Host Configuration Protocol (DHCP) through an interactive web application. It provides centralized IP address management, DHCP DORA simulation, lease monitoring, network topology visualization, and activity tracking.

## Features

- **Dashboard:** Overview of network and IP allocation statistics.
- **Network Topology:** Visual representation of the DHCP server and connected clients.
- **IP Management:** IP address allocation, release, and status monitoring.
- **Lease Management:** Lease renewal, countdown timers, and automatic lease expiration.
- **DHCP Simulation:** Interactive Discover, Offer, Request, and Acknowledgment (DORA) workflow.
- **Activity Logs:** Tracks IP allocation, release, lease renewal, and lease expiration.

## Technology Stack

| Component | Technology |
|---|---|
| Backend | Python, Flask |
| Frontend | HTML5, CSS3, JavaScript |
| Database | SQLite |
| API Communication | REST APIs |
| Development Environment | Visual Studio Code |

## IP Address Pool

The simulator uses 100 private IP addresses:

`192.168.1.100 – 192.168.1.199`

## Project Structure

```text
DHCP_Network_Simulator/
│
├── app.py
├── requirements.txt
├── .gitignore
│
├── templates/
│   ├── index.html
│   ├── topology.html
│   ├── ip_management.html
│   ├── lease_management.html
│   ├── simulation.html
│   └── activity_logs.html
│
└── static/
    ├── style.css
    ├── script.js
    ├── topology.js
    ├── simulation.js
    ├── lease_management.js
    └── activity_logs.js
```

## Installation and Setup

### 1. Clone the repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd DHCP_Network_Simulator
```

### 2. Create a virtual environment

```bash
python -m venv venv
```

### 3. Activate the virtual environment

Windows PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
```

### 4. Install dependencies

```bash
pip install -r requirements.txt
```

### 5. Run the application

```bash
python app.py
```

### 6. Open the application

Visit:

`http://127.0.0.1:8080`

## DHCP DORA Process

1. **Discover:** Client searches for a DHCP server.
2. **Offer:** Server offers an available IP address.
3. **Request:** Client requests the offered address.
4. **Acknowledgment:** Server confirms the IP allocation.

## Database

The application uses SQLite to maintain IP address records and activity history. The local database files are excluded from version control; the application initializes or migrates its database as implemented in the backend.

## Project Scope

NetSim is an educational DHCP simulator designed to demonstrate DHCP operations and IP address management. It does not replace a production DHCP server or configure real network devices.

## Future Enhancements

- Multiple subnet support.
- VLAN integration.
- Administrator authentication.
- Real DHCP server integration.
- Advanced network monitoring and reporting.

## Author

Developed as an academic Computer Science and Engineering project.

**Project:** NetSim – DHCP Network Configuration Simulator
