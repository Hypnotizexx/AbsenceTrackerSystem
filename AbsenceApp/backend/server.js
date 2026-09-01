// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// -------------------
// PostgreSQL connection
// -------------------
// LOCAL DEVELOPMENT CONFIG (keep this active for local use)
//const pool = new Pool({
  //user: "postgres",
  //host: "localhost",
  //database: "data",
  //password: "dataB$#^&",
  //port: 5432,
//});

// VERCEL / NEON DEPLOYMENT CONFIG

 const pool = new Pool({
   connectionString: process.env.DATABASE_URL,
   ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
 });
//////////// ends here 
pool.connect()
  .then(() => console.log("Connected to PostgreSQL"))
  .catch(err => console.error("PG error:", err));

// -------------------
// Helpers
// -------------------
function getTodayLocal() {
  const now = new Date();
  return now.toLocaleDateString('en-CA'); 
}

function parseClasses(value) {
  return Array.isArray(value)
    ? value.map((c) => String(c).trim()).filter(Boolean)
    : String(value || "").split(",").map((c) => c.trim()).filter(Boolean);
}

// ==================================================
// LOGIN — TEACHER
// ==================================================
app.post("/login/prof", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Champs manquants" });

    const r = await pool.query(
      `SELECT nom, classes
       FROM encadrants
       WHERE LOWER(nom) = LOWER($1) AND mdp=$2`,
      [username, password]
    );

    if (r.rows.length === 0) {
      return res.status(401).json({ message: "Identifiants incorrects" });
    }

    const prof = r.rows[0];
    const classes = parseClasses(prof.classes);

    res.json({ user: { nom: prof.nom, role: "prof", classes } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ==================================================
// FETCH STUDENTS BY CLASS
// ==================================================
app.get("/students/:classe", async (req, res) => {
  try {
    const classe = decodeURIComponent(req.params.classe).trim();
    if (!classe) {
      return res.status(400).json({ message: "Classe manquante" });
    }

    const prof = String(req.query.prof || "").trim();
    if (prof) {
      const teacher = await pool.query(
        "SELECT classes FROM encadrants WHERE LOWER(nom) = LOWER($1)",
        [prof]
      );
      if (teacher.rows.length === 0) {
        return res.status(403).json({ message: "Professeur inconnu" });
      }
      const allowedClasses = parseClasses(teacher.rows[0].classes);
      if (!allowedClasses.includes(classe)) {
        return res.status(403).json({ message: "Classe non autorisée pour ce professeur" });
      }
    }

    const r = await pool.query(
      "SELECT code, nom, classe FROM eleves WHERE TRIM(classe) = $1 ORDER BY nom ASC",
      [classe]
    );
    res.json(r.rows);
  } catch (err) {
    console.error("Students fetch error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ==================================================
// TEACHER POST - Record Absences 
// ==================================================

function normalizeAbsencePayload(raw) {
  if (!raw || typeof raw !== "object") {
    return { valid: false, message: "Données d'absence invalides." };
  }

  const classe = String(raw.classe || "").trim();
  const sessions = Array.isArray(raw.sessions) ? raw.sessions : [];
  const absents = Array.isArray(raw.absents) ? raw.absents : [];

  if (!classe) {
    return { valid: false, message: "La classe est obligatoire." };
  }

  if (sessions.length === 0) {
    return { valid: false, message: "Sélectionnez au moins un créneau." };
  }

  const normalizedStudents = absents
    .map((student) => ({
      code: String(student?.code || "").trim(),
      nom: String(student?.nom || "").trim(),
    }))
    .filter((student) => student.code && student.nom);

  if (normalizedStudents.length === 0) {
    return { valid: false, message: "Sélectionnez au moins un élève absent." };
  }

  const uniqueStudents = Array.from(
    new Map(normalizedStudents.map((student) => [student.code.toLowerCase(), student])).values()
  );

  const validSessions = sessions
    .map((session) => ({
      debut: String(session?.debut || "").trim(),
      fin: String(session?.fin || "").trim(),
      duree: Number(session?.duree ?? 2),
    }))
    .filter((session) => session.debut && session.fin && Number.isFinite(session.duree) && session.duree > 0);

  if (validSessions.length === 0) {
    return { valid: false, message: "Les créneaux sélectionnés sont invalides." };
  }

  return {
    valid: true,
    classe,
    sessions: validSessions,
    absents: uniqueStudents,
  };
}

app.post("/absences", async (req, res) => {
  try {
    const payload = normalizeAbsencePayload(req.body);
    if (!payload.valid) {
      return res.status(400).json({ message: payload.message });
    }

    const { classe, sessions, absents } = payload;
    const date = getTodayLocal();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      let insertedCount = 0;

      for (const s of sessions) {
        for (const a of absents) {
          const existing = await client.query(
            `SELECT 1
             FROM absences
             WHERE date = $1 AND classe = $2 AND debut = $3 AND fin = $4 AND code = $5
             LIMIT 1`,
            [date, classe, s.debut, s.fin, a.code]
          );

          if (existing.rows.length > 0) {
            continue;
          }

          await client.query(
            `INSERT INTO absences (date, debut, fin, classe, duree, code, nom, motif, justifiee)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              date,
              s.debut,
              s.fin,
              classe,
              s.duree,
              a.code,
              a.nom,
              7,
              false
            ]
          );

          insertedCount += 1;
        }
      }

      await client.query("COMMIT");
      return res.status(201).json({
        message: "Absences enregistrées avec succès !",
        insertedCount,
        skippedCount: absents.length * sessions.length - insertedCount,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Absence save error:", err);
    res.status(500).json({ message: "Erreur serveur lors de l'enregistrement des absences." });
  }
});

// ==================================================
// START SERVER
// ==================================================
// NETWORK CONFIG (edit these when server IP/hostname changes):
// - HOST should stay 0.0.0.0 so all local-network devices can access backend.
// - PORT is backend port used by frontend config.
// - PUBLIC_HOST is only for display logs (IP or Avahi name), e.g.:
//     PUBLIC_HOST=192.168.1.25
//     PUBLIC_HOST=absence-app.local
const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_HOST = process.env.PUBLIC_HOST || "absence-app.local";

app.listen(PORT, HOST, () => {
  console.log(`Backend running on http://${PUBLIC_HOST}:${PORT} (bind ${HOST})`);
});
