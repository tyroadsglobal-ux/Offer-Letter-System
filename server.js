const multer = require("multer");
const upload = multer();
require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const nodemailer = require("nodemailer");
const session = require("express-session");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
const path = require("path");
const generatePDF = require(path.join(__dirname, "utils", "pdfGenerator"));


const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ================= SESSION =================
app.use(
  session({
    secret: "hr-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  })
);

// ================= DATABASE =================
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

(async () => {
  try {
    await db.query("SELECT 1");
    console.log("✅ Database connected successfully");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  }
})();

// ================= EMAIL =================
// ================= EMAIL =================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

transporter.verify((err, success) => {
  if (err) {
    console.log("❌ Mail server error:", err.message);
  } else {
    console.log("✅ Mail server ready");
  }
});

// ================= AUTH =================
function isHR(req, res, next) {
  if (req.session.hrLoggedIn) next();
  else res.status(401).json({ message: "Unauthorized" });
}

// ================= ROUTES =================
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public/login.html"))
);

app.post("/hr-login", async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await db.execute(
    "SELECT * FROM hr_users WHERE email=?",
    [email]
  );

  if (!rows.length) return res.status(401).json({ message: "Invalid email" });

  const ok = await bcrypt.compare(password, rows[0].password);
  if (!ok) return res.status(401).json({ message: "Invalid password" });

  req.session.hrLoggedIn = true;
  res.json({ message: "Login success" });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login.html"));
});

// ================= CREATE OFFER =================
app.post("/create-offer", isHR, upload.none(), async (req, res) => {
  try {
    const { name, email, position, salary } = req.body;

    if (!name || !email || !position || !salary) {
      return res.status(400).json({ message: "All fields required" });
    }

    const token = uuidv4();
    const offerLink = `${process.env.HOST_URL}/offer.html?token=${token}`;

    const pdfPath = await generateOfferPDF({ name, position, salary });

    await transporter.sendMail({
  from: `"TYROADS HR" <${process.env.EMAIL_USER}>`,
  to: email,
  subject: "Offer Letter - TYROADS",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Offer Letter</h2>
      <p>Dear ${name},</p>
      <p>Congratulations! We are pleased to offer you the position of <strong>${position}</strong> at TYROADS.</p>
      <p>Please find your offer letter attached to this email.</p>
      <p>To accept or reject your offer, please click the button below:</p>
      
      <table cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;">
        <tr>
          <td align="center" bgcolor="#2563eb" style="border-radius: 6px;">
            <a href="${offerLink}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 16px; color: #ffffff; text-decoration: none; font-weight: bold;">
              View Offer
            </a>
          </td>
        </tr>
      </table>
      
      <p style="margin-top: 20px;">Or copy and paste this link in your browser:</p>
      <p style="word-break: break-all; color: #2563eb;">${offerLink}</p>
      
      <p style="margin-top: 30px;">
        Best regards,<br>
        <strong>TYROADS HR Team</strong>
      </p>
    </div>
  `,
  attachments: [
    {
      filename: "OfferLetter.pdf",
      path: pdfPath,
    },
  ],
});

    await db.execute(
      `INSERT INTO offers 
      (candidate_name,email,position,salary,token,status)
      VALUES (?,?,?,?,?,'PENDING')`,
      [name, email, position, salary, token]
    );

    res.json({ message: "Offer sent successfully ✅" });
  } catch (err) {
    console.error("❌ OFFER ERROR:", err);
    res.status(500).json({ message: "Offer failed" });
  }
});

// ================= DASHBOARD =================
app.get("/hr-dashboard", isHR, async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM offers ORDER BY id DESC");
  res.json(rows);
});

// ================= OFFER DETAILS =================
app.get("/offer-details", async (req, res) => {
  const { token } = req.query;

  const [rows] = await db.execute(
    `SELECT candidate_name, position, salary, status 
     FROM offers WHERE token=?`,
    [token]
  );

  if (!rows.length) {
    return res.json({ success: false, message: "Invalid link" });
  }

  res.json({ success: true, offer: rows[0] });
});

// ================= OFFER ACTION =================
app.post("/offer-action", async (req, res) => {
  try {
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

    if (result.affectedRows === 0) {
      return res
        .status(400)
        .json({ message: "Offer already responded or invalid" });
    }

    res.json({ message: `Offer ${status} successfully` });
  } catch (err) {
    console.error("❌ OFFER ACTION ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ================= START =================
app.listen(process.env.PORT, () =>
  console.log(`🚀 Server running on ${process.env.HOST_URL}`)
);

