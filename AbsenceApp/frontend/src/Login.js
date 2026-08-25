import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./login.css";
import API_BASE_URL from './config'; 

export default function Login({ setUser }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await axios.post(`${API_BASE_URL}/login/prof`, {
        username: username.trim(),
        password,
      });
      
      setUser(res.data.user);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      
      navigate("/dashboard");
    } catch (err) {
      if (err.response?.status === 401) {
        setError("Identifiants incorrects");
      } else {
        setError("Serveur indisponible. Vérifiez l'URL backend et le port 5000.");
      }
    }
  };

  return (
    <div className="page-container">
      <div className="login-card">
        <h2 className="title">Connexion Professeur</h2>
        <form onSubmit={handleLogin}>
          <div className="field-group">
            <input type="text" placeholder="Utilisateur" onChange={e => setUsername(e.target.value)} required />
          </div>
          <div className="field-group">
            <input type="password" placeholder="Mot de passe" onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <p style={{ color: "red" }}>{error}</p>}
          <button type="submit" className="login-btn">Se connecter</button>
        </form>
      </div>
    </div>
  );
}
