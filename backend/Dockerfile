FROM python:3.12.9-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libffi-dev \
    libssl-dev \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Download subfinder binary (pinned version for deterministic builds)
RUN curl -sSL \
    https://github.com/projectdiscovery/subfinder/releases/download/v2.6.6/subfinder_2.6.6_linux_amd64.zip \
    -o /tmp/subfinder.zip \
    && unzip /tmp/subfinder.zip -d /tmp/subfinder-bin \
    && mv /tmp/subfinder-bin/subfinder /install/bin/subfinder \
    && chmod +x /install/bin/subfinder \
    && rm -rf /tmp/subfinder.zip /tmp/subfinder-bin

# ── Stage 2: Runtime image ────────────────────────────────────────────────────
FROM python:3.12.9-slim

WORKDIR /app

# System tools required by the Recon Engine at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    nmap \
    whois \
    traceroute \
    dnsutils \
    theharvester \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages (including subfinder) from builder
COPY --from=builder /install /usr/local

# Copy application source
COPY . .

# Ensure scripts in .local are usable
ENV PATH=/root/.local/bin:$PATH

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
