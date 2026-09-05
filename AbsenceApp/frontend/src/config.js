
// Production is served by Nginx, so API calls stay on the same origin.
const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL ||
  (process.env.NODE_ENV === "production"
    ? window.location.origin
    : `http://${window.location.hostname || "localhost"}:5000`);

export default API_BASE_URL;
