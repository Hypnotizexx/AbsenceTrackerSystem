import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./teacher.css"; 
import API_BASE_URL from './config';  

export default function Schedule({ user, selectedClass }) {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [selectedBlocs, setSelectedBlocs] = useState([]);
  const [absents, setAbsents] = useState([]);

  const blocs = [
    { debut: "08:30", fin: "10:30" }, { debut: "10:30", fin: "12:30" },
    { debut: "12:30", fin: "13:30" }, { debut: "13:30", fin: "14:30" },
    { debut: "14:30", fin: "16:30" }, { debut: "16:30", fin: "18:30" },
    { debut: "18:30", fin: "19:30" },{ debut: "19:30", fin: "20:30" }
    
  ];

  useEffect(() => {
    if (!selectedClass) {
      setStudents([]);
      return;
    }

    setStudents([]);
    setAbsents([]);
    setSelectedBlocs([]);

    const params = new URLSearchParams();
    if (user?.nom) params.set("prof", user.nom);

    fetch(`${API_BASE_URL}/students/${encodeURIComponent(selectedClass)}?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("Fetch failed");
        return res.json();
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setStudents(list.filter((st) => st.classe === selectedClass));
      })
      .catch(() => setStudents([]));
  }, [selectedClass, user?.nom]);

  const toggleBloc = (b) => {
    const exists = selectedBlocs.find((s) => s.debut === b.debut);
    exists ? setSelectedBlocs(selectedBlocs.filter((s) => s.debut !== b.debut)) 
           : setSelectedBlocs([...selectedBlocs, b]);
  };

  const toggleAbsent = (st) => {
    const exists = absents.find((a) => a.code === st.code);
    exists ? setAbsents(absents.filter((a) => a.code !== st.code)) 
           : setAbsents([...absents, st]);
  };

  const handleSave = async () => {
    if (selectedBlocs.length === 0) return alert("Sélectionnez un créneau");
    try {
      const sessions = selectedBlocs.map((s) => ({
        ...s,
        duree: 2,
      }));
      const res = await fetch(`${API_BASE_URL}/absences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classe: selectedClass,
          sessions,
          absents,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      alert("Enregistré !");
    } catch (err) {
      alert("Erreur serveur.");
    }
  };

  return (
    <div className="page-container">
      <div className="dashboard-card">
        <button onClick={() => navigate("/dashboard")} style={{ cursor: "pointer", border: "none", background: "none", color: "#4a7dff" }}>← Retour</button>
        <h2 className="title">Appel : {selectedClass}</h2>
        
        <h3 className="subtitle">1. Créneaux</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "20px" }}>
          {blocs.map((b) => (
            <label key={b.debut} style={{ background: "#f0f2f5", padding: "10px", borderRadius: "8px" }}>
              <input type="checkbox" onChange={() => toggleBloc(b)} /> {b.debut} - {b.fin}
            </label>
          ))}
        </div>

        <h3 className="subtitle">2. Liste des élèves</h3>
        <div className="table-wrapper">
          <table className="teacher-table">
            <thead>
              <tr><th>Nom</th><th>Absent</th></tr>
            </thead>
            <tbody>
              {students.map((st) => (
                <tr key={st.code}>
                  <td>{st.nom}</td>
                  <td><input type="checkbox" onChange={() => toggleAbsent(st)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="save-btn" onClick={handleSave} style={{ marginTop: "20px" }}>Enregistrer</button>
      </div>
    </div>
  );
}
