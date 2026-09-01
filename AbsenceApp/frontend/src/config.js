
// LOCAL DEVELOPMENT CONFIG (keep this active for local use)
//const API_BASE_URL =
  //process.env.REACT_APP_API_BASE_URL ||
  //`http://${window.location.hostname}:5000`;

// VERCEL DEPLOYMENT CONFIG
// Uncomment this when deploying online and comment the local config above again.
 const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

export default API_BASE_URL;
