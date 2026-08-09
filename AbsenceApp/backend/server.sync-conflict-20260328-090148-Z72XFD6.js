// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(bodyParser.json());


app.get('/api/absences', async (req, res) => {
    const { date } = req.query; // Receives the date from popup.js
    
    try {
        // Query the 'absences' table for the specific date
        // 'date_web' format 'DD/MM/YYYY' is often required by the CPGE site
        const r = await pool.query(
          `SELECT *, to_char(date, 'DD/MM/YYYY') as date_web 
           FROM absences 
           WHERE date::date = $1::date`,
          [date]
        );
        
        res.json(r.rows); // Sends the array of absences to the extension
    } catch (err) {
        console.error("API Extension Error:", err);
        res.status(500).json({ message: "Database error" });
    }
});

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

// ==================================================
// LOGIN — ADMIN
// ==================================================
app.post("/login/admin", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: "Champs manquants" });

  if (username === "admin" && password === "admin") {
    return res.json({ user: { nom: "Administrateur", role: "admin" } });
  } else {
    return res.status(401).json({ message: "Identifiants admin incorrects" });
  }
});

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
    const classes = Array.isArray(prof.classes)
      ? prof.classes
      : (prof.classes || "").split(",").map(s => s.trim()).filter(Boolean);

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
    const r = await pool.query(
      "SELECT code, nom FROM eleves WHERE classe=$1 ORDER BY nom ASC",
      [req.params.classe]
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
// ADMIN UPDATE 
// ==================================================
app.post("/admin/validate", async (req, res) => {
  const { absences } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const a of absences) {
      const result = await client.query(
        `UPDATE absences
         SET motif=$1, justifiee=$2
         WHERE code=$3 AND date::date=$4::date AND debut=$5`,
        [a.motif || null, a.justifiee, a.code, a.date, a.debut]
      );
      if (result.rowCount === 0) console.warn(`Aucune ligne trouvée pour ${a.nom}`);
    }
    await client.query("COMMIT");
    res.json({ message: "Mise à jour réussie !" });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ message: "Erreur lors de la validation" });
  } finally {
    client.release();
  }
});
// ==================================================
// GET Absences for Admin/Dashboard
// ==================================================
app.get("/admin/absences", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT *, date::text FROM absences WHERE date::date=$1 ORDER BY debut",
      [req.query.date]
    );
    res.json(r.rows);
  } catch (err) { 
    console.error(err);
    res.status(500).send("Erreur lors de la récupération des données"); 
  }
});

// ==================================================
// ADMIN — Run Playwright script (proxy to Machine B)
// ==================================================
// Set PLAYWRIGHT_RUNNER_URL on Machine A to Machine B's runner, e.g. http://192.168.x.x:6000
const PLAYWRIGHT_RUNNER_URL = process.env.PLAYWRIGHT_RUNNER_URL || "";

app.post("/admin/run-playwright", async (req, res) => {
  if (!PLAYWRIGHT_RUNNER_URL) {
    return res.status(503).json({
      message: "Playwright runner non configuré (PLAYWRIGHT_RUNNER_URL manquant).",
    });
  }
  try {
    const runnerRes = await fetch(`${PLAYWRIGHT_RUNNER_URL}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
    });
    const data = await runnerRes.json().catch(() => ({}));
    if (!runnerRes.ok) {
      return res.status(runnerRes.status).json({
        message: data.message || "Erreur du script Playwright.",
      });
    }
    res.json({ message: data.message || "Script Playwright exécuté." });
  } catch (err) {
    console.error("Playwright runner error:", err);
    res.status(502).json({
      message: "Impossible de joindre le script Playwright (machine B).",
    });
  }
});

// ==================================================
// START SERVER
// ==================================================
app.listen(5000, () => console.log("Backend running on http://192.168.36.158:5000")); //change later to admins PC IP
// // server.js



//const PORT = 5000;
//const HOST = '0.0.0.0'; 

//app.listen(PORT, HOST, () => {
  //console.log(`Backend running and accessible on http://absence-app.local:${PORT}`);
//}); listen to all local devices
