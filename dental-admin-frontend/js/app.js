// ---------------- In-memory demo data ----------------
let patients = [
  { id: "D-2039", name: "Juan Dela Cruz", contact: "0917 123 4567", lastVisit: "Jan 12, 2026", nextVisit: "May 19, 2026", status: "Active",
    dental: "Routine cleanings every 6 months. No major procedures on file.", medical: "No known allergies." },
  { id: "D-1142", name: "Maria Clara", contact: "0918 555 2211", lastVisit: "Feb 20, 2026", nextVisit: "May 19, 2026", status: "At Risk",
    dental: "Upper left molar extraction scheduled. Missed 2 prior appointments.", medical: "Penicillin allergy \u2014 noted for prescriptions." },
  { id: "D-9982", name: "Roberto Blanco", contact: "0919 888 3344", lastVisit: "May 5, 2026", nextVisit: "May 20, 2026", status: "New",
    dental: "First visit on file \u2014 no prior history.", medical: "None recorded yet." },
  { id: "D-3321", name: "Elena Guerrero", contact: "0920 222 7788", lastVisit: "Dec 15, 2025", nextVisit: "Jun 10, 2026", status: "Active",
    dental: "Ongoing orthodontic monitoring, no adjustments needed.", medical: "Type 2 diabetes \u2014 managed, monitor healing time." },
];

let schedule = [
  { time: "9:00 AM", patientId: "D-2039", reason: "Regular Checkup & Cleaning", status: "ok" },
  { time: "10:00 AM", patientId: "D-1142", reason: "Tooth Extraction - Upper Left Molar", status: "risk" },
  { time: "11:00 AM", patientId: null, reason: null, status: "cancelled" },
  { time: "1:00 PM", patientId: null, reason: null, status: "empty" },
  { time: "2:00 PM", patientId: null, reason: null, status: "empty" },
  { time: "3:00 PM", patientId: null, reason: null, status: "empty" },
  { time: "4:00 PM", patientId: null, reason: null, status: "empty" },
];

let currentPatientType = "existing";

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
}

// ---------------- Login ----------------
function attemptLogin() {
  const u = document.getElementById("username").value.trim();
  const p = document.getElementById("password").value;
  const err = document.getElementById("login-error");
  if (u === "secretary" && p === "clinic123") {
    err.style.display = "none";
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-screen").style.display = "block";
    initApp();
  } else {
    err.style.display = "block";
  }
}
document.getElementById("password").addEventListener("keydown", (e) => { if (e.key === "Enter") attemptLogin(); });

function logout() {
  document.getElementById("app-screen").style.display = "none";
  document.getElementById("login-screen").style.display = "grid";
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
}

// ---------------- View switching ----------------
function switchView(view) {
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === view));
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  document.getElementById("view-" + view).classList.add("active");
}

// ---------------- Init ----------------
function initApp() {
  const dateLabel = document.getElementById("today-date-label");
  dateLabel.textContent = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  document.getElementById("appt-date").valueAsDate = new Date();
  renderSchedule();
  renderRecords(patients);
  renderPatientSelect();
}

// ---------------- Schedule rendering ----------------
function renderSchedule() {
  const list = document.getElementById("schedule-list");
  list.innerHTML = "";
  schedule.forEach((slot, idx) => {
    const row = document.createElement("div");
    row.className = "slot-row";
    if (slot.status === "empty") {
      row.innerHTML = `
        <div class="slot-time">${slot.time}</div>
        <div class="empty-slot">Open slot</div>
        <div></div>
        <div class="row-actions"><button onclick="openBookingModal('${slot.time}')">Book</button></div>`;
    } else if (slot.status === "cancelled") {
      row.innerHTML = `
        <div class="slot-time">${slot.time}</div>
        <div class="empty-slot">Cancelled \u2014 flagged for reassignment</div>
        <div class="badge cancelled">Cancelled</div>
        <div class="row-actions"><button onclick="openBookingModal('${slot.time}')">Reassign</button></div>`;
    } else {
      const pt = patients.find(p => p.id === slot.patientId);
      const badge = slot.status === "risk"
        ? `<span class="badge risk">High no-show risk</span>`
        : `<span class="badge ok">Reminder sent</span>`;
      row.innerHTML = `
        <div class="slot-time">${slot.time}</div>
        <div>
          <div class="slot-patient">${pt ? pt.name : "Unknown"}</div>
          <div class="slot-reason">${slot.reason}</div>
        </div>
        ${badge}
        <div class="row-actions">
          <button onclick="viewProfile('${slot.patientId}')">View</button>
          <button onclick="cancelSlot(${idx})">Cancel</button>
        </div>`;
    }
    list.appendChild(row);
  });
}

function cancelSlot(idx) {
  schedule[idx] = { time: schedule[idx].time, patientId: null, reason: null, status: "cancelled" };
  renderSchedule();
  showToast("Appointment cancelled \u2014 slot flagged as available for reassignment.");
}

// ---------------- Patient records ----------------
function renderRecords(list) {
  const tbody = document.getElementById("records-tbody");
  document.getElementById("records-count-label").textContent = `${patients.length} patients on file`;
  tbody.innerHTML = "";
  list.forEach(p => {
    const initials = p.name.split(" ").map(w => w[0]).slice(0, 2).join("");
    const badgeClass = p.status === "At Risk" ? "risk" : (p.status === "New" ? "ok" : "ok");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><div class="pt-name"><div class="pt-avatar">${initials}</div>${p.name}</div></td>
      <td>${p.lastVisit}</td>
      <td>${p.nextVisit}</td>
      <td><span class="badge ${badgeClass}">${p.status}</span></td>
      <td><button class="link-btn" onclick="viewProfile('${p.id}')">View record</button></td>`;
    tbody.appendChild(tr);
  });
}

function handleGlobalSearch() {
  const q = document.getElementById("global-search").value.toLowerCase();
  const filtered = patients.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
  switchView("records");
  renderRecords(filtered);
}

function viewProfile(patientId) {
  const p = patients.find(x => x.id === patientId);
  if (!p) return;
  document.getElementById("profile-name").textContent = p.name + " \u2014 " + p.id;
  document.getElementById("profile-contact").textContent = p.contact;
  document.getElementById("profile-dental").textContent = p.dental;
  document.getElementById("profile-medical").textContent = p.medical;
  document.getElementById("profile-status").textContent = p.status;
  document.getElementById("profile-modal").classList.add("active");
}

// ---------------- Booking modal ----------------
function renderPatientSelect() {
  const sel = document.getElementById("patient-select");
  sel.innerHTML = patients.map(p => `<option value="${p.id}">${p.name} (${p.id})</option>`).join("");
}

function setPatientType(type) {
  currentPatientType = type;
  document.getElementById("toggle-existing").classList.toggle("active", type === "existing");
  document.getElementById("toggle-new").classList.toggle("active", type === "new");
  document.getElementById("existing-patient-field").style.display = type === "existing" ? "block" : "none";
  document.getElementById("new-patient-field").style.display = type === "new" ? "block" : "none";
}

function openBookingModal(prefTime) {
  document.getElementById("booking-error").style.display = "none";
  document.getElementById("appt-reason").value = "";
  document.getElementById("new-patient-name").value = "";
  if (prefTime) document.getElementById("appt-time").value = prefTime;
  document.getElementById("booking-modal").classList.add("active");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("active");
}

function confirmBooking() {
  const time = document.getElementById("appt-time").value;
  const reason = document.getElementById("appt-reason").value.trim();
  const errBox = document.getElementById("booking-error");

  const existingIdx = schedule.findIndex(s => s.time === time);
  if (existingIdx !== -1 && schedule[existingIdx].status !== "empty" && schedule[existingIdx].status !== "cancelled") {
    errBox.textContent = `That slot (${time}) is already booked. Please choose a different time.`;
    errBox.style.display = "block";
    return;
  }
  if (!reason) {
    errBox.textContent = "Please enter a reason for the visit.";
    errBox.style.display = "block";
    return;
  }

  let patientId;
  if (currentPatientType === "existing") {
    patientId = document.getElementById("patient-select").value;
  } else {
    const name = document.getElementById("new-patient-name").value.trim();
    if (!name) {
      errBox.textContent = "Please enter the new patient's name.";
      errBox.style.display = "block";
      return;
    }
    const newId = "D-" + Math.floor(1000 + Math.random() * 8999);
    const newPatient = { id: newId, name, contact: "\u2014", lastVisit: "\u2014", nextVisit: "To be scheduled",
      status: "New", dental: "No prior history \u2014 first visit.", medical: "Not yet recorded." };
    patients.push(newPatient);
    patientId = newId;
    renderPatientSelect();
  }

  const newSlot = { time, patientId, reason, status: "ok" };
  if (existingIdx !== -1) {
    schedule[existingIdx] = newSlot;
  } else {
    schedule.push(newSlot);
    schedule.sort((a, b) => new Date("1/1/2000 " + a.time) - new Date("1/1/2000 " + b.time));
  }

  renderSchedule();
  renderRecords(patients);
  closeModal("booking-modal");
  showToast("Appointment booked and confirmation sent.");
}
