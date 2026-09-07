# Absence Tracker System

A teacher-facing absence management application with a React frontend, Express backend, and PostgreSQL database.

## Structure

- `AbsenceApp/frontend` - React application
- `AbsenceApp/backend` - Express API and PostgreSQL connection
- `AbsenceApp/Misc/NGINX-DEPLOY.md` - Nginx and systemd deployment guide

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

## Production With Nginx

Build the React frontend and serve its `build` directory with Nginx:

```bash
cd AbsenceApp/frontend
npm install
npm run build
```

Run the backend as a systemd service on `127.0.0.1:5000`. Nginx should proxy `/login/`, `/students/`, and `/absences` to the backend and serve the React SPA for all other routes.

Follow the complete instructions in [AbsenceApp/Misc/NGINX-DEPLOY.md](AbsenceApp/Misc/NGINX-DEPLOY.md).

## Updating A Deployed Server

```bash
git pull origin main
cd AbsenceApp/frontend
npm install
npm run build
cd ../backend
npm install
sudo systemctl restart attendance-backend
sudo systemctl restart nginx
```

Nginx does not need to be rebuilt. Production frontend source changes require `npm run build` because Nginx serves the generated static files. During development, use `npm start` for automatic browser reloads. CI/CD can automate the production build and deployment after each GitHub push.

## Security

Use HTTPS outside a trusted local network. Keep PostgreSQL credentials and other secrets out of Git. Keep the backend bound to localhost behind Nginx. The development server may listen on the LAN only for trusted local use. Server-side authentication and password hashing should be added before exposing the application to an untrusted network.

## Basic Production Security Steps

These steps assume that you know the fixed IP address of every teacher device. Replace the example addresses with the real addresses. A firewall and Nginx can block the app, but they cannot prevent a student from flooding the whole network connection.

### 1. Allow only teacher IP addresses

Give each teacher device a fixed DHCP reservation first. Then run this on the server:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.10.21 to any port 80 proto tcp
sudo ufw allow from 192.168.10.22 to any port 80 proto tcp
sudo ufw allow from 192.168.10.21 to any port 443 proto tcp
sudo ufw allow from 192.168.10.22 to any port 443 proto tcp
sudo ufw enable
sudo ufw status verbose
```

Add one pair of rules for each teacher IP. Do not allow ports `5000` or `5432` from the network.

### 2. Keep Node and PostgreSQL private

In `/etc/systemd/system/attendance-backend.service`, use:

```ini
Environment=HOST=127.0.0.1
Environment=PORT=5000
```

After changing it:

```bash
sudo systemctl daemon-reload
sudo systemctl restart attendance-backend
sudo ss -ltnp | grep -E ':5000|:5432'
```

Port `5000` and PostgreSQL port `5432` should show `127.0.0.1`, not `0.0.0.0`.

### 3. Add basic Nginx protection

First edit `/etc/nginx/nginx.conf`. Add these lines inside the existing `http { ... }` block:

```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;
limit_conn_zone $binary_remote_addr zone=connection_limit:10m;
```

Next edit `/etc/nginx/sites-available/attendance-app`. Inside the existing `server { ... }` block, add the teacher IP allowlist and connection limit:

```nginx
allow 192.168.10.21;
allow 192.168.10.22;
deny all;
limit_conn connection_limit 20;
```

Then add the `limit_req` line inside each existing API location. Do not create duplicate locations:

```nginx
location /login/ {
	limit_req zone=login_limit burst=3 nodelay;
	proxy_pass http://127.0.0.1:5000;
	# Keep the proxy_set_header lines already in this location.
}

location /students/ {
	limit_req zone=api_limit burst=20 nodelay;
	proxy_pass http://127.0.0.1:5000;
}

location /absences {
	limit_req zone=api_limit burst=20 nodelay;
	proxy_pass http://127.0.0.1:5000;
}
```

Add the same `allow` lines for every teacher IP. Test and reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Protect the service secrets

Keep the database password and session secret in `/etc/attendance-app/backend.env`, not in Git:

```bash
sudo chown root:YOUR_LINUX_USER /etc/attendance-app/backend.env
sudo chmod 640 /etc/attendance-app/backend.env
```

Replace `YOUR_LINUX_USER` with the user in the systemd unit. Run the backend as that non-root user, not as `root`.

### 5. Protect PostgreSQL

- Use a separate database user for this app, not the PostgreSQL administrator.
- Allow PostgreSQL connections only from localhost.
- Never expose port `5432` to students or the general LAN.
- Remove the fallback database password from `server.js` before production.
- Back up the database and test restoring it.

### 6. Check logs

```bash
sudo journalctl -u attendance-backend -f
sudo tail -f /var/log/nginx/access.log
```

Look for repeated requests, login failures, and many `429` responses. These settings reduce application-level attacks. A large attack that saturates the network still requires help from the network administrator, hosting provider, VPN, or DDoS protection service.
