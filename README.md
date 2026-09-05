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
