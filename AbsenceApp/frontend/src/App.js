import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Home from "./Home";
import Login from "./Login";
import TeacherDashboard from "./TeacherDashboard";
import Schedule from "./Schedule";

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });

  // State to track which class the teacher selected
  const [selectedClass, setSelectedClass] = useState(null);

  useEffect(() => {
    if (user) localStorage.setItem("user", JSON.stringify(user));
    else localStorage.removeItem("user");
  }, [user]);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        
        <Route path="/login" element={<Login setUser={setUser} />} />

        {/* Teacher Routes */}
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
