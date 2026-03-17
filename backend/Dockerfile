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

# theHarvester: distributed via pip only (not in Debian Bookworm apt repos).
# Installed here so it shares the same Python prefix and gets copied to runtime.
# Falls back gracefully — passive module is simply marked unavailable.
RUN pip install --no-cache-dir --prefix=/install 'theHarvester>=4.4.0' \
    || echo "WARNING: theHarvester install failed — passive module will be unavailable"

# Download subfinder binary (pinned version for deterministic builds).
# --fail ensures curl exits non-zero on HTTP errors instead of saving HTML.
# Falls back gracefully — subdomains module is simply marked unavailable.
RUN mkdir -p /install/bin \
    && curl -fsSL --retry 3 --retry-delay 2 \
        https://github.com/projectdiscovery/subfinder/releases/download/v2.6.6/subfinder_2.6.6_linux_amd64.zip \
        -o /tmp/subfinder.zip \
    && unzip -q /tmp/subfinder.zip -d /tmp/subfinder-bin \
    && mv /tmp/subfinder-bin/subfinder /install/bin/subfinder \
    && chmod +x /install/bin/subfinder \
    && rm -rf /tmp/subfinder.zip /tmp/subfinder-bin \
    || echo "WARNING: subfinder download failed — subdomains module will be unavailable"

# ── Stage 2: Runtime image ────────────────────────────────────────────────────
FROM python:3.12.9-slim

WORKDIR /app

# System tools required by the Recon Engine at runtime.
# Note: theHarvester is installed via pip in the builder stage (not in apt repos).
RUN apt-get update && apt-get install -y --no-install-recommends \
    nmap \
    whois \
    traceroute \
    dnsutils \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages (including subfinder) from builder
COPY --from=builder /install /usr/local

# Copy application source
COPY . .

# Ensure scripts in .local are usable
ENV PATH=/root/.local/bin:$PATH

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
