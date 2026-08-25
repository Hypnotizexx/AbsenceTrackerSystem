// src/config.js
// NETWORK CONFIG NOTES:
// - For testing without Nginx, frontend calls backend directly on :5000
//   using the current browser hostname (IP or absence-app.local).
// - Example: http://absence-app.local:3000 -> API http://absence-app.local:5000
// - To force a specific backend URL, set:
//   REACT_APP_API_BASE_URL=http://<SERVER_IP_OR_NAME>:5000
const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL ||
  `http://${window.location.hostname}:5000`;

export default API_BASE_URL;
