import React from "react";
import { useNavigate } from "react-router-dom";
import { FaChalkboardTeacher, FaArrowRight } from "react-icons/fa";
import "./home.css";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="page-container home-page">
      <div className="home-card">
        <header className="home-header">
          <span className="home-badge">Espace enseignant</span>
          <h1 className="title">Gestion des Absences</h1>
          <p className="subtitle">Plateforme sécurisée de suivi des présences en classe</p>
        </header>

        <section className="portals-container">
          <div className="portal-block teacher">
            <div className="portal-icon-wrapper">
              <FaChalkboardTeacher />
            </div>
            <div className="portal-content">
              <h3>Portail Enseignant</h3>
              <p className="portal-description">
                Enregistrez et gérez facilement les absences par classe et séance horaire
              </p>
              <button 
                className="portal-action" 
                onClick={() => navigate("/login")}
                title="Accéder au portail enseignant"
              >
                <span>Accéder au portail</span>
                <FaArrowRight size={14} />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

