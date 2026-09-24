const API_BASE = "http://localhost:3000/api";

let selectedTime = null;
let openSlotsCache = [];

const dateInput = document.getElementById("pt-date");
const slotGrid = document.getElementById("slot-grid");
const submitBtn = document.getElementById("submit-btn");
const form = document.getElementById("booking-form");
const errorBox = document.getElementById("form-error");
const successBox = document.getElementById("form-success");
const connBanner = document.getElementById("conn-banner");

// default the date picker to today, and don't allow picking a past date
const today = new Date().toISOString().slice(0, 10);
dateInput.value = today;
dateInput.min = today;

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.style.display = "block";
  successBox.style.display = "none";
}
function clearMessages() {
  errorBox.style.display = "none";
  successBox.style.display = "none";
}

async function loadSlots() {
  selectedTime = null;
  updateSubmitState();
  slotGrid.innerHTML = `<div class="slot-loading">Loading available times\u2026</div>`;
  try {
    const res = await fetch(`${API_BASE}/slots?date=${dateInput.value}`);
    if (!res.ok) throw new Error("bad response");
    const data = await res.json();
    connBanner.style.display = "none";
    renderSlots(data.allSlots, data.openSlots);
  } catch (err) {
    connBanner.style.display = "block";
    slotGrid.innerHTML = `<div class="slot-empty">Unable to load time slots.</div>`;
  }
}

function renderSlots(allSlots, openSlots) {
  openSlotsCache = openSlots;
  if (allSlots.length === 0) {
    slotGrid.innerHTML = `<div class="slot-empty">No slots configured.</div>`;
    return;
  }
  slotGrid.innerHTML = "";
  allSlots.forEach((time) => {
    const isOpen = openSlots.includes(time);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-btn" + (isOpen ? "" : " taken");
    btn.textContent = time;
    btn.disabled = !isOpen;
    if (isOpen) {
      btn.onclick = () => selectSlot(time, btn);
    }
    slotGrid.appendChild(btn);
  });
}

function selectSlot(time, btnEl) {
  selectedTime = time;
  document.querySelectorAll(".slot-btn").forEach((b) => b.classList.remove("selected"));
  btnEl.classList.add("selected");
  updateSubmitState();
}

function updateSubmitState() {
  const name = document.getElementById("pt-name").value.trim();
  const contact = document.getElementById("pt-contact").value.trim();
  const reason = document.getElementById("reason").value.trim();
  submitBtn.disabled = !(name && contact && reason && selectedTime && dateInput.value);
}

["pt-name", "pt-contact", "reason"].forEach((id) => {
  document.getElementById(id).addEventListener("input", updateSubmitState);
});
dateInput.addEventListener("change", loadSlots);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessages();
  submitBtn.disabled = true;
  submitBtn.textContent = "Booking\u2026";

  const payload = {
    date: dateInput.value,
    time: selectedTime,
    reason: document.getElementById("reason").value.trim(),
    newPatientName: document.getElementById("pt-name").value.trim(),
    newPatientContact: document.getElementById("pt-contact").value.trim(),
    source: "patient",
  };

  try {
    const res = await fetch(`${API_BASE}/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      // most likely a 409 conflict — someone else took the slot first
      showError(data.error || "Something went wrong. Please try again.");
      submitBtn.textContent = "Confirm Booking";
      loadSlots(); // refresh so the now-taken slot shows correctly
      return;
    }

    document.getElementById("confirm-details").textContent =
      `${payload.newPatientName}, you're set for ${payload.date} at ${payload.time}. ` +
      `Reason: ${payload.reason}. We'll see you then!`;
    document.getElementById("confirm-modal").classList.add("active");
  } catch (err) {
    connBanner.style.display = "block";
    showError("Couldn't reach the clinic system. Please try again in a moment.");
  } finally {
    submitBtn.textContent = "Confirm Booking";
  }
});

function resetForm() {
  form.reset();
  dateInput.value = today;
  selectedTime = null;
  document.getElementById("confirm-modal").classList.remove("active");
  clearMessages();
  loadSlots();
  updateSubmitState();
}

loadSlots();
