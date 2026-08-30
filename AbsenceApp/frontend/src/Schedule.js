import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft, FaCheckCircle, FaTimesCircle, FaTrash, FaEye } from "react-icons/fa";
import "./teacher.css"; 
import API_BASE_URL from './config';  

export default function Schedule({ user, selectedClass }) {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [selectedBlocs, setSelectedBlocs] = useState([]);
  const [absents, setAbsents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const blocs = [
    { debut: "08:30", fin: "10:30" }, 
    { debut: "10:30", fin: "12:30" },
    { debut: "12:30", fin: "13:30" }, 
    { debut: "13:30", fin: "14:30" },
    { debut: "14:30", fin: "16:30" }, 
    { debut: "16:30", fin: "18:30" },
    { debut: "18:30", fin: "19:30" },
    { debut: "19:30", fin: "20:30" }
  ];

  useEffect(() => {
    if (!selectedClass) {
      setStudents([]);
      return;
    }

    setIsLoading(true);
    setError("");
    setStudents([]);
    setAbsents([]);
    setSelectedBlocs([]);

    const params = new URLSearchParams();
    if (user?.nom) params.set("prof", user.nom);

    fetch(`${API_BASE_URL}/students/${encodeURIComponent(selectedClass)}?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("Impossible de charger les élèves");
        return res.json();
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        const filtered = list.filter((st) => st.classe === selectedClass);
        setStudents(filtered);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Erreur lors du chargement");
        setStudents([]);
        setIsLoading(false);
      });
  }, [selectedClass, user?.nom]);

  const toggleBloc = (b) => {
    setSelectedBlocs((prev) => {
      const exists = prev.some((s) => s.debut === b.debut);
      return exists ? prev.filter((s) => s.debut !== b.debut) : [...prev, b];
    });
    setError("");
    setSuccessMessage("");
  };

  const toggleAbsent = (st) => {
    setAbsents((prev) => {
      const exists = prev.some((a) => a.code === st.code);
      return exists ? prev.filter((a) => a.code !== st.code) : [...prev, st];
    });
    setError("");
    setSuccessMessage("");
  };

  const deleteAbsenceRecord = (studentCode) => {
    setAbsents((prev) => prev.filter((a) => a.code !== studentCode));
    setError("");
    setSuccessMessage("");
  };

  const handleSave = async () => {
    if (!selectedClass) {
      setError("Aucune classe sélectionnée.");
      return;
    }

    if (selectedBlocs.length === 0) {
      setError("Sélectionnez au moins un créneau avant d'enregistrer.");
      return;
    }

    if (absents.length === 0) {
      setError("Sélectionnez au moins un élève absent.");
      return;
    }
    
    try {
      setError("");
      setSuccessMessage("");

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

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || "Erreur lors de l'enregistrement des absences.");
      }
      
      setSuccessMessage("✓ Données enregistrées avec succès!");
      setAbsents([]);
      setSelectedBlocs([]);
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err.message || "Erreur serveur. Vérifiez votre connexion.");
    }
  };

  return (
    <div className="page-container">
      <div className="dashboard-card">
        <button 
          className="back-btn" 
          onClick={() => navigate("/dashboard")}
          title="Retour au tableau de bord"
        >
          <FaArrowLeft size={16} />
          Retour
        </button>

        <h2 className="title">Enregistrement des absences</h2>
        <p className="subtitle">Classe : <strong>{selectedClass}</strong></p>

        {/* Messages ===== */}
        {error && (
          <div style={{
            padding: "12px 14px",
            marginBottom: "20px",
            background: "#f8d7da",
            border: "1px solid #f5c6cb",
            borderRadius: "8px",
            color: "#721c24",
            fontSize: "13px",
            fontWeight: "500",
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}>
            <FaTimesCircle size={16} />
            {error}
          </div>
        )}

        {successMessage && (
          <div style={{
            padding: "12px 14px",
            marginBottom: "20px",
            background: "#d4edda",
            border: "1px solid #c3e6cb",
            borderRadius: "8px",
            color: "#155724",
            fontSize: "13px",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}>
            <FaCheckCircle size={16} />
            {successMessage}
          </div>
        )}

        {/* Bloc Selection Section ===== */}
        <div className="bloc-section">
          <div className="bloc-section-title">Sélectionnez les créneaux</div>
          <div className="blocs-container">
            {blocs.map((b) => (
              <label key={b.debut} className="bloc-label">
                <input 
                  type="checkbox" 
                  onChange={() => toggleBloc(b)}
                  checked={selectedBlocs.some(s => s.debut === b.debut)}
                />
                <span>{b.debut} - {b.fin}</span>
              </label>
            ))}
          </div>
          {selectedBlocs.length > 0 && (
            <div style={{
              marginTop: "12px",
              fontSize: "13px",
              color: "#475569",
              fontWeight: "500"
            }}>
              ✓ {selectedBlocs.length} créneau{selectedBlocs.length > 1 ? "x" : ""} sélectionné{selectedBlocs.length > 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Students Section ===== */}
        <div className="students-section">
          <div className="students-section-title">Liste des élèves</div>
          
          {isLoading ? (
            <div className="empty-state">
              <div style={{ fontSize: "20px" }}>⏳</div>
              <div className="empty-state-text">Chargement des élèves...</div>
            </div>
          ) : students.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: "48px" }}>👥</div>
              <div className="empty-state-text">Aucun élève trouvé dans cette classe</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="teacher-table">
                <thead>
                  <tr>
                    <th>Nom de l'élève</th>
                    <th style={{ textAlign: "center", width: "100px" }}>Absent</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((st) => (
                    <tr key={st.code}>
                      <td>{st.nom}</td>
                      <td style={{ textAlign: "center" }}>
                        <input 
                          type="checkbox" 
                          onChange={() => toggleAbsent(st)}
                          checked={absents.some(a => a.code === st.code)}
                          title="Marquer comme absent"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {students.length > 0 && absents.length > 0 && (
            <div style={{
              marginTop: "12px",
              fontSize: "13px",
              color: "#dc2626",
              fontWeight: "600"
            }}>
              ⚠ {absents.length} élève{absents.length > 1 ? "s" : ""} marqué{absents.length > 1 ? "s" : ""} comme absent{absents.length > 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Preview Section - Marked Absences ===== */}
        {absents.length > 0 && (
          <div className="preview-section" style={{
            marginTop: "30px",
            padding: "20px",
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: "12px"
          }}>
            <div style={{
              fontSize: "15px",
              fontWeight: "600",
              color: "#374151",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "10px"
            }}>
              <FaEye size={16} />
              Absences enregistrées ({absents.length})
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: "10px"
            }}>
              {absents.map((absent) => (
                <div 
                  key={absent.code}
                  style={{
                    padding: "12px 14px",
                    background: "white",
                    border: "1px solid #d1d5db",
                    borderRadius: "8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "all 0.2s ease"
                  }}
                >
                  <div style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px"
                  }}>
                    <span style={{
                      fontWeight: "600",
                      color: "#1f2937",
                      fontSize: "13px"
                    }}>
                      {absent.nom}
                    </span>
                    <span style={{
                      fontSize: "11px",
                      color: "#6b7280"
                    }}>
                      {absent.code}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteAbsenceRecord(absent.code)}
                    style={{
                      padding: "6px 10px",
                      background: "#ef4444",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "12px",
                      fontWeight: "600",
                      transition: "all 0.3s ease",
                      marginLeft: "12px",
                      flexShrink: 0
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = "#c92a2a";
                      e.target.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = "#ef4444";
                      e.target.style.transform = "translateY(0)";
                    }}
                    title="Supprimer cet enregistrement d'absence"
                  >
                    <FaTrash size={12} />
                    Supprimer
                  </button>
                </div>
              ))}
            </div>

            <div style={{
              marginTop: "14px",
              padding: "10px 12px",
              background: "#f3f4f6",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#374151",
              fontWeight: "500"
            }}>
              ℹ️ Vous pouvez supprimer des enregistrements ci-dessus avant de cliquer sur "Enregistrer". 
              Seules les absences restantes seront sauvegardées.
            </div>
          </div>
        )}

        {/* Save Button ===== */}
        <button 
          className="save-btn" 
          onClick={handleSave}
          disabled={selectedBlocs.length === 0}
        >
          {absents.length > 0 
            ? `Enregistrer les ${absents.length} absence${absents.length > 1 ? "s" : ""}`
            : "Enregistrer les absences"
          }
        </button>
      </div>
    </div>
  );
}
