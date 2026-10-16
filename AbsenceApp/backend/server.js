//edit file
// Backend entry point: API routes, validation, database access, and server startup.
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();

// Allow the local development frontend on the same host and keep cookies usable across ports.
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    try {
      const parsed = new URL(origin);
      const isPrivateAddress = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(parsed.hostname);
      const isLocalFrontend = parsed.protocol === "http:" && parsed.port === "3000" &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || isPrivateAddress);
      callback(null, isLocalFrontend);
    } catch (_err) {
      callback(null, false);
    }
  },
  credentials: true,
}));
app.use(bodyParser.json({ limit: "100kb" }));

// Local PostgreSQL connection. Configure PG* values through the server environment.
const pool = new Pool({
  user: process.env.PGUSER || "postgres",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "data",
  password: process.env.PGPASSWORD || "dataB$#^&",
  port: Number(process.env.PGPORT) || 5432,
});

const SESSION_COOKIE = "absence_session";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const SESSION_MAX_AGE = 8 * 60 * 60 * 1000;

function signSession(teacherName) {
  const payload = Buffer.from(JSON.stringify({
    nom: teacherName,
    exp: Date.now() + SESSION_MAX_AGE,
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function getCookie(req, name) {
  const cookies = String(req.headers.cookie || "").split(";");
  const entry = cookies.find((cookie) => cookie.trim().startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.trim().slice(name.length + 1)) : "";
}

function readSession(req) {
  const [payload, signature] = getCookie(req, SESSION_COOKIE).split(".");
  if (!payload || !signature) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.exp > Date.now() && session.nom ? session : null;
  } catch (_err) {
    return null;
  }
}

async function requireTeacher(req, res, next) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ message: "Session expirée. Veuillez vous reconnecter." });
  const classes = await getTeacherClasses(session.nom);
  if (!classes) return res.status(401).json({ message: "Session invalide." });
  req.teacher = { nom: session.nom, classes };
  next();
}

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

    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(signSession(prof.nom))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE / 1000}`);
    res.json({ user: { nom: prof.nom, role: "prof", classes } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

app.post("/logout", (_req, res) => {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ message: "Déconnexion réussie." });
});

// Student lookup: returns only students from a class the teacher may access.
app.get("/students/:classe", requireTeacher, async (req, res) => {
  try {
    const classe = decodeURIComponent(req.params.classe).trim();
    if (!classe) {
      return res.status(400).json({ message: "Classe manquante" });
    }

    if (!req.teacher.classes.includes(classe)) {
      return res.status(403).json({ message: "Classe non autorisée pour ce professeur" });
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

  if (sessions.length === 0 || sessions.length > 20) {
    return { valid: false, message: "Sélectionnez au moins un créneau." };
  }

  const normalizedStudents = absents
    .map((student) => ({
      code: String(student?.code || "").trim(),
      nom: String(student?.nom || "").trim(),
    }))
    .filter((student) => student.code && student.nom);

  if (normalizedStudents.length === 0 || normalizedStudents.length > 500) {
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
    .filter((session) => isValidTime(session.debut) && isValidTime(session.fin) && session.debut < session.fin &&
      Number.isInteger(session.duree) && session.duree > 0 && session.duree <= 24);

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

app.post("/absences", requireTeacher, async (req, res) => {
  try {
    const payload = normalizeAbsencePayload(req.body);
    if (!payload.valid) {
      return res.status(400).json({ message: payload.message });
    }

    const { classe, sessions, absents } = payload;
    const allowedClasses = req.teacher.classes;
    if (!allowedClasses.includes(classe)) {
      return res.status(403).json({ message: "Classe non autorisée pour ce professeur" });
    }
    const studentCodes = absents.map((student) => student.code);
    const studentsResult = await pool.query(
      "SELECT code, nom FROM eleves WHERE TRIM(classe) = $1 AND code = ANY($2::text[])",
      [classe, studentCodes]
    );
    if (studentsResult.rows.length !== studentCodes.length) {
      return res.status(400).json({ message: "Un ou plusieurs élèves ne correspondent pas à cette classe." });
    }
    const studentsByCode = new Map(studentsResult.rows.map((student) => [student.code, student.nom]));
    const canonicalAbsents = absents.map((student) => ({ code: student.code, nom: studentsByCode.get(student.code) }));
    // The server is the source of truth for the absence date.
    const date = getTodayLocal();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      let insertedCount = 0;

      for (const s of sessions) {
        for (const a of canonicalAbsents) {
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
        skippedCount: canonicalAbsents.length * sessions.length - insertedCount,
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
app.get("/absences", requireTeacher, async (req, res) => {
  try {
    const classe = String(req.query.classe || "").trim();
    const allowedClasses = req.teacher.classes;
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

app.patch("/absences/:id", requireTeacher, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { date, debut, fin, duree } = req.body;
    const allowedClasses = req.teacher.classes;

    if (!Number.isInteger(id) || id < 1 || !allowedClasses) {
      return res.status(400).json({ message: "Données de modification invalides." });
    }
    if (!isValidDate(date) || !isValidTime(debut) || !isValidTime(fin) || debut >= fin) {
      return res.status(400).json({ message: "La date ou les horaires sont invalides." });
    }
    if (!Number.isInteger(Number(duree)) || Number(duree) <= 0 || Number(duree) > 24) {
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

app.delete("/absences/:id", requireTeacher, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const allowedClasses = req.teacher.classes;

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
// Listen on the LAN for local development; Nginx production sets HOST explicitly to 127.0.0.1.
const HOST = process.env.HOST || "0.0.0.0";

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
