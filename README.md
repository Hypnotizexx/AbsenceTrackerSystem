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

### 4. Delete the old application database

This deletes only the old database and role for this application. It permanently deletes their data. Never drop the PostgreSQL system databases `postgres`, `template0`, or `template1`.

First list the databases and roles so you can identify the old application names:

```bash
sudo -u postgres psql -d postgres -c "\l"
sudo -u postgres psql -d postgres -c "\du"
```

If the old application used different names, replace `OLD_DATABASE_NAME` and `OLD_DATABASE_USER` below. Do not use these commands for a database used by another application:

```bash
sudo -u postgres psql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'OLD_DATABASE_NAME' AND pid <> pg_backend_pid();"
sudo -u postgres dropdb --if-exists OLD_DATABASE_NAME
sudo -u postgres dropuser --if-exists OLD_DATABASE_USER
```

For the deployment in this README, the fresh names are `absence_data` and `absence_app`. If an earlier installation used these names, reset them with:

```bash
sudo -u postgres psql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'absence_data' AND pid <> pg_backend_pid();"
sudo -u postgres dropdb --if-exists absence_data
sudo -u postgres dropuser --if-exists absence_app
```

### 5. Create the compatible PostgreSQL database

Create a dedicated role and database. Use a strong password when prompted:

```bash
sudo -u postgres createuser --pwprompt absence_app
sudo -u postgres createdb --owner=absence_app absence_data
```

Create the tables. This schema is compatible with the React/Node app and the `/home/ss/123/Gestionnaire-d-Absences-master` extractor:

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 -d absence_data <<'SQL'
SET ROLE absence_app;

CREATE TABLE absences (
	id SERIAL PRIMARY KEY,
	date DATE NOT NULL,
	debut TIME NOT NULL,
	fin TIME NOT NULL,
	classe TEXT NOT NULL,
	code TEXT NOT NULL,
	nom TEXT NOT NULL,
	duree INTEGER NOT NULL CHECK (duree >= 0),
	motif INTEGER NOT NULL CHECK (motif IN (5, 6, 7, 8, 9)),
	justifiee BOOLEAN NOT NULL DEFAULT FALSE,
	CONSTRAINT absences_unique_record UNIQUE (date, code, debut, fin)
);

CREATE TABLE eleves (
	code TEXT PRIMARY KEY,
	nom TEXT NOT NULL,
	classe TEXT NOT NULL
);

CREATE TABLE encadrants (
	nom TEXT PRIMARY KEY,
	mdp TEXT NOT NULL,
	classes TEXT[] NOT NULL
);

CREATE INDEX absences_date_classe_idx ON absences (date, classe);
CREATE INDEX eleves_classe_idx ON eleves (classe);
SQL
```

The `classes TEXT[]` column is intentional: the reference Python app sends a list of classes, while the Node backend can read PostgreSQL arrays and authorize teachers correctly. The `motif` values mean `5` maladie, `6` concours français, `7` autre, `8` grève des élèves, and `9` sanction.

The `/home/ss/123/Gestionnaire-d-Absences-master` application reads these same tables directly. For the most secure deployment, run that extractor on the PostgreSQL server or through a private VPN so PostgreSQL can remain bound to localhost. If it must run from another fixed-IP computer, do not open PostgreSQL to the whole LAN: allow only that extractor IP in `pg_hba.conf` and the firewall, use a dedicated read/write database role, and enable PostgreSQL TLS.

Check the result before continuing:

```bash
sudo -u postgres psql -d absence_data -c "\dt"
sudo -u postgres psql -d absence_data -c "\d absences"
sudo -u postgres psql -d absence_data -c "\d eleves"
sudo -u postgres psql -d absence_data -c "\d encadrants"
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

### 6. Create the systemd backend service

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

### 7. Configure Nginx

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

### 8. Configure the firewall

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

### 9. Use HTTPS and monitor

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
