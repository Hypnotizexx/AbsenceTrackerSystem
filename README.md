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

## Production Hardening Against Network Attacks

If the app is hosted on a school or home LAN, a student who can inspect network traffic may learn the server IP address. Nginx and systemd improve the service, but they cannot stop someone from flooding the server or the network link. Use the controls below to reduce the attack surface and make application-level flooding less effective.

### Restrict who can reach the app

If only teachers or administrators need access, do not allow every device on the LAN. Prefer a separate teacher VLAN or a VPN. Otherwise, allow only the trusted teacher subnet or known teacher IP addresses in the firewall:

```bash
# Example: allow HTTP only from the teacher network.
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.10.0/24 to any port 80 proto tcp
sudo ufw allow from 192.168.10.0/24 to any port 443 proto tcp
sudo ufw enable
sudo ufw status verbose
```

Replace the subnet with the real trusted network. Do not open port `5000` or PostgreSQL port `5432` in the firewall. If teachers use a VPN, allow the VPN subnet instead of the general Wi-Fi subnet. Use a stable DHCP reservation or firewall-managed IPs when allowlisting individual teacher devices.

### Keep the backend private

In the production systemd service, set:

```ini
Environment=HOST=127.0.0.1
Environment=PORT=5000
```

Verify the backend is not listening on the LAN:

```bash
sudo ss -ltnp | grep -E ':5000|:5432'
```

Port `5000` should show `127.0.0.1:5000`, not `0.0.0.0:5000`. PostgreSQL should likewise listen only on localhost unless it is intentionally hosted on a separate, protected database server.

### Add Nginx request limits

Inside the Nginx `http { ... }` block, add request and connection limits. The exact values depend on the number of teachers using the app:

```nginx
limit_req_zone $binary_remote_addr zone=api_per_ip:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login_per_ip:10m rate=5r/m;
limit_conn_zone $binary_remote_addr zone=connections_per_ip:10m;
```

Inside the app's `server { ... }` block, apply them to the API locations:

```nginx
limit_conn connections_per_ip 20;

location /login/ {
	limit_req zone=login_per_ip burst=3 nodelay;
	proxy_pass http://127.0.0.1:5000;
}

location /students/ {
	limit_req zone=api_per_ip burst=20 nodelay;
	proxy_pass http://127.0.0.1:5000;
}

location /absences {
	limit_req zone=api_per_ip burst=20 nodelay;
	proxy_pass http://127.0.0.1:5000;
}
```

Keep the existing proxy headers when adding these directives. Test and reload Nginx after changes:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

These limits help with application-layer abuse and password guessing. They do not stop a large volumetric attack that saturates the LAN or Internet connection.

### Harden systemd

Run the backend as a dedicated non-root user and keep its environment file readable only by that user:

```bash
sudo chown root:YOUR_LINUX_USER /etc/attendance-app/backend.env
sudo chmod 640 /etc/attendance-app/backend.env
```

Replace `YOUR_LINUX_USER` with the same service user configured in the systemd unit.

The service can also include basic isolation settings:

```ini
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/attendance-app/backend
```

After changing the unit file, run `sudo systemctl daemon-reload` and restart the service. Check logs with `sudo journalctl -u attendance-backend`.

### Protect PostgreSQL

- Use a dedicated database role for the application, not the PostgreSQL superuser.
- Grant only the tables and operations the backend needs.
- Keep `PGPASSWORD`, `SESSION_SECRET`, and other secrets in the protected systemd environment file, never in Git.
- Remove the fallback database password before production deployment and fail startup when required database variables are missing.
- Keep PostgreSQL bound to localhost or a private database network, and restrict `pg_hba.conf` to the application host.
- Back up the database regularly and test restoring a backup.

### Monitor and recover

Watch Nginx and backend logs for repeated requests, login failures, `429` responses, database pool exhaustion, and unusual traffic spikes. Keep the operating system, Node.js, Nginx, PostgreSQL, and dependencies updated. For attacks large enough to saturate the network connection, use a separate protected network, VPN gateway, reverse proxy/CDN, or DDoS protection from the network or hosting provider; host-level configuration cannot solve that problem after the link is already saturated.
