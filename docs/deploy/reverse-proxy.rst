Reverse Proxy
=============

In production, place VANTAGE behind a TLS-terminating reverse proxy.
The backend must **not** be directly reachable from the internet — it binds to
``127.0.0.1:8000`` by default.

Nginx (recommended)
--------------------

Minimal configuration for a single-domain deployment:

.. code-block:: nginx

   server {
       listen 80;
       server_name vantage.example.com;
       return 301 https://$host$request_uri;
   }

   server {
       listen 443 ssl http2;
       server_name vantage.example.com;

       ssl_certificate     /etc/letsencrypt/live/vantage.example.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/vantage.example.com/privkey.pem;

       # Frontend (React/Nginx container)
       location / {
           proxy_pass         http://127.0.0.1:80;
           proxy_set_header   Host $host;
           proxy_set_header   X-Real-IP $remote_addr;
           proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header   X-Forwarded-Proto $scheme;
       }

       # Backend API
       location /api/ {
           proxy_pass         http://127.0.0.1:8000;
           proxy_set_header   Host $host;
           proxy_set_header   X-Real-IP $remote_addr;
           proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header   X-Forwarded-Proto $scheme;
           proxy_read_timeout 120s;
       }
   }

After configuring the proxy, update ``CORS_ORIGINS`` in ``.env``:

.. code-block:: text

   CORS_ORIGINS=["https://vantage.example.com"]

Caddy (alternative)
--------------------

.. code-block:: text

   vantage.example.com {
       reverse_proxy /api/* localhost:8000
       reverse_proxy * localhost:80
   }

Caddy handles TLS automatically via Let's Encrypt.
