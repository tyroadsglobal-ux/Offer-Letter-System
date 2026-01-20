// server.js
require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const session = require("express-session");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");

const app = express();
const upload = multer();

// ===================== MIDDLEWARE =====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ===================== SESSION =====================
app.use(
  session({
    name: "offer-session",
    secret: process.env.SESSION_SECRET || "default_session_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60, // 1 hour
    },
  })
);

// ===================== DATABASE =====================
let db;

(async () => {
  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: {
        rejectUnauthorized: false, // REQUIRED for Aiven on Render
      },
    });

    await db.query("SELECT 1");
    console.log("✅ Database connected securely via SSL");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  }
})();

// ===================== DB READY GUARD =====================
app.use((req, res, next) => {
  if (!db) {
    return res
      .status(503)
      .json({ message: "Database initializing, please retry" });
  }
  next();
});

// ===================== ROUTES =====================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// Dummy HR middleware (replace later)
const isHR = (req, res, next) => next();

// ===================== CREATE OFFER =====================
app.post("/create-offer", isHR, upload.none(), async (req, res) => {
  try {
    const { name, email, position, salary } = req.body;

    if (!name || !email || !position || !salary) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const token = uuidv4();
    const offerLink = `${process.env.HOST_URL}/offer.html?token=${token}`;

    await db.execute(
      `INSERT INTO offers
       (candidate_name, email, position, salary, token, status)
       VALUES (?, ?, ?, ?, ?, 'PENDING')`,
      [name, email, position, salary, token]
    );

    res.json({
      message: "Offer created successfully",
      token,
      link: offerLink,
    });
  } catch (err) {
    console.error("❌ OFFER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===================== HR DASHBOARD =====================
app.get("/hr-dashboard", isHR, async (req, res) => {
  const [rows] = await db.execute(
    "SELECT * FROM offers ORDER BY id DESC"
  );
  res.json(rows);
});

// ===================== OFFER DETAILS =====================
app.get("/offer-details", async (req, res) => {
  const { token } = req.query;

  const [rows] = await db.execute(
    "SELECT candidate_name, position, salary, status FROM offers WHERE token=?",
    [token]
  );

  if (!rows.length) {
    return res.status(404).json({ message: "Offer not found" });
  }

  res.json({ success: true, offer: rows[0] });
});

// ===================== OFFER ACTION =====================
app.post("/offer-action", async (req, res) => {
  const { token, status } = req.body;

  if (!token || !["ACCEPTED", "REJECTED"].includes(status)) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const [result] = await db.execute(
    `UPDATE offers
     SET status=?, token=NULL
     WHERE token=? AND status='PENDING'`,
    [status, token]
  );

  if (!result.affectedRows) {
    return res.status(400).json({ message: "Offer already processed" });
  }

  res.json({ message: `Offer ${status}` });
});

// ===================== LOGOUT =====================
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login.html"));
});

// ===================== START SERVER =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
