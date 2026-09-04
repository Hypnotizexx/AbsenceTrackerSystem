
// Frontend API base URL: use the deployment override or the backend on the current host.
const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL ||
  `http://${window.location.hostname || "localhost"}:5000`;

export default API_BASE_URL;
