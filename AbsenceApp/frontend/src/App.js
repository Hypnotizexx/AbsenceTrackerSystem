// Application shell: owns authentication state and the teacher route map.
import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Home from "./Home";
import Login from "./Login";
import TeacherDashboard from "./TeacherDashboard";
import Schedule from "./Schedule";
import icon from "./LOGO.png";

export default function App() {
  // Restore the logged-in teacher so a page refresh does not lose the session.
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });

  // The selected class is passed from the dashboard to the schedule page.
  const [selectedClass, setSelectedClass] = useState(null);

  useEffect(() => {
    // Keep localStorage synchronized with the current authentication state.
    if (user) localStorage.setItem("user", JSON.stringify(user));
    else localStorage.removeItem("user");
  }, [user]);

  useEffect(() => {
    document.title = "Gestion des absences";
    ["icon", "apple-touch-icon"].forEach((rel) => {
      let link = document.querySelector(`link[rel="${rel}"]`);
      if (!link) {
        link = document.createElement("link");
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = icon;
    });
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        
        <Route path="/login" element={<Login setUser={setUser} />} />

        {/* Protected teacher routes */}
        <Route 
          path="/dashboard" 
          element={user?.role === "prof" ? <TeacherDashboard user={user} setSelectedClass={setSelectedClass} /> : <Navigate to="/" />} 
        />
        <Route 
          path="/schedule" 
          element={user?.role === "prof" && selectedClass ? <Schedule user={user} selectedClass={selectedClass} /> : <Navigate to="/dashboard" />} 
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
