import React from "react";
import { useNavigate } from "react-router-dom";
import "./teacher.css";

function TeacherDashboard({ user, setSelectedClass }) {
  const navigate = useNavigate();

  const handleSelect = (e) => {
    const cls = e.target.value;
    if (cls) {
      setSelectedClass(cls); // Set the class in global state
      navigate("/schedule"); // Trigger redirection
    }
  };

  return (
    <div className="page-container">
      <div className="dashboard-card">
        <h1 className="title">Bienvenue, {user.nom || user.username}</h1>
        <p className="subtitle" style={{ textAlign: "center" }}>Veuillez sélectionner une classe pour faire l'appel :</p>

        <div style={{ display: "flex", justifyContent: "center", marginTop: "20px" }}>
          <select 
            className="teacher-select" 
            style={{ width: "100%", maxWidth: "400px", padding: "12px", borderRadius: "10px" }}
            onChange={handleSelect} 
            defaultValue=""
          >
            <option value="" disabled>-- Sélectionner une classe --</option>
            {user.classes && user.classes.map((cls) => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
        </div>

        <button 
          className="back-btn" 
          onClick={() => { localStorage.removeItem("user"); window.location.href="/"; }}
          style={{ marginTop: "40px", color: "#666", cursor: "pointer", background: "none", border: "none" }}
        >
          Déconnexion
        </button>
      </div>
    </div>
  );
}

export default TeacherDashboard;
