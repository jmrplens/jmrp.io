# CSP Violation Reporter

This script is a lightweight Node.js service designed to collect Content Security Policy (CSP) violation reports from browsers, log them locally, and notify via Telegram.

## Features

- **Detailed Notifications:** Sends formatted HTML messages to Telegram with icons and key violation details.
- **JSON Attachments:** Attaches the full original CSP report as a `.json` file to each Telegram message for deep analysis.
- **Local Logging:** Records every violation in `logs/csp-violations.log` for long-term tracking.
- **Rate Limiting:** Prevents notification spam by limiting reports from the same IP and for the same blocked URI to once every 10 minutes.
- **Security Hardened:** Implements request body size limits (10KB) to prevent memory exhaustion (DoS) and escapes HTML input.
- **Zero Dependencies:** Uses native Node.js `http` and `https` modules. Includes a built-in `.env` parser to avoid external dependencies.

## Setup

### 1. Environment Variables

The script requires the following variables in your `.env` file:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
CSP_REPORTER_PORT=58291 # Optional, defaults to 58291
```

### 2. Systemd Service

Create a service file at `/etc/systemd/system/csp-reporter.service`:

```ini
[Unit]
Description=CSP Violation Reporter Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/jmrp.io_astro
ExecStart=/usr/bin/node scripts/csp-reporter.mjs
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### 3. Nginx Configuration

To route reports to the service, add a location block to your Nginx site configuration:

```nginx
# CSP Report Endpoint (Proxy to local Node.js service)
location /csp-report {
    access_log off;
    proxy_pass http://127.0.0.1:58291/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Then, update your `Content-Security-Policy` header to include the `report-uri`:

```nginx
add_header Content-Security-Policy "..."; report-uri /csp-report;" always;
```

## Usage

Once running, you can test the reporter using `curl`:

```bash
curl -X POST https://yourdomain.com/csp-report \
  -H "Content-Type: application/csp-report" \
  -d '{"csp-report":{"document-uri":"https://yourdomain.com/test","violated-directive":"script-src","blocked-uri":"https://evil.com/test.js"}}'
```
