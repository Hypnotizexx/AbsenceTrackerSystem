# Absence Tracker System

A teacher-facing absence management application with a React frontend, Express backend, and PostgreSQL database.

## Structure

- `AbsenceApp/frontend` - React application
- `AbsenceApp/backend` - Express API and PostgreSQL connection

## Secure Production Setup

Run these steps in order on the production server. All teachers access the app through the server's LAN address.

### 1. Remove the previous app deployment

These commands remove the old app service, Nginx site, secrets, and application files.

```bash
sudo systemctl disable --now attendance-backend 2>/dev/null || true
sudo rm -f /etc/systemd/system/attendance-backend.service
sudo systemctl daemon-reload
sudo rm -f /etc/nginx/sites-enabled/attendance-app
sudo rm -f /etc/nginx/sites-available/attendance-app
sudo rm -rf /etc/attendance-app
```

```bash
sudo rm -rf /opt/attendance-app
```

### 2. Install the software

```bash
sudo apt update
sudo apt install -y git curl nginx nodejs npm postgresql ufw
```

### 3. Connect to PostgreSQL and reset the database

Connect as the PostgreSQL administrator:

```bash
sudo -u postgres psql -d postgres
```

Check the connection, then exit:

```sql
\conninfo
\l
\du
\q
```

Delete the old application database and role. This permanently deletes the old app data. Do not delete `postgres`, `template0`, or `template1`:

```bash
sudo -u postgres psql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'absence_data' AND pid <> pg_backend_pid();"
sudo -u postgres dropdb --if-exists absence_data
sudo -u postgres dropuser --if-exists absence_app
```

Create the new role and database:

```bash
sudo -u postgres createuser --pwprompt absence_app
sudo -u postgres createdb --owner=absence_app absence_data
```

Use the same password for the Node backend and the `/home/ss/123` app:

```text
Database: absence_data
User: absence_app
Password: the password entered above
Host: 127.0.0.1 when /home/ss/123 runs on the server
Port: 5432
```

Test the new credentials:

```bash
psql -h 127.0.0.1 -U absence_app -d absence_data
```

Run `\conninfo`, then exit with `\q`.

Create the compatible tables:

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

### 4. Download and build the app

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

### 5. Configure backend credentials

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
PGPASSWORD=REPLACE_WITH_THE_PASSWORD_USED_ABOVE
SESSION_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
```

Set the `/home/ss/123` app to the same database name, user, password, host, and port. React uses Nginx and never receives PostgreSQL credentials.

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

Replace `SERVER_IP_OR_DOMAIN`. Nginx will be reachable by all devices on the local network. Enable the site and remove the default site:

```bash
sudo ln -s /etc/nginx/sites-available/attendance-app /etc/nginx/sites-enabled/attendance-app
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

### 8. Configure the firewall

Allow web traffic from the local network. Teacher device IP addresses do not need to be fixed:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

This allows every device on the local network to reach Nginx. Never open port `5000` to the LAN. Keep PostgreSQL on localhost if `/home/ss/123` runs on the server. If that app runs on another computer, PostgreSQL port `5432` must be allowed for the local network and the database host must be protected by the network firewall. Verify the services:

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
