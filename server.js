// server.js
require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const nodemailer = require("nodemailer");

const app = express();
const upload = multer();

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
const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL_CA_PATH
    ? { ca: fs.readFileSync(path.resolve(__dirname, process.env.DB_SSL_CA_PATH)) }
    : { rejectUnauthorized: false }, // Render/Aiven safe
  waitForConnections: true,
  connectionLimit: 10,
});

// Test DB connection
(async () => {
  try {
    await db.query("SELECT 1");
    console.log("✅ Database connected securely via SSL");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
  }
})();

// ===================== ROUTES =====================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// Dummy isHR middleware
const isHR = (req, res, next) => {
  // Add your real auth logic here
  next();
};

// ===================== CREATE OFFER =====================
app.post("/create-offer", isHR, upload.none(), async (req, res) => {
  try {
    const { name, email, position, salary } = req.body;
    if (!name || !email || !position || !salary)
      return res.status(400).json({ message: "Missing fields" });

    const token = uuidv4();
    const offerLink = `${process.env.HOST_URL}/offer.html?token=${token}`;

    // Generate PDF (replace with your real function)
    // const pdfPath = await generateOfferPDF({ name, position, salary });

    // Send email (replace with your transporter config)
    // await transporter.sendMail({ ... });

    await db.execute(
      `INSERT INTO offers (candidate_name,email,position,salary,token,status)
       VALUES (?,?,?,?,?,'PENDING')`,
      [name, email, position, salary, token]
    );

    res.json({ message: "Offer created", token, link: offerLink });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===================== DASHBOARD =====================
app.get("/hr-dashboard", isHR, async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM offers ORDER BY id DESC");
  res.json(rows);
});

// ===================== OFFER DETAILS =====================
app.get("/offer-details", async (req, res) => {
  const { token } = req.query;
  const [rows] = await db.execute(
    "SELECT candidate_name, position, salary, status FROM offers WHERE token=?",
    [token]
  );
  if (!rows.length) return res.status(404).json({ message: "Offer not found" });
  res.json({ success: true, offer: rows[0] });
});

// ===================== OFFER ACTION =====================
app.post("/offer-action", async (req, res) => {
  const { token, status } = req.body;
  if (!token || !["ACCEPTED", "REJECTED"].includes(status))
    return res.status(400).json({ message: "Invalid request" });

  const [result] = await db.execute(
    `UPDATE offers SET status=?, token=NULL WHERE token=? AND status='PENDING'`,
    [status, token]
  );

  if (!result.affectedRows)
    return res.status(400).json({ message: "Offer already processed" });

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
