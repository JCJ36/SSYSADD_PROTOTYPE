const express = require("express");
const cors = require("cors");
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
    patients: [
      { id: "D-2039", name: "Juan Dela Cruz", contact: "0917 123 4567", lastVisit: "Jan 12, 2026", nextVisit: today, status: "Active",
        dental: "Routine cleanings every 6 months. No major procedures on file.", medical: "No known allergies." },
      { id: "D-1142", name: "Maria Clara", contact: "0918 555 2211", lastVisit: "Feb 20, 2026", nextVisit: today, status: "At Risk",
        dental: "Upper left molar extraction scheduled. Missed 2 prior appointments.", medical: "Penicillin allergy \u2014 noted for prescriptions." },
      { id: "D-9982", name: "Roberto Blanco", contact: "0919 888 3344", lastVisit: "May 5, 2026", nextVisit: "\u2014", status: "New",
        dental: "First visit on file \u2014 no prior history.", medical: "None recorded yet." },
      { id: "D-3321", name: "Elena Guerrero", contact: "0920 222 7788", lastVisit: "Dec 15, 2025", nextVisit: "\u2014", status: "Active",
        dental: "Ongoing orthodontic monitoring, no adjustments needed.", medical: "Type 2 diabetes \u2014 managed, monitor healing time." },
    ],
    appointments: [
      { id: "A-0001", date: today, time: "9:00 AM", reason: "Regular Checkup & Cleaning", patientId: "D-2039", status: "confirmed", riskFlag: false, source: "admin", createdAt: new Date().toISOString() },
      { id: "A-0002", date: today, time: "10:00 AM", reason: "Tooth Extraction - Upper Left Molar", patientId: "D-1142", status: "confirmed", riskFlag: true, source: "admin", createdAt: new Date().toISOString() },
      { id: "A-0003", date: today, time: "11:00 AM", reason: "Walk-in Consultation", patientId: "D-9982", status: "cancelled", riskFlag: false, source: "admin", createdAt: new Date().toISOString() },
    ],
  };
  fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2));
  console.log("Seeded db.json with starter patients and today's schedule.");
}

seedIfMissing();

const app = express();
app.use(cors()); // permissive for local prototype use — both the admin panel and patient site call this from different origins/ports
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

const ALL_SLOTS = ["9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"];

// ================= PATIENTS =================

// GET all patients (admin: Patient Records view)
app.get("/api/patients", (req, res) => {
  const db = readDB();
  res.json(db.patients);
});

// GET one patient (profile modal)
app.get("/api/patients/:id", (req, res) => {
  const db = readDB();
  const patient = db.patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  res.json(patient);
});

// ================= APPOINTMENTS =================

// GET appointments for a given date (defaults to today) — used by the admin dashboard
app.get("/api/appointments", (req, res) => {
  const db = readDB();
  const date = req.query.date || todayStr();
  const dayAppointments = db.appointments.filter((a) => a.date === date);
  res.json({ date, appointments: dayAppointments });
});

// GET open slots for a given date — used by the patient site so it only offers free times
app.get("/api/slots", (req, res) => {
  const db = readDB();
  const date = req.query.date || todayStr();
  const taken = db.appointments
    .filter((a) => a.date === date && a.status !== "cancelled")
    .map((a) => a.time);
  const open = ALL_SLOTS.filter((s) => !taken.includes(s));
  res.json({ date, openSlots: open, allSlots: ALL_SLOTS });
});

// POST a new appointment — used by BOTH the patient site (public booking) and the admin panel (staff booking)
app.post("/api/appointments", (req, res) => {
  const db = readDB();
  const { date, time, reason, patientId, newPatientName, newPatientContact, source } = req.body;

  if (!date || !time || !reason) {
    return res.status(400).json({ error: "date, time, and reason are required" });
  }
  if (!ALL_SLOTS.includes(time)) {
    return res.status(400).json({ error: "Not a valid clinic time slot" });
  }

  // conflict check — the whole reason this lives server-side now instead of in each frontend's memory
  const conflict = db.appointments.find(
    (a) => a.date === date && a.time === time && a.status !== "cancelled"
  );
  if (conflict) {
    return res.status(409).json({ error: `The ${time} slot on ${date} is already booked.` });
  }

  let finalPatientId = patientId;

  if (!finalPatientId) {
    if (!newPatientName) {
      return res.status(400).json({ error: "patientId or newPatientName is required" });
    }
    const newPatient = {
      id: nextId(db.patients, "D-"),
      name: newPatientName,
      contact: newPatientContact || "\u2014",
      lastVisit: "\u2014",
      nextVisit: date,
      status: "New",
      dental: "No prior history \u2014 first visit.",
      medical: "Not yet recorded.",
    };
    db.patients.push(newPatient);
    finalPatientId = newPatient.id;
  }

  const appointment = {
    id: nextId(db.appointments, "A-"),
    date,
    time,
    reason,
    patientId: finalPatientId,
    status: "confirmed",
    riskFlag: false,
    source: source === "patient" ? "patient" : "admin", // who booked it — patient self-booking vs staff
    createdAt: new Date().toISOString(),
  };
  db.appointments.push(appointment);
  writeDB(db);

  const patient = db.patients.find((p) => p.id === finalPatientId);
  res.status(201).json({ appointment, patient });
});

// PATCH cancel an appointment — used by the admin panel
app.patch("/api/appointments/:id/cancel", (req, res) => {
  const db = readDB();
  const appt = db.appointments.find((a) => a.id === req.params.id);
  if (!appt) return res.status(404).json({ error: "Appointment not found" });
  appt.status = "cancelled";
  writeDB(db);
  res.json({ appointment: appt });
});

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`Dental clinic backend running at http://localhost:${PORT}`);
  console.log(`Patient site and admin panel should point their API calls here.`);
});
