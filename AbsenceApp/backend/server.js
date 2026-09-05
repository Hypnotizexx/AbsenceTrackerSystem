// Backend entry point: API routes, validation, database access, and server startup.
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");

const app = express();

// Global middleware enables cross-origin frontend requests and JSON request bodies.
app.use(cors());
app.use(bodyParser.json());

// Database connection: hosted deployments use DATABASE_URL; local deployments use PG* variables.
// Use DATABASE_URL for hosted databases or PG* variables for an existing local database.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    })
  : new Pool({
      user: process.env.PGUSER || "postgres",
      host: process.env.PGHOST || "localhost",
      database: process.env.PGDATABASE || "data",
      password: process.env.PGPASSWORD || "dataB$#^&",
      port: Number(process.env.PGPORT) || 5432,
    });

const MOROCCO_TIME_ZONE = "Africa/Casablanca";

// Return a calendar date in Morocco. Keep this as YYYY-MM-DD to avoid UTC date shifts.
function getTodayLocal() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: MOROCCO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

// Shared parsing and authorization helpers used by teacher routes.
function parseClasses(value) {
  return Array.isArray(value)
    ? value.map((c) => String(c).trim()).filter(Boolean)
    : String(value || "").split(",").map((c) => c.trim()).filter(Boolean);
}

async function getTeacherClasses(prof) {
  if (!prof) return null;

  const teacher = await pool.query(
    "SELECT classes FROM encadrants WHERE LOWER(nom) = LOWER($1)",
    [prof]
  );

  return teacher.rows.length > 0 ? parseClasses(teacher.rows[0].classes) : null;
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

// Health check used by deployments and monitoring.
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    res.status(503).json({ status: "error", message: "Base de données indisponible" });
  }
});

// Teacher authentication: validates credentials and returns assigned classes.
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

// Student lookup: returns only students from a class the teacher may access.
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

// Absence input normalization: validates and deduplicates the frontend payload.

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
    const prof = String(req.body.prof || "").trim();
    const allowedClasses = await getTeacherClasses(prof);
    if (!prof || !allowedClasses) {
      return res.status(403).json({ message: "Professeur inconnu" });
    }
    if (!allowedClasses.includes(classe)) {
      return res.status(403).json({ message: "Classe non autorisée pour ce professeur" });
    }
    // The server is the source of truth for the absence date.
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

// Absence management: list today's records, edit a record, or delete a record.
app.get("/absences", async (req, res) => {
  try {
    const prof = String(req.query.prof || "").trim();
    const classe = String(req.query.classe || "").trim();
    const allowedClasses = await getTeacherClasses(prof);

    if (!prof || !allowedClasses) {
      return res.status(403).json({ message: "Professeur inconnu" });
    }
    if (classe && !allowedClasses.includes(classe)) {
      return res.status(403).json({ message: "Classe non autorisée pour ce professeur" });
    }

    const today = getTodayLocal();
    const values = classe ? [today, classe] : [today, allowedClasses];
    const condition = classe
      ? "date = $1 AND classe = $2"
      : "date = $1 AND classe = ANY($2::text[])";
    const result = await pool.query(
      `SELECT id, date::text AS date, debut, fin, classe, duree, code, nom, motif, justifiee
       FROM absences
       WHERE ${condition}
       ORDER BY date DESC, debut DESC, classe ASC, nom ASC`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Absence fetch error:", err);
    res.status(500).json({ message: "Erreur serveur lors du chargement des absences." });
  }
});

app.patch("/absences/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const prof = String(req.body.prof || "").trim();
    const { date, debut, fin, duree } = req.body;
    const allowedClasses = await getTeacherClasses(prof);

    if (!Number.isInteger(id) || id < 1 || !allowedClasses) {
      return res.status(400).json({ message: "Données de modification invalides." });
    }
    if (!isValidDate(date) || !isValidTime(debut) || !isValidTime(fin)) {
      return res.status(400).json({ message: "La date ou les horaires sont invalides." });
    }
    if (!Number.isFinite(Number(duree)) || Number(duree) <= 0) {
      return res.status(400).json({ message: "La durée est invalide." });
    }

    const result = await pool.query(
      `UPDATE absences
       SET date = $1, debut = $2, fin = $3, duree = $4
       WHERE id = $5 AND classe = ANY($6::text[])
      RETURNING id, date::text AS date, debut, fin, classe, duree, code, nom, motif, justifiee`,
      [date, debut, fin, Number(duree), id, allowedClasses]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Absence introuvable." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Absence update error:", err);
    res.status(500).json({ message: "Erreur serveur lors de la modification." });
  }
});

app.delete("/absences/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const prof = String(req.query.prof || "").trim();
    const allowedClasses = await getTeacherClasses(prof);

    if (!Number.isInteger(id) || id < 1 || !allowedClasses) {
      return res.status(400).json({ message: "Données de suppression invalides." });
    }

    const result = await pool.query(
      "DELETE FROM absences WHERE id = $1 AND classe = ANY($2::text[]) RETURNING id",
      [id, allowedClasses]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Absence introuvable." });
    }

    res.json({ message: "Absence supprimée avec succès." });
  } catch (err) {
    console.error("Absence delete error:", err);
    res.status(500).json({ message: "Erreur serveur lors de la suppression." });
  }
});

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "127.0.0.1";

// Start only after confirming that PostgreSQL is reachable.
async function startServer() {
  try {
    await pool.query("SELECT 1");
    app.listen(PORT, HOST, () => {
      console.log(`Backend running on http://${HOST}:${PORT}`);
    });
  } catch (err) {
    console.error("Backend startup failed. Check PostgreSQL and the PG settings.", err.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
