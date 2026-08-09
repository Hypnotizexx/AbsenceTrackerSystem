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
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "data",
  password: "dataB$#^&", 
  port: 5432,
});

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

app.post("/absences", async (req, res) => {
  try {
    const { classe, sessions, absents } = req.body; 
    const date = getTodayLocal();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      

      for (const s of sessions) {

        for (const a of absents) {

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
              7,       // default motif "Autre"
              false    // default justifiee "non"
            ]
          );
        }
      }
      
      await client.query("COMMIT");
      res.json({ message: "Absences enregistrées avec succès !" });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur lors de l'enregistrement" });
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
