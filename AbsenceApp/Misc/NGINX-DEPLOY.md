# Absence App Deployment (Nginx)

This guide configures the app to be hosted using Nginx as a web server and reverse proxy. Users access the app through Nginx at the server's IP address or domain name. The browser calls the API through the same origin, so the backend port is not exposed publicly.

Replace `<server_ip>` with your server's actual IP address (e.g., `192.168.1.100`) or domain name throughout this guide.

---

## 1) Prepare server machine

On the machine that will host this app:

```bash
sudo apt update
sudo apt install -y git curl nginx nodejs npm
```

---

## 2) Deploy app code

```bash
cd /opt
sudo mkdir -p attendance-app
sudo chown -R "$USER":"$USER" attendance-app
cd attendance-app
```

Copy your project files into `/opt/attendance-app` (git clone or rsync/scp).

---

## 3) Install dependencies

```bash
cd /opt/attendance-app/frontend
npm install

cd /opt/attendance-app/backend
npm install
```

---

## 4) Frontend API base URL

In production, the frontend automatically uses the current Nginx origin for API requests. Do not set the API URL to port `5000` for the Nginx deployment.

Then build:

```bash
cd /opt/attendance-app/frontend
npm run build
```

---

## 5) Run backend with systemd

Create `/etc/systemd/system/attendance-backend.service`:

```ini
[Unit]
Description=Attendance App Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/attendance-app/backend
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=5000
Environment=HOST=127.0.0.1
Environment=PUBLIC_HOST=<server_ip>

# Optional DB overrides if you later switch from hardcoded values in server.js:
# Environment=PGHOST=localhost
# Environment=PGPORT=5432
# Environment=PGUSER=postgres
# Environment=PGPASSWORD=your_password
# Environment=PGDATABASE=data

User=YOUR_LINUX_USER
Group=YOUR_LINUX_USER

[Install]
WantedBy=multi-user.target
```

Important: replace `YOUR_LINUX_USER` with the real Linux user that owns `/opt/attendance-app` (example: `ss`).

Reload and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable attendance-backend
sudo systemctl start attendance-backend
sudo systemctl status attendance-backend
```

---

## 6) Configure Nginx to serve frontend

Create `/etc/nginx/sites-available/attendance-app`:

```nginx
server {
    listen 80;
    server_name <server_ip>;

    root /opt/attendance-app/frontend/build;
    index index.html;

    # React SPA routes
    location / {
        try_files $uri /index.html;
    }

    # Proxy backend API routes
    location /login/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /students/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /absences {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

}
```

Enable site and restart Nginx:

```bash
sudo ln -sf /etc/nginx/sites-available/attendance-app /etc/nginx/sites-enabled/attendance-app
sudo nginx -t
sudo systemctl restart nginx
```

---

## 7) Firewall

Open only the Nginx port:

```bash
sudo ufw allow 80/tcp
```

---

## 8) Access the app

From any machine:

1. Open `http://<server_ip>` in a browser.
2. Login as teacher.
3. If using a domain, ensure DNS is configured to point to `<server_ip>`.

---

## 9) Update workflow (new release)

```bash
cd /opt/attendance-app/frontend
npm install
npm run build

cd /opt/attendance-app/backend
npm install
sudo systemctl restart attendance-backend
sudo systemctl restart nginx
```

---

## Notes

- Frontend is static and served by Nginx on port 80.
- Backend runs as a localhost-only service on port `5000`; Nginx is the public entry point.
- For HTTPS, configure SSL certificates (e.g., via Let's Encrypt).
