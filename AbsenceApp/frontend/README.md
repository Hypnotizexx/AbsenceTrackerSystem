# Absence Tracker

Teacher-facing absence management app with a React frontend, Express API, and PostgreSQL database.

## Repository Layout

```text
AbsenceApp/
├── backend/     Express API and PostgreSQL connection
└── frontend/    React application, frontend notes, and build output
```

## Requirements

- Node.js and npm
- PostgreSQL
- Nginx for production deployment

## Clone From GitHub

```bash
git clone https://github.com/Hypnotizexx/AbsenceTrackerSystem.git
cd AbsenceTrackerSystem/AbsenceApp
```

For a private repository, authenticate with GitHub using SSH or GitHub CLI. Never put a password or access token in the clone URL.

## Local Development

Install dependencies once:

```bash
cd frontend
npm install

cd ../backend
npm install
```

Configure PostgreSQL through environment variables when possible:

```bash
export PGHOST=localhost
export PGPORT=5432
export PGUSER=postgres
export PGDATABASE=data
export PGPASSWORD='your-database-password'
```

Start the backend:

```bash
cd backend
npm start
```

In another terminal, start the React development server:

```bash
cd frontend
npm start
```

Open `http://localhost:3000`. Development API requests use port `5000`; production requests use the current Nginx origin.

## Build For Nginx

Build the frontend on the server or in CI:

```bash
cd frontend
npm install
npm run build
```

The generated `frontend/build` directory is the static site that Nginx serves. The backend should run separately as a systemd service and listen on `127.0.0.1:5000`.

The complete secure production deployment is documented in the repository [README](../../README.md).

## Updating A Deployed Server

From the application directory:

```bash
git pull origin main

cd frontend
npm install
npm run build

cd ../backend
npm install
sudo systemctl restart attendance-backend
sudo systemctl restart nginx
```

Do not expose port `5000` publicly. Nginx should be the public entry point.

## Can I Edit Without Rebuilding?

Yes, for development. Run `npm start` in `frontend`; React watches source files and reloads the browser automatically. This is suitable for a development machine, not for public production traffic.

For the Nginx production deployment, the browser receives static files from `frontend/build`. Source changes do not appear there until `npm run build` is run and Nginx serves the updated files. Nginx itself does not need rebuilding; only the React bundle does.

To avoid manual production builds, use CI/CD: push to GitHub, let GitHub Actions build the frontend, copy the build to the server, then restart the backend only when backend files changed. Keep the build and deployment steps in a controlled server or deployment pipeline rather than running a development server publicly.

## Git Workflow

```bash
git status
git add .
git commit -m "Describe the change"
git push origin main
```

Never commit `.env` files, database passwords, private keys, or GitHub tokens.

## Security Notes

- Use HTTPS when the app is accessed beyond a trusted local machine.
- Keep PostgreSQL credentials in environment variables or a secret manager.
- Keep the backend bound to `127.0.0.1` behind Nginx.
- The current application still needs server-side authentication and password hashing before being exposed to an untrusted network.
