import React from "react";
import { useNavigate } from "react-router-dom";
import { FaChalkboardTeacher } from "react-icons/fa";
import "./home.css";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="page-container home-page">
      <div className="home-card">
        <header className="home-header">
          <h1 className="title">Gestion des absences</h1>
          <p className="subtitle">Accès sécurisé au portail enseignant</p>
        </header>

        <section className="portals-container">
          {/* Only Teacher Block remains, centered */}
          <div className="portal-block teacher" style={{ margin: "0 auto", maxWidth: "500px" }}>
            <div className="portal-icon-wrapper"><FaChalkboardTeacher /></div>
            <div className="portal-content">
              <h3>Portail Professeur</h3>
              <p>Enregistrement des absences par classe et séance</p>
              <button className="portal-action" onClick={() => navigate("/login")}>
                Accéder au portail
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

