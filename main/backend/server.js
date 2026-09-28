const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "db.json");
const PORT = 3000;

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// Seed the JSON "database" on first run, using TODAY's date rather than a
// hardcoded one baked into the repo — otherwise demo appointments would
// silently stop showing up on the admin dashboard the day after cloning.
function seedIfMissing() {
  if (fs.existsSync(DB_PATH)) return;
  const today = todayStr();
  const seed = {
    // one seeded staff account — this is the ONLY account allowed to hit
    // admin-only endpoints (full patient list, full schedule, cancel, etc.)
    admins: [
      { username: "secretary", staffRole: "secretary", passwordHash: bcrypt.hashSync("clinic123", 8) },
      { username: "doctor", staffRole: "dentist", passwordHash: bcrypt.hashSync("doctor123", 8) },
    ],
    patients: [
      { id: "D-2039", name: "Juan Dela Cruz", email: "juan.delacruz@example.com", passwordHash: bcrypt.hashSync("patient123", 8),
        contact: "0917 123 4567", lastVisit: "Jan 12, 2026", nextVisit: today, status: "Active",
        dental: "Routine cleanings every 6 months. No major procedures on file.", medical: "No known allergies.",
        notes: [{ id: "N-0001", text: "Routine cleaning completed, no cavities found.", authorRole: "dentist", createdAt: "2026-01-12T09:30:00.000Z" }] },
      { id: "D-1142", name: "Maria Clara", email: "maria.clara@example.com", passwordHash: bcrypt.hashSync("patient123", 8),
        contact: "0918 555 2211", lastVisit: "Feb 20, 2026", nextVisit: today, status: "At Risk",
        dental: "Upper left molar extraction scheduled. Missed 2 prior appointments.", medical: "Penicillin allergy \u2014 noted for prescriptions.",
        notes: [] },
      { id: "D-9982", name: "Roberto Blanco", email: "roberto.blanco@example.com", passwordHash: bcrypt.hashSync("patient123", 8),
        contact: "0919 888 3344", lastVisit: "May 5, 2026", nextVisit: "\u2014", status: "New",
        dental: "First visit on file \u2014 no prior history.", medical: "None recorded yet.",
        notes: [] },
      { id: "D-3321", name: "Elena Guerrero", email: "elena.guerrero@example.com", passwordHash: bcrypt.hashSync("patient123", 8),
        contact: "0920 222 7788", lastVisit: "Dec 15, 2025", nextVisit: "\u2014", status: "Active",
        dental: "Ongoing orthodontic monitoring, no adjustments needed.", medical: "Type 2 diabetes \u2014 managed, monitor healing time.",
        notes: [] },
    ],
    appointments: [
      { id: "A-0001", date: today, time: "9:00 AM", reason: "Regular Checkup & Cleaning", patientId: "D-2039", status: "confirmed", riskFlag: false, source: "admin", createdAt: new Date().toISOString() },
      { id: "A-0002", date: today, time: "10:00 AM", reason: "Tooth Extraction - Upper Left Molar", patientId: "D-1142", status: "confirmed", riskFlag: true, source: "admin", createdAt: new Date().toISOString() },
      { id: "A-0003", date: today, time: "11:00 AM", reason: "Walk-in Consultation", patientId: "D-9982", status: "cancelled", riskFlag: false, source: "admin", createdAt: new Date().toISOString() },
    ],
  };
  fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2));
  console.log("Seeded db.json with starter accounts and today's schedule.");
  console.log("  Admin login   -> secretary / clinic123 (role: secretary)");
  console.log("                   doctor / doctor123 (role: dentist)");
  console.log("  Patient login -> juan.delacruz@example.com / patient123 (or maria.clara / roberto.blanco / elena.guerrero @example.com)");
}

const app = express();
app.use(cors()); // permissive for local prototype use — auth is enforced by tokens below, not by origin
app.use(express.json());

// ---------- tiny JSON-file "database" ----------
function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}
function nextId(items, prefix) {
  const max = items.reduce((m, it) => {
    const n = parseInt(String(it.id).replace(prefix, ""), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return prefix + String(max + 1).padStart(4, "0");
}
function publicPatient(p) {
  const { passwordHash, ...safe } = p;
  return safe;
}

const ALL_SLOTS = ["9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"];

// ================= AUTH (in-memory sessions — simple token per login, fine for a local demo) =================
// token -> { role: "patient" | "admin", patientId?: string }
const sessions = new Map();

function issueToken(session) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, session);
  return token;
}

function requireAuth(role) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    const session = token && sessions.get(token);
    if (!session || session.role !== role) {
      return res.status(401).json({ error: `Not authorized \u2014 valid ${role} login required.` });
    }
    req.session = session;
    next();
  };
}
const requirePatient = requireAuth("patient");
const requireAdmin = requireAuth("admin"); // any staff account — secretary or dentist

// Some admin endpoints are further restricted to one specific staff role
// (e.g. only the secretary books/cancels; only the dentist writes treatment notes).
function requireStaffRole(staffRole) {
  return (req, res, next) => {
    if (req.session.staffRole !== staffRole) {
      return res.status(403).json({ error: `This action is restricted to ${staffRole} accounts.` });
    }
    next();
  };
}

// Treatment notes are clinical data — only ever included in the response for a dentist.
function patientForRole(patient, staffRole) {
  const safe = publicPatient(patient);
  if (staffRole !== "dentist") delete safe.notes;
  return safe;
}

// ---- Patient registration ----
app.post("/api/auth/register", (req, res) => {
  const { name, email, contact, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, and password are required." });
  }
  const db = readDB();
  const exists = db.patients.find((p) => p.email && p.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    return res.status(409).json({ error: "An account with that email already exists. Try logging in instead." });
  }
  const patient = {
    id: nextId(db.patients, "D-"),
    name,
    email,
    passwordHash: bcrypt.hashSync(password, 8),
    contact: contact || "\u2014",
    lastVisit: "\u2014",
    nextVisit: "\u2014",
    status: "New",
    dental: "No prior history \u2014 first visit.",
    medical: "Not yet recorded.",
    notes: [],
  };
  db.patients.push(patient);
  writeDB(db);
  const token = issueToken({ role: "patient", patientId: patient.id });
  res.status(201).json({ token, patient: publicPatient(patient) });
});

// ---- Patient login ----
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const db = readDB();
  const patient = db.patients.find((p) => p.email && p.email.toLowerCase() === (email || "").toLowerCase());
  if (!patient || !patient.passwordHash || !bcrypt.compareSync(password || "", patient.passwordHash)) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  const token = issueToken({ role: "patient", patientId: patient.id });
  res.json({ token, patient: publicPatient(patient) });
});

// ---- Admin (staff) login ----
app.post("/api/auth/admin-login", (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const admin = (db.admins || []).find((a) => a.username === username);
  if (!admin || !bcrypt.compareSync(password || "", admin.passwordHash)) {
    return res.status(401).json({ error: "Incorrect username or password." });
  }
  const token = issueToken({ role: "admin", username: admin.username, staffRole: admin.staffRole });
  res.json({ token, username: admin.username, staffRole: admin.staffRole });
});

app.post("/api/auth/logout", (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

// ================= PATIENT SELF-SERVICE (scoped to the logged-in patient only) =================

// GET my own profile — a patient can only ever see THEIR OWN record, never the full table
app.get("/api/me", requirePatient, (req, res) => {
  const db = readDB();
  const patient = db.patients.find((p) => p.id === req.session.patientId);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  res.json(publicPatient(patient));
});

// GET my own appointment history
app.get("/api/me/appointments", requirePatient, (req, res) => {
  const db = readDB();
  const mine = db.appointments.filter((a) => a.patientId === req.session.patientId);
  res.json({ appointments: mine });
});

// ================= ADMIN-ONLY: full patient directory =================

app.get("/api/patients", requireAdmin, (req, res) => {
  const db = readDB();
  res.json(db.patients.map((p) => patientForRole(p, req.session.staffRole)));
});

app.get("/api/patients/:id", requireAdmin, (req, res) => {
  const db = readDB();
  const patient = db.patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  res.json(patientForRole(patient, req.session.staffRole));
});

// Add a clinical treatment note — dentist only. Secretary accounts (and patients)
// have no route to this at all, matching the paper's user-class scope.
app.post("/api/patients/:id/notes", requireAdmin, requireStaffRole("dentist"), (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Note text is required." });
  const db = readDB();
  const patient = db.patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  if (!patient.notes) patient.notes = [];
  const note = {
    id: nextId(patient.notes.length ? patient.notes : [{ id: "N-0000" }], "N-"),
    text: text.trim(),
    authorRole: "dentist",
    createdAt: new Date().toISOString(),
  };
  patient.notes.push(note);
  writeDB(db);
  res.status(201).json({ patient: patientForRole(patient, "dentist") });
});

// ================= APPOINTMENTS =================

// GET appointments for a given date — shows patient names/reasons for the WHOLE clinic, admin-only
app.get("/api/appointments", requireAdmin, (req, res) => {
  const db = readDB();
  const date = req.query.date || todayStr();
  const dayAppointments = db.appointments.filter((a) => a.date === date);
  res.json({ date, appointments: dayAppointments });
});

// GET open slots for a date — just times, no patient data, safe to leave public so the booking page can show availability before login
app.get("/api/slots", (req, res) => {
  const db = readDB();
  const date = req.query.date || todayStr();
  const taken = db.appointments
    .filter((a) => a.date === date && a.status !== "cancelled")
    .map((a) => a.time);
  const open = ALL_SLOTS.filter((s) => !taken.includes(s));
  res.json({ date, openSlots: open, allSlots: ALL_SLOTS });
});

// POST a new appointment — patients can only ever book for THEMSELVES (patientId comes
// from their token, never from the request body); admins can book for any patient or a new one.
app.post("/api/appointments", (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const session = token && sessions.get(token);

  if (!session || (session.role !== "patient" && session.role !== "admin")) {
    return res.status(401).json({ error: "You need to be logged in to book an appointment." });
  }
  if (session.role === "admin" && session.staffRole !== "secretary") {
    return res.status(403).json({ error: "Only secretary accounts can book appointments on behalf of patients." });
  }

  const db = readDB();
  const { date, time, reason } = req.body;

  if (!date || !time || !reason) {
    return res.status(400).json({ error: "date, time, and reason are required" });
  }
  if (!ALL_SLOTS.includes(time)) {
    return res.status(400).json({ error: "Not a valid clinic time slot" });
  }
  const conflict = db.appointments.find(
    (a) => a.date === date && a.time === time && a.status !== "cancelled"
  );
  if (conflict) {
    return res.status(409).json({ error: `The ${time} slot on ${date} is already booked.` });
  }

  let finalPatientId;
  let source;

  if (session.role === "patient") {
    // a patient can ONLY book for themselves — ignore any patientId the client might send
    finalPatientId = session.patientId;
    source = "patient";
  } else {
    // admin booking on behalf of an existing or brand-new patient
    source = "admin";
    if (req.body.patientId) {
      finalPatientId = req.body.patientId;
    } else if (req.body.newPatientName) {
      const newPatient = {
        id: nextId(db.patients, "D-"),
        name: req.body.newPatientName,
        email: null,
        passwordHash: null,
        contact: req.body.newPatientContact || "\u2014",
        lastVisit: "\u2014",
        nextVisit: date,
        status: "New",
        dental: "No prior history \u2014 first visit.",
        medical: "Not yet recorded.",
      };
      db.patients.push(newPatient);
      finalPatientId = newPatient.id;
    } else {
      return res.status(400).json({ error: "patientId or newPatientName is required" });
    }
  }

  const appointment = {
    id: nextId(db.appointments, "A-"),
    date,
    time,
    reason,
    patientId: finalPatientId,
    status: "confirmed",
    riskFlag: false,
    source,
    createdAt: new Date().toISOString(),
  };
  db.appointments.push(appointment);
  writeDB(db);

  const patient = db.patients.find((p) => p.id === finalPatientId);
  res.status(201).json({ appointment, patient: publicPatient(patient) });
});

// PATCH cancel an appointment — admin-only (staff manage cancellations, not patients directly, in this prototype)
app.patch("/api/appointments/:id/cancel", requireAdmin, requireStaffRole("secretary"), (req, res) => {
  const db = readDB();
  const appt = db.appointments.find((a) => a.id === req.params.id);
  if (!appt) return res.status(404).json({ error: "Appointment not found" });
  appt.status = "cancelled";
  writeDB(db);
  res.json({ appointment: appt });
});

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

seedIfMissing();
app.listen(PORT, () => {
  console.log(`Dental clinic backend running at http://localhost:${PORT}`);
});
