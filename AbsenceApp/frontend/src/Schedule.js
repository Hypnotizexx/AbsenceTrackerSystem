// Absence schedule: loads students, records today's absences, and manages saved records.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft, FaCheckCircle, FaTimesCircle, FaTrash, FaEye, FaEdit } from "react-icons/fa";
import "./teacher.css"; 
import API_BASE_URL from './config';  
import TeacherMark from "./TeacherMark";

function calendarDate(value) {
  // Database DATE values are calendar strings; never pass them through Date/UTC conversion.
  return String(value || "").slice(0, 10);
}

export default function Schedule({ user, selectedClass }) {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [selectedBlocs, setSelectedBlocs] = useState([]);
  const [absents, setAbsents] = useState([]);
  const [savedAbsences, setSavedAbsences] = useState([]);
  const [editingAbsence, setEditingAbsence] = useState(null);
  const [absenceForm, setAbsenceForm] = useState({ date: "", debut: "", fin: "", duree: 2 });
  const [isSavingAbsence, setIsSavingAbsence] = useState(false);
  const [activeSection, setActiveSection] = useState("record");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Available teaching time blocks shown in the record form.
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
    // Reload students and today's saved absences whenever the selected class changes.
    if (!selectedClass) {
      setStudents([]);
      return;
    }

    setIsLoading(true);
    setError("");
    setStudents([]);
    setAbsents([]);
    setSavedAbsences([]);
    setSelectedBlocs([]);

    const params = new URLSearchParams();
    if (user?.nom) params.set("prof", user.nom);
    params.set("classe", selectedClass);

    Promise.all([
      fetch(`${API_BASE_URL}/students/${encodeURIComponent(selectedClass)}`, { credentials: "include" }),
      fetch(`${API_BASE_URL}/absences?${params}`, { credentials: "include" }),
    ])
      .then(async ([studentsRes, absencesRes]) => {
        if (!studentsRes.ok) throw new Error("Impossible de charger les élèves");
        if (!absencesRes.ok) {
          const data = await absencesRes.json().catch(() => ({}));
          throw new Error(data.message || "Impossible de charger les absences");
        }
        return [await studentsRes.json(), await absencesRes.json()];
      })
      .then(([studentData, absenceData]) => {
        const list = Array.isArray(studentData) ? studentData : [];
        const filtered = list.filter((st) => st.classe === selectedClass);
        setStudents(filtered);
        setSavedAbsences(Array.isArray(absenceData) ? absenceData : []);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Erreur lors du chargement");
        setStudents([]);
        setSavedAbsences([]);
        setIsLoading(false);
      });
  }, [selectedClass, user?.nom]);

  const refreshSavedAbsences = async () => {
    // Refresh the saved list after create or edit operations.
    const params = new URLSearchParams({
      classe: selectedClass,
    });
    const res = await fetch(`${API_BASE_URL}/absences?${params}`, { credentials: "include" });
    const data = await res.json().catch(() => []);
    if (!res.ok) throw new Error(data.message || "Impossible de charger les absences");
    setSavedAbsences(Array.isArray(data) ? data : []);
  };

  const startEditingAbsence = (absence) => {
    // Copy one saved record into the inline edit form.
    setEditingAbsence(absence.id);
    setAbsenceForm({
      date: calendarDate(absence.date),
      debut: String(absence.debut).slice(0, 5),
      fin: String(absence.fin).slice(0, 5),
      duree: absence.duree,
    });
    setError("");
  };

  const cancelEditingAbsence = () => {
    setEditingAbsence(null);
    setAbsenceForm({ date: "", debut: "", fin: "", duree: 2 });
  };

  const updateAbsence = async (event) => {
    // Persist changes through the protected backend endpoint.
    event.preventDefault();
    try {
      setIsSavingAbsence(true);
      setError("");
      const res = await fetch(`${API_BASE_URL}/absences/${editingAbsence}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(absenceForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erreur lors de la modification.");
      cancelEditingAbsence();
      await refreshSavedAbsences();
      setSuccessMessage("Absence modifiée avec succès.");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err.message || "Erreur serveur.");
    } finally {
      setIsSavingAbsence(false);
    }
  };

  const removeSavedAbsence = async (id) => {
    // Delete one saved record after teacher confirmation.
    if (!window.confirm("Supprimer cette absence ?")) return;
    try {
      setError("");
      const params = new URLSearchParams();
      const res = await fetch(`${API_BASE_URL}/absences/${id}?${params}`, { method: "DELETE", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erreur lors de la suppression.");
      setSavedAbsences((prev) => prev.filter((absence) => absence.id !== id));
      setSuccessMessage("Absence supprimée avec succès.");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err.message || "Erreur serveur.");
    }
  };

  const toggleBloc = (b) => {
    // Add or remove a time block from the new absence payload.
    setSelectedBlocs((prev) => {
      const exists = prev.some((s) => s.debut === b.debut);
      return exists ? prev.filter((s) => s.debut !== b.debut) : [...prev, b];
    });
    setError("");
    setSuccessMessage("");
  };

  const toggleAbsent = (st) => {
    // Add or remove a student from the new absence payload.
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
    // Validate the selection; the backend assigns Morocco's current date.
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
        credentials: "include",
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

      await refreshSavedAbsences();
      setSuccessMessage("✓ Données enregistrées avec succès!");
      setAbsents([]);
      setSelectedBlocs([]);
      setActiveSection("saved");
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

        <TeacherMark />
        <h2 className="title">Enregistrement des absences</h2>
        <p className="subtitle">Classe : <strong>{selectedClass}</strong></p>

        <div className="schedule-tabs" role="tablist" aria-label="Sections du planning">
          <button
            className={`schedule-tab ${activeSection === "record" ? "active" : ""}`}
            onClick={() => setActiveSection("record")}
            role="tab"
            aria-selected={activeSection === "record"}
          >
            1. Saisir une absence
          </button>
          <button
            className={`schedule-tab ${activeSection === "saved" ? "active" : ""}`}
            onClick={() => setActiveSection("saved")}
            role="tab"
            aria-selected={activeSection === "saved"}
          >
            2. Absences enregistrées
            {savedAbsences.length > 0 && <span className="schedule-tab-count">{savedAbsences.length}</span>}
          </button>
        </div>

        {/* Request status and success/error feedback */}
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
        <div className={`bloc-section ${activeSection !== "record" ? "schedule-section-hidden" : ""}`}>
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
        <div className={`students-section ${activeSection !== "record" ? "schedule-section-hidden" : ""}`}>
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

        {/* Today's saved absence records */}
        <div className={`saved-absences-section ${activeSection !== "saved" ? "schedule-section-hidden" : ""}`}>
          <div className="students-section-title">Absences enregistrées</div>
          {savedAbsences.length === 0 ? (
            <div className="empty-state compact-empty-state">Aucune absence enregistrée pour cette classe</div>
          ) : (
            <div className="table-wrapper">
              <table className="teacher-table saved-absences-table">
                <thead>
                  <tr>
                    <th>Élève</th>
                    <th>Date</th>
                    <th>Horaire</th>
                    <th className="actions-column">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {savedAbsences.map((absence) => (
                    <React.Fragment key={absence.id}>
                      <tr>
                        <td>
                          <strong>{absence.nom}</strong>
                          <small>{absence.code}</small>
                        </td>
                        <td data-label="Date">{calendarDate(absence.date)}</td>
                        <td data-label="Horaire">{String(absence.debut).slice(0, 5)} - {String(absence.fin).slice(0, 5)}</td>
                        <td data-label="Actions" className="absence-actions">
                          <button className="icon-action edit-action" onClick={() => startEditingAbsence(absence)} title="Modifier cette absence">
                            <FaEdit />
                            Modifier
                          </button>
                          <button className="icon-action delete-action" onClick={() => removeSavedAbsence(absence.id)} title="Supprimer cette absence">
                            <FaTrash />
                            Supprimer
                          </button>
                        </td>
                      </tr>
                      {editingAbsence === absence.id && (
                        <tr className="edit-row">
                          <td colSpan="4">
                            <form className="absence-edit-form" onSubmit={updateAbsence}>
                              <label>Date<input type="date" value={absenceForm.date} onChange={(event) => setAbsenceForm({ ...absenceForm, date: event.target.value })} required /></label>
                              <label>Début<input className="time-24-input" type="text" inputMode="numeric" pattern="(?:[01]\d|2[0-3]):[0-5]\d" maxLength="5" placeholder="HH:MM" value={absenceForm.debut} onChange={(event) => setAbsenceForm({ ...absenceForm, debut: event.target.value })} required /></label>
                              <label>Fin<input className="time-24-input" type="text" inputMode="numeric" pattern="(?:[01]\d|2[0-3]):[0-5]\d" maxLength="5" placeholder="HH:MM" value={absenceForm.fin} onChange={(event) => setAbsenceForm({ ...absenceForm, fin: event.target.value })} required /></label>
                              <div className="edit-form-actions">
                                <button type="button" className="secondary-action" onClick={cancelEditingAbsence}>Annuler</button>
                                <button type="submit" className="save-inline-btn" disabled={isSavingAbsence}>{isSavingAbsence ? "Enregistrement..." : "Enregistrer"}</button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Preview of students selected for the next save */}
        {absents.length > 0 && (
          <div className={`preview-section ${activeSection !== "record" ? "schedule-section-hidden" : ""}`} style={{
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

        {/* Submit the new absence records */}
        <button 
          className={`save-btn ${activeSection !== "record" ? "schedule-section-hidden" : ""}`} 
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
