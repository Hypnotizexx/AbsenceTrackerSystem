# Absence Tracker System

A teacher-facing absence management application with a React frontend, Express backend, and PostgreSQL database.

## Structure

- `AbsenceApp/frontend` - React application
- `AbsenceApp/backend` - Express API and PostgreSQL connection
- `AbsenceApp/Misc` - Database notes and other deployment material

## Quick Start

```bash
git clone https://github.com/Hypnotizexx/AbsenceTrackerSystem.git
cd AbsenceTrackerSystem/AbsenceApp

cd backend
npm install
npm start
```

In another terminal:

```bash
cd AbsenceTrackerSystem/AbsenceApp/frontend
npm install
npm start
```

Open `http://localhost:3000`. The development frontend uses the backend on port `5000`.

To use the development app from another device on the same local network, find the server's LAN address with `hostname -I`, then start both services so they listen on the network:

```bash
# Terminal 1: backend
cd AbsenceApp/backend
HOST=0.0.0.0 npm start

# Terminal 2: frontend
cd AbsenceApp/frontend
HOST=0.0.0.0 npm start
```

Open `http://SERVER_LAN_IP:3000` on the other device. The frontend automatically sends API requests to `http://SERVER_LAN_IP:5000`. Allow ports `3000` and `5000` in the server firewall only on a trusted local network. For the Nginx setup, use `http://SERVER_LAN_IP` and keep port `5000` private.

Set PostgreSQL connection values through environment variables before starting the backend:

```bash
export PGHOST=localhost
export PGPORT=5432
export PGUSER=postgres
export PGDATABASE=data
export PGPASSWORD='your-database-password'
export SESSION_SECRET='a-long-random-local-secret'
```

## Secure Production Deployment

These steps deploy the app behind Nginx, with the backend and database private. They assume teacher devices have fixed IP addresses. Replace every placeholder before running a command.

### 1. Start fresh

Run these only if this server has an old deployment of this app. Do not remove the Nginx default site or other sites you still use.

```bash
sudo systemctl disable --now attendance-backend 2>/dev/null || true
sudo rm -f /etc/systemd/system/attendance-backend.service
sudo systemctl daemon-reload
sudo rm -f /etc/nginx/sites-enabled/attendance-app
sudo rm -f /etc/nginx/sites-available/attendance-app
sudo rm -rf /etc/attendance-app
```

If the old application is stored at `/opt/attendance-app` and you no longer need it:

```bash
sudo rm -rf /opt/attendance-app
```

Do not run the last command if that directory contains data you need.

### 2. Install the software

```bash
sudo apt update
sudo apt install -y git curl nginx nodejs npm postgresql ufw
```

### 3. Download and build the app

```bash
sudo mkdir -p /opt/attendance-app
sudo chown "$USER":"$USER" /opt/attendance-app
git clone https://github.com/Hypnotizexx/AbsenceTrackerSystem.git /opt/attendance-app

cd /opt/attendance-app/AbsenceApp/backend
npm install

cd /opt/attendance-app/AbsenceApp/frontend
npm install
npm run build
```

### 4. Prepare PostgreSQL and secrets

Create a dedicated database user and database. Use your own strong password:

```bash
sudo -u postgres createuser --pwprompt absence_app
sudo -u postgres createdb --owner=absence_app absence_data
```

Create the secret file:

```bash
sudo install -d -m 750 /etc/attendance-app
sudo nano /etc/attendance-app/backend.env
```

Put this in the file:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=5000
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=absence_app
PGDATABASE=absence_data
PGPASSWORD=REPLACE_WITH_DATABASE_PASSWORD
SESSION_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
```

Restrict the file:

```bash
sudo chown root:YOUR_LINUX_USER /etc/attendance-app/backend.env
sudo chmod 640 /etc/attendance-app/backend.env
```

Replace `YOUR_LINUX_USER` with the Linux user that will run the backend. Do not commit this file.

### 5. Create the systemd backend service

Create `/etc/systemd/system/attendance-backend.service`:

```ini
[Unit]
Description=Absence App Backend
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/attendance-app/AbsenceApp/backend
ExecStart=/usr/bin/npm start
EnvironmentFile=/etc/attendance-app/backend.env
User=YOUR_LINUX_USER
Group=YOUR_LINUX_USER
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/attendance-app/AbsenceApp/backend

[Install]
WantedBy=multi-user.target
```

Start it and confirm it is running:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now attendance-backend
sudo systemctl status attendance-backend
```

### 6. Configure Nginx

Edit `/etc/nginx/nginx.conf`. Add these lines inside the existing `http { ... }` block:

```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;
limit_conn_zone $binary_remote_addr zone=connection_limit:10m;
```

Create `/etc/nginx/sites-available/attendance-app`:

```nginx
server {
	listen 80;
	server_name SERVER_IP_OR_DOMAIN;
	root /opt/attendance-app/AbsenceApp/frontend/build;
	index index.html;

	allow TEACHER_IP_1;
	allow TEACHER_IP_2;
	deny all;
	limit_conn connection_limit 20;

	location / {
		try_files $uri /index.html;
	}

	location /login/ {
		limit_req zone=login_limit burst=3 nodelay;
		proxy_pass http://127.0.0.1:5000;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
	}

	location = /logout {
		proxy_pass http://127.0.0.1:5000;
	}

	location /students/ {
		limit_req zone=api_limit burst=20 nodelay;
		proxy_pass http://127.0.0.1:5000;
	}

	location /absences {
		limit_req zone=api_limit burst=20 nodelay;
		proxy_pass http://127.0.0.1:5000;
	}
}
```

Replace `SERVER_IP_OR_DOMAIN`, `TEACHER_IP_1`, and `TEACHER_IP_2`. Add one `allow` line for every teacher device. Enable the site and remove the default site:

```bash
sudo ln -s /etc/nginx/sites-available/attendance-app /etc/nginx/sites-enabled/attendance-app
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

### 7. Configure the firewall

Allow web traffic only from the fixed teacher IPs. Add one pair for each teacher:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from TEACHER_IP_1 to any port 80 proto tcp
sudo ufw allow from TEACHER_IP_1 to any port 443 proto tcp
sudo ufw allow from TEACHER_IP_2 to any port 80 proto tcp
sudo ufw allow from TEACHER_IP_2 to any port 443 proto tcp
sudo ufw enable
sudo ufw status verbose
```

Never open ports `5000` or `5432` to the LAN. Verify the services are private:

```bash
sudo ss -ltnp | grep -E ':5000|:5432'
```

Both should show `127.0.0.1`, not `0.0.0.0`.

### 8. Use HTTPS and monitor

For access outside a trusted LAN, configure a TLS certificate and redirect HTTP to HTTPS. Check the services with:

```bash
sudo journalctl -u attendance-backend -f
sudo tail -f /var/log/nginx/access.log
```

These settings reduce application-level attacks and prevent direct access to Node or PostgreSQL. They cannot stop an attacker from saturating the entire network connection; that requires network-level DDoS protection.

## Updating A Deployed Server

```bash
cd /opt/attendance-app
git pull origin main
cd AbsenceApp/frontend
npm install
npm run build
cd ../backend
npm install
sudo systemctl restart attendance-backend
sudo systemctl reload nginx
```

Nginx does not need to be rebuilt. Frontend changes require `npm run build` because Nginx serves the generated files.
