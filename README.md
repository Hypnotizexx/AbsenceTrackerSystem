# Absence Tracker System

A teacher-facing absence management application with a React frontend, Express backend, and PostgreSQL database.

## Structure

- `AbsenceApp/frontend` - React application
- `AbsenceApp/backend` - Express API and PostgreSQL connection

## Secure Production Deployment

These steps deploy the app behind Nginx on a trusted local network. All teachers can use the server's LAN address. The backend stays private on localhost; only Nginx is reachable over the LAN.

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

The old database belongs only to this application, so this reset deletes all of its old data and role. Never drop the PostgreSQL system databases `postgres`, `template0`, or `template1`.

Connect to PostgreSQL as the administrator first:

```bash
sudo -u postgres psql -d postgres
```

Verify the connection and list databases and roles:

```sql
\conninfo
\l
\du
\q
```

Exit PostgreSQL, terminate old connections, then delete the old application database and role:

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

Test the new application credentials before creating the tables. Enter the same password used when creating `absence_app`:

```bash
psql -h 127.0.0.1 -U absence_app -d absence_data
```

Inside the prompt, run `\conninfo`, then exit with `\q`.

Use these exact connection values in both applications:

| Setting | Node backend | `/home/ss/123` app |
|---|---|---|
| Database name | `absence_data` | `DB_NAME=absence_data` |
| Database user | `absence_app` | `DB_USER=absence_app` |
| Database password | The password entered above | `DB_PASS` with the same password |
| Database host | `127.0.0.1` on the server | `DB_HOST=127.0.0.1` if it runs on the server |
| Database port | `5432` | `5432` |

The React frontend does not connect to PostgreSQL directly and must never contain these credentials. It calls the Node backend through Nginx. If the `/home/ss/123` app runs on another computer, use the server's LAN address for `DB_HOST`; PostgreSQL must then be configured to accept connections from the local network.

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

The `/home/ss/123/Gestionnaire-d-Absences-master` application reads these same tables directly. Run it on the PostgreSQL server when possible so PostgreSQL can remain bound to localhost. If it runs on another trusted LAN computer, use the server LAN address in `DB_HOST`, allow that LAN in PostgreSQL, and protect the network with the firewall.

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

`PGPASSWORD` must be the same password used for `DB_PASS` in the `/home/ss/123` app. Set the reference app's settings to:

```text
DB_NAME: absence_data
DB_USER: absence_app
DB_PASS: same database password as PGPASSWORD
DB_HOST: 127.0.0.1 (or the server LAN address if the app runs on another computer)
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
