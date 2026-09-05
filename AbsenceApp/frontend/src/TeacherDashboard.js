// Teacher dashboard: lets an authenticated teacher choose an assigned class.
import React from "react";
import { useNavigate } from "react-router-dom";
import { FaSignOutAlt } from "react-icons/fa";
import "./teacher.css";
import TeacherMark from "./TeacherMark";
import API_BASE_URL from "./config";

function TeacherDashboard({ user, setSelectedClass }) {
  const navigate = useNavigate();

  const handleSelect = (e) => {
    // Store the class before opening the absence schedule.
    const cls = e.target.value;
    if (cls) {
      setSelectedClass(cls);
      navigate("/schedule");
    }
  };

  const handleLogout = () => {
    // Clear the persisted session and return to the public home page.
    fetch(`${API_BASE_URL}/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    localStorage.removeItem("user");
    window.location.href = "/";
  };

  return (
    <div className="page-container">
      <div className="dashboard-card">
        <div className="dashboard-topbar">
          <div className="dashboard-branding">
            <TeacherMark />
            <span className="dashboard-badge">Espace enseignant</span>
          </div>
          <button 
            className="back-btn" 
            onClick={handleLogout}
            title="Se déconnecter"
          >
            <FaSignOutAlt size={16} />
            Déconnexion
          </button>
        </div>

        <h1 className="title">Bienvenue, {user.nom || user.username}</h1>
        <p className="subtitle">Sélectionnez une classe pour enregistrer les absences</p>

        {/* Class selection is limited to classes returned during login. */}
        <div className="class-selection-section">
          <label className="class-label">Classe disponibles</label>
          <select 
            className="teacher-select" 
            onChange={handleSelect} 
            defaultValue=""
          >
            <option value="" disabled>-- Sélectionner une classe --</option>
            {user.classes && user.classes.map((cls) => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
        </div>

        {user.classes && user.classes.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📚</div>
            <div className="empty-state-text">
              Aucune classe assignée. Veuillez contacter l'administrateur.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TeacherDashboard;
