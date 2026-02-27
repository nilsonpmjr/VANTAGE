# 🛡️ Threat Intelligence Tool

[![Python](https://img.shields.io/badge/Python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![React](https://img.shields.io/badge/React-18.x-61dafb.svg)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A powerful, high-performance web application and CLI tool to aggregate threat intelligence from multiple sources. Rapidly scan IPs, Domains, and File Hashes to get a comprehensive security verdict.

Integrated Sources: **VirusTotal, AbuseIPDB, Shodan, AlienVault OTX, GreyNoise, UrlScan.io, and BlacklistMaster**.

## ✨ Features

- 🎨 **Modern Web Dashboard** - Premium Dark Mode / Glassmorphism UI built with React, Vite, and Tailwind CSS.
- 🚀 **FastAPI Backend** - High-concurrency async Python backend for parallel API querying.
- 🧠 **Heuristic Analysis** - Automatic contextual summaries of targets written in natural language.
- 🌍 **Multi-language Support (i18n)** - English (EN), Portuguese (PT-BR), and Spanish (ES) supported natively across the UI and Analysis Engine.
- 🔒 **Robust Validation** - Protection against malicious inputs and invalid queries.
- 💻 **CLI Fallback** - Includes an interactive Console Dashboard for terminal power users.

## 📋 Requirements

- **Backend:** Python 3.9+
- **Frontend:** Node.js 18+

## 🚀 Installation

```bash
# Clone the repository
git clone https://github.com/nilsonpmjr/Threat-Intelligence-Tool.git
cd Threat-Intelligence-Tool

# 1. Install Python backend dependencies
pip install -r requirements.txt
pip install fastapi uvicorn

# 2. Install Frontend dependencies
cd web
npm install
cd ..
```

## ⚙️ Configuration

Set your API keys as environment variables in your shell (`.bashrc`, `.zshrc`, or Windows Environment Variables), or use a `.env` file in the root directory:

```bash
export VT_API_KEY='your_key'
export ABUSEIPDB_API_KEY='your_key'
export SHODAN_API_KEY='your_key'
export OTX_API_KEY='your_key'
export GREYNOISE_API_KEY='your_key'
export URLSCAN_API_KEY='your_key'
export BLACKLISTMASTER_API_KEY='your_key'
```

*Note: The tool gracefully handles missing keys by simply skipping those specific services.*

## 📖 Usage

### Web Interface (Recommended)

Start the local servers to launch the unified SOC Dashboard:

```bash
# Terminal 1: Start the API Backend (Root directory)
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Start the Frontend (Inside /web directory)
cd web
npm run dev
```

Navigate to `http://localhost:5173` to access the interactive Threat Intelligence Hub. The UI features dynamic animations, real-time fetching, and instant language switching.

### Command Line Interface (CLI)

If you prefer the terminal, you can still use the traditional CLI script:

```bash
# Basic Analysis
./threat_check.py 8.8.8.8
./threat_check.py google.com
./threat_check.py 44d88612fea8a8f36de82e1278abb02f

# Advanced Options
./threat_check.py 8.8.8.8 --lang es       # Enforce language (pt, en, es)
./threat_check.py 8.8.8.8 --dashboard     # Grid View (Dashboard Mode)
```

## 🤝 Contributing

Pull requests are welcome! Please read our Contributing Guide.

## 📝 License

[MIT](https://choosealicense.com/licenses/mit/)
