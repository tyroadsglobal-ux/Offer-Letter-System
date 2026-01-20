// server.js
require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const nodemailer = require("nodemailer");
const session = require("express-session");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");

const generateOfferPDF = require("./utils/pdfGenerator");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

/* ===================== BASIC MIDDLEWARE ===================== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

/* ===================== SESSION ===================== */
app.use(
  session({
    name: "offer-session",
    secret: process.env.SESSION_SECRET || "default_session_secret", // REQUIRED
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production", // HTTPS only in prod
      maxAge: 1000 * 60 * 60, // 1 hour
    },
  })
);

/* ===================== DATABASE (RENDER/AIVEN SAFE) ===================== */
const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false, // <-- fixes self-signed certificate error
  },
  waitForConnections: true,
  connectionLimit: 10,
});

(async () => {
  try {
    await db.query("SELECT 1");
    console.log("✅ Database connected");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
  }
})();

/* ===================== EMAIL ===================== */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((err) => {
  if (err) console.error("❌ Mail error:", err.message);
  else console.log("✅ Mail server ready");
});

/* ===================== AUTH MIDDLEWARE ===================== */
function isHR(req, res, next) {
  if (req.session.hrLoggedIn) return next();
  return res.status(401).json({ message: "Unauthorized" });
}

/* ===================== ROUTES ===================== */
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public/login.html"))
);

/* ===================== LOGIN ===================== */
app.post("/hr-login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await db.execute(
      "SELECT * FROM hr_users WHERE email=?",
      [email]
    );

    if (!rows.length)
      return res.status(401).json({ message: "Invalid credentials" });

    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid)
      return res.status(401).json({ message: "Invalid credentials" });

    req.session.hrLoggedIn = true;
    res.json({ message: "Login successful" });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

/* ===================== LOGOUT ===================== */
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login.html"));
});

/* ===================== CREATE OFFER ===================== */
app.post("/create-offer", isHR, upload.none(), async (req, res) => {
  let pdfPath;

  try {
    const { name, email, position, salary } = req.body;
    if (!name || !email || !position || !salary) {
      return res.status(400).json({ message: "All fields required" });
    }

    const token = uuidv4();
    const offerLink = `${process.env.HOST_URL}/offer.html?token=${token}`;

    pdfPath = await generateOfferPDF({ name, position, salary });

    await transporter.sendMail({
      from: `"TYROADS HR" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Offer Letter - TYROADS",
      html: `<p>Dear ${name},<br/>Please view your offer:</p>
             <a href="${offerLink}">View Offer</a>`,
      attachments: [{ filename: "OfferLetter.pdf", path: pdfPath }],
    });

    await db.execute(
      `INSERT INTO offers 
       (candidate_name,email,position,salary,token,status)
       VALUES (?,?,?,?,?,'PENDING')`,
      [name, email, position, salary, token]
    );

    res.json({ message: "Offer sent successfully ✅" });
  } catch (err) {
    console.error("OFFER ERROR:", err);
    res.status(500).json({ message: "Offer failed" });
  } finally {
    if (pdfPath && fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
  }
});

/* ===================== DASHBOARD ===================== */
app.get("/hr-dashboard", isHR, async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM offers ORDER BY id DESC");
  res.json(rows);
});

/* ===================== OFFER DETAILS ===================== */
app.get("/offer-details", async (req, res) => {
  const { token } = req.query;

  const [rows] = await db.execute(
    "SELECT candidate_name, position, salary, status FROM offers WHERE token=?",
    [token]
  );

  if (!rows.length)
    return res.json({ success: false, message: "Invalid link" });

  res.json({ success: true, offer: rows[0] });
});

/* ===================== OFFER ACTION ===================== */
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
    return res
      .status(400)
      .json({ message: "Offer already processed" });
  }

  res.json({ message: `Offer ${status}` });
});

/* ===================== START ===================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

