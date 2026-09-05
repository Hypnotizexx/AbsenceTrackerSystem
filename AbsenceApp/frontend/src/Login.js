// Teacher login screen: submits credentials and stores the authenticated user.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaUser, FaLock, FaExclamationCircle } from "react-icons/fa";
import "./login.css";
import API_BASE_URL from './config'; 
import TeacherMark from "./TeacherMark";

export default function Login({ setUser }) {
  // Form fields and request state are kept local to the login screen.
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    // Send credentials to the backend and redirect only after successful login.
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/login/prof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = new Error(data.message || "Connexion impossible");
        error.status = res.status;
        throw error;
      }

      setUser(data.user);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/dashboard");
    } catch (err) {
      if (err.status === 401) {
        setError("Identifiants incorrects. Vérifiez votre nom d'utilisateur et mot de passe.");
      } else {
        setError("Serveur indisponible. Veuillez réessayer dans quelques instants.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="login-card">
        <TeacherMark />
        <h2 className="title">Connexion</h2>
        <p className="subtitle">Accédez à votre portail enseignant</p>

        <form onSubmit={handleLogin}>
          {/* Authentication error feedback */}
          {error && (
            <div className="error" style={{ marginBottom: "20px", display: "flex", gap: "8px" }}>
              <FaExclamationCircle size={16} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          {/* Username field */}
          <div className="field-group">
            <label htmlFor="username">Nom d'utilisateur</label>
            <div className="input-wrapper">
              <input 
                id="username"
                type="text" 
                placeholder="Entrez votre nom d'utilisateur"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isLoading}
              />
              <FaUser className="input-icon" />
            </div>
          </div>

          {/* Password field */}
          <div className="field-group">
            <label htmlFor="password">Mot de passe</label>
            <div className="input-wrapper">
              <input 
                id="password"
                type="password" 
                placeholder="Entrez votre mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
              <FaLock className="input-icon" />
            </div>
          </div>

          {/* Submit action */}
          <button 
            type="submit" 
            className="login-btn"
            disabled={isLoading}
          >
            {isLoading ? "Connexion en cours..." : "Se connecter"}
          </button>
        </form>

        {/* Return to the home screen */}
        <div style={{ textAlign: "center", marginTop: "24px" }}>
          <button 
            onClick={() => navigate("/")}
            style={{
              background: "none",
              border: "none",
              color: "#4a6fa5",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}
            onMouseEnter={(e) => e.target.style.color = "#2c3e50"}
            onMouseLeave={(e) => e.target.style.color = "#4a6fa5"}
          >
            ← Retour à l'accueil
          </button>
        </div>
      </div>
    </div>
  );
}
