# 🛡️ Threat Intelligence Tool

[![Python](https://img.shields.io/badge/Python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A powerful and efficient tool to aggregate threat intelligence from multiple sources, including VirusTotal, AbuseIPDB, Shodan, AlienVault OTX, GreyNoise, and URLScan.

## ✨ Features

- 🚀 **Parallel Queries** - Fast results through highly concurrent APIs
- 🎨 **Web Dashboard** - Premium Dark Mode / Glassmorphism UI built with React & Vite
- 🧠 **Heuristic Analysis** - Automatic contextual summaries of targets
- 🌍 **Multi-language Support** - Portuguese (PT-BR) and English (EN)
- 🔒 **Robust Validation** - Protection against malicious inputs
- 📊 **Multiple Views** - Interactive Web Interface, Console Report, and Dashboards

## 📋 Requirements

- Python 3.9+ (Backend)
- Node.js 18+ (Frontend)
- `pip install -r requirements.txt`

## 🚀 Installation

```bash
# Clone the repository
git clone https://github.com/nilsonpmjr/Threat-Intelligence-Tool.git
cd Threat-Intelligence-Tool

# Install Python backend dependencies
pip install -r requirements.txt
pip install fastapi uvicorn

# Install Frontend dependencies
cd web
npm install
cd ..
```

## ⚙️ Configuration

Set your API keys as environment variables in your shell or `.bashrc`:

```bash
export VT_API_KEY='your_key'
export ABUSEIPDB_API_KEY='your_key'
export SHODAN_API_KEY='your_key'
export OTX_API_KEY='your_key'
export GREYNOISE_API_KEY='your_key'
export URLSCAN_API_KEY='your_key'
```

```

*Note: The tool gracefully handles missing keys by skipping those services.*

## 📖 Usage

### Web Interface (Recommended)

Start the local servers to launch the unified SOC Dashboard:

```bash
# 1. Start the API Backend (Root directory)
python -m uvicorn main:app --host 0.0.0.0 --port 8000

# 2. Start the Frontend (Inside /web directory)
cd web
npm run dev
```

Navigate to `http://localhost:5173` to access the interactive Threat Intelligence Hub.

## 📖 Usage

### Basic Usage

```bash
# Analyze an IP
./threat_check.py 8.8.8.8

# Analyze a domain
./threat_check.py google.com

# Analyze a file hash
./threat_check.py 44d88612fea8a8f36de82e1278abb02f
```

### Advanced Options

```bash
# Specify language (pt or en)
./threat_check.py 8.8.8.8 --lang en

# Dashboard Mode (Grid View)
./threat_check.py 8.8.8.8 --dashboard
```

## 📊 Output Examples

### Console Mode (Default)

```
RELATÓRIO DE INTELIGÊNCIA DE AMEAÇAS
────────────────────────────────────────────────────────
🎯 Alvo:    8.8.8.8
🔍 Tipo:    IP
🕒 Data/Hora: 2026-01-29 20:30:45 BRT
────────────────────────────────────────────────────────

╭─────────────────────────────────────────────────────────╮
│              🛡️  VEREDITO: SEGURO (0/6)                │
╰─────────────────────────────────────────────────────────╯
```

### Dashboard Mode

```
╭──────────────────── THREAT INTELLIGENCE REPORT ────────────────────╮
│                    8.8.8.8 (2026-01-29 20:30:45)                   │
╰────────────────────────────────────────────────────────────────────╯

┌─────────────────┬─────────────────┬─────────────────┐
│  VIRUSTOTAL     │   ABUSEIPDB     │    SHODAN       │
├─────────────────┼─────────────────┼─────────────────┤
│ Score: 0/93     │ Confidence: 0%  │ OS: Linux       │
│ Safe            │ Reports: 0      │ Ports: 53, 443  │
└─────────────────┴─────────────────┴─────────────────┘
```

## 🤝 Contributing

Pull requests are welcome! Please read our Contributing Guide.

## 📝 License

[MIT](https://choosealicense.com/licenses/mit/)
