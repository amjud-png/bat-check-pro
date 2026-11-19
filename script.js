// State utama simulator BAT-CHECK Pro
const state = {
  mode: "ocv",
  ocv: 12.68,
  crank: 10.85,
  charge: 14.20,
  leak: 12,
  isScanning: false,
  wavePhase: 0
};

const STORAGE_KEY = "batcheck_pro_history_v2";
let audioCtx = null;

// Referensi DOM
const el = {
  ledOk: document.getElementById("ledOk"),
  ledWarn: document.getElementById("ledWarn"),
  ledFault: document.getElementById("ledFault"),
  oledMode: document.getElementById("oledMode"),
  oledMotor: document.getElementById("oledMotor"),
  oledValue: document.getElementById("oledValue"),
  oledUnit: document.getElementById("oledUnit"),
  oledSub: document.getElementById("oledSub"),
  oledStatus: document.getElementById("oledStatus"),
  sohText: document.getElementById("sohText"),
  sohFill: document.getElementById("sohFill"),
  canvas: document.getElementById("oledWave"),
  toggleBuzzer: document.getElementById("toggleBuzzer"),
  inputPlate: document.getElementById("inputPlate"),
  selectMotor: document.getElementById("selectMotor"),
  selectBattery: document.getElementById("selectBattery"),
  sliderOcv: document.getElementById("sliderOcv"),
  sliderCrank: document.getElementById("sliderCrank"),
  sliderCharge: document.getElementById("sliderCharge"),
  sliderLeak: document.getElementById("sliderLeak"),
  valOcv: document.getElementById("valOcv"),
  valCrank: document.getElementById("valCrank"),
  valCharge: document.getElementById("valCharge"),
  valLeak: document.getElementById("valLeak"),
  btnAutoScan: document.getElementById("btnAutoScan"),
  btnPrint: document.getElementById("btnPrint"),
  receiptPaper: document.getElementById("receiptPaper"),
  receiptContent: document.getElementById("receiptContent"),
  btnPrintPdf: document.getElementById("btnPrintPdf"),
  btnCopyReceipt: document.getElementById("btnCopyReceipt"),
  historyList: document.getElementById("historyList"),
  btnClearHistory: document.getElementById("btnClearHistory")
};

// Efek suara buzzer multimeter via Web Audio API
function playBeep(freq = 1200, duration = 0.07) {
  if (!el.toggleBuzzer.checked) return;
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (err) {
    // Abaikan jika browser memblokir audio sebelum interaksi
  }
}

// Evaluasi tiap parameter berdasarkan standar kelistrikan motor 12V
function evaluateAll() {
  const ocvRes =
    state.ocv >= 12.6
      ? { level: "ok", label: "NORMAL", note: "Aki penuh (SoC 90-100%)" }
      : state.ocv >= 12.2
      ? { level: "warn", label: "PERLU CAS", note: "Tegangan turun (SoC 50-80%)" }
      : { level: "fault", label: "AKI SOAK", note: "Tegangan rendah (SoC < 50%)" };

  const crankRes =
    state.crank >= 10.2
      ? { level: "ok", label: "KUAT", note: "Drop starter normal, CCA baik" }
      : state.crank >= 9.6
      ? { level: "warn", label: "LEMAH", note: "Aki mulai berat saat starter" }
      : { level: "fault", label: "DROP KRITIS", note: "Aki soak / dinamo starter berat" };

  const chargeRes =
    state.charge >= 13.5 && state.charge <= 14.8
      ? { level: "ok", label: "NORMAL", note: "Kiprok & spul bekerja optimal" }
      : state.charge > 14.8
      ? { level: "fault", label: "OVERCHARGE", note: "Bahaya! Kiprok/regulator rusak" }
      : { level: "warn", label: "UNDERCHARGE", note: "Pengisian lemah, cek spul/soket" };

  const leakRes =
    state.leak <= 25
      ? { level: "ok", label: "AMAN", note: "Arus standby ECU/jam normal" }
      : state.leak <= 50
      ? { level: "warn", label: "WASPADA", note: "Cek alarm atau aksesori tambahan" }
      : { level: "fault", label: "BOCOR ARUS", note: "Indikasi korsleting / parasitic draw" };

  // Hitung estimasi State of Health (SoH) 0 - 100%
  const scoreMap = { ok: 25, warn: 14, fault: 4 };
  const soh = Math.min(
    100,
    scoreMap[ocvRes.level] +
      scoreMap[crankRes.level] +
      scoreMap[chargeRes.level] +
      scoreMap[leakRes.level]
  );

  let overall = "ok";
  if ([ocvRes, crankRes, chargeRes, leakRes].some((r) => r.level === "fault")) {
    overall = "fault";
  } else if ([ocvRes, crankRes, chargeRes, leakRes].some((r) => r.level === "warn")) {
    overall = "warn";
  }

  return { ocvRes, crankRes, chargeRes, leakRes, soh, overall };
}

// Perbarui tampilan layar OLED & LED indikator
function updateOLED() {
  const res = evaluateAll();
  const motorShort = el.selectMotor.value.split(" ").slice(0, 2).join(" ").toUpperCase();
  el.oledMotor.textContent = motorShort;

  let currentEval = res.ocvRes;
  if (state.mode === "ocv") {
    el.oledMode.textContent = "MODE: OCV (DIAM)";
    el.oledValue.textContent = state.ocv.toFixed(2);
    el.oledUnit.textContent = "V";
    currentEval = res.ocvRes;
  } else if (state.mode === "crank") {
    el.oledMode.textContent = "MODE: CRANKING";
    el.oledValue.textContent = state.crank.toFixed(2);
    el.oledUnit.textContent = "V";
    currentEval = res.crankRes;
  } else if (state.mode === "charge") {
    el.oledMode.textContent = "MODE: CHARGING";
    el.oledValue.textContent = state.charge.toFixed(2);
    el.oledUnit.textContent = "V";
    currentEval = res.chargeRes;
  } else {
    el.oledMode.textContent = "MODE: PARASITIC";
    el.oledValue.textContent = state.leak.toFixed(0);
    el.oledUnit.textContent = "mA";
    currentEval = res.leakRes;
  }

  el.oledSub.textContent = currentEval.note;
  el.oledStatus.textContent = currentEval.label;
  el.oledStatus.className = `status-pill ${currentEval.level}`;

  // Bar SoH
  el.sohText.textContent = `${res.soh}%`;
  el.sohFill.style.width = `${res.soh}%`;
  el.sohFill.style.background =
    res.soh >= 80 ? "#22c55e" : res.soh >= 50 ? "#f59e0b" : "#ef4444";

  // LED hardware
  el.ledOk.className = "led" + (currentEval.level === "ok" ? " on-ok" : "");
  el.ledWarn.className = "led" + (currentEval.level === "warn" ? " on-warn" : "");
  el.ledFault.className = "led" + (currentEval.level === "fault" ? " on-fault" : "");
}

// Animasi gelombang osiloskop mini di layar OLED
function drawWave() {
  const ctx = el.canvas.getContext("2d");
  const w = el.canvas.width;
  const h = el.canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Grid tipis
  ctx.strokeStyle = "rgba(56, 232, 255, 0.12)";
  ctx.lineWidth = 1;
  for (let y = 18; y < h; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#38e8ff";
  ctx.lineWidth = 2;
  ctx.beginPath();

  for (let x = 0; x < w; x++) {
    const t = (x + state.wavePhase) * 0.05;
    let y = h * 0.5;

    if (state.mode === "ocv") {
      // Garis DC stabil dengan noise halus
      const norm = (13.4 - state.ocv) / 3.4;
      y = 14 + norm * (h - 28) + Math.sin(t * 2) * 1.2;
    } else if (state.mode === "crank") {
      // Bentuk gelombang drop sesaat seperti beban starter
      const dip = Math.exp(-Math.pow(((x + state.wavePhase * 1.5) % w - w * 0.45) / 28, 2));
      const depth = (12.6 - state.crank) * 7.5;
      y = 20 + dip * Math.min(depth, h - 26) + Math.sin(t * 4) * 2;
    } else if (state.mode === "charge") {
      // Ripple tegangan AC-to-DC dari kiprok
      const rippleAmp = state.charge > 14.8 ? 12 : 4.5;
      const base = state.charge > 14.8 ? 18 : state.charge < 13.5 ? 50 : 34;
      y = base + Math.sin(t * 3.5) * rippleAmp;
    } else {
      // Pulsa arus bocor
      const pulse = state.leak > 50 ? Math.abs(Math.sin(t * 2.5)) * 24 : Math.sin(t) * 3;
      y = h - 16 - pulse;
    }

    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  state.wavePhase += 1.6;
  requestAnimationFrame(drawWave);
}

// Rekomendasi teknis otomatis untuk struk
function buildRecommendation(res) {
  const recs = [];
  if (res.ocvRes.level !== "ok") recs.push("- Lakukan pengisian aki / cek sel aki.");
  if (res.crankRes.level !== "ok") recs.push("- Uji beban CCA & cek arang dinamo starter.");
  if (state.charge > 14.8) recs.push("- SEGERA ganti kiprok/regulator (Overcharge!).");
  else if (state.charge < 13.5) recs.push("- Cek spul pengisian, kiprok & soket konektor.");
  if (res.leakRes.level !== "ok") recs.push("- Cek kebocoran kabel, alarm, atau kunci kontak.");
  if (recs.length === 0) recs.push("- Kondisi sistem kelistrikan sangat prima.");
  return recs.join("\n");
}

// Cetak struk thermal & simpan ke riwayat
function printThermalReceipt(saveToLog = true) {
  playBeep(1500, 0.08);
  const res = evaluateAll();
  const now = new Date();
  const timeStr = now.toLocaleString("id-ID", {
    dateStyle: "short",
    timeStyle: "short"
  });
  const plate = (el.inputPlate.value || "TANPA PLAT").toUpperCase();
  const overallText =
    res.overall === "ok" ? "SEHAT / LAYAK" : res.overall === "warn" ? "PERLU PERAWATAN" : "BUTUH PERBAIKAN";

  const receipt = [
    "==================================",
    "        BAT-CHECK PRO v2.0        ",
    "  Smart Motorcycle Electrical Kit ",
    "==================================",
    `Waktu   : ${timeStr}`,
    `Plat/ID : ${plate}`,
    `Motor   : ${el.selectMotor.value}`,
    `Aki     : ${el.selectBattery.value}`,
    "----------------------------------",
    `1. OCV (Diam)   : ${state.ocv.toFixed(2)} V [${res.ocvRes.label}]`,
    `2. Cranking     : ${state.crank.toFixed(2)} V [${res.crankRes.label}]`,
    `3. Charging     : ${state.charge.toFixed(2)} V [${res.chargeRes.label}]`,
    `4. Parasitic    : ${state.leak} mA [${res.leakRes.label}]`,
    "----------------------------------",
    `SKOR KESEHATAN  : ${res.soh}%`,
    `KESIMPULAN      : ${overallText}`,
    "----------------------------------",
    "REKOMENDASI TEKNIS:",
    buildRecommendation(res),
    "==================================",
    "   Terima kasih - Drive Safely!   ",
    "=================================="
  ].join("\n");

  el.receiptContent.textContent = receipt;
  el.receiptPaper.classList.remove("printing");
  void el.receiptPaper.offsetWidth; // restart animasi
  el.receiptPaper.classList.add("printing");

  if (saveToLog) {
    saveHistory({ time: timeStr, plate, motor: el.selectMotor.value, soh: res.soh, overall: res.overall });
  }
}

// LocalStorage Riwayat Diagnosa
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(entry) {
  const list = loadHistory();
  list.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 15)));
  renderHistory();
}

function renderHistory() {
  const list = loadHistory();
  if (list.length === 0) {
    el.historyList.innerHTML = `<li class="empty-msg">Belum ada riwayat diagnosa tersimpan.</li>`;
    return;
  }
  el.historyList.innerHTML = list
    .map(
      (item) => `
      <li class="history-item">
        <div>
          <strong>${item.plate}</strong> — ${item.motor}
          <div class="history-meta">${item.time} • SoH ${item.soh}%</div>
        </div>
        <span class="status-pill ${item.overall}">${item.overall.toUpperCase()}</span>
      </li>`
    )
    .join("");
}

// Sinkronisasi slider UI
function syncSliders() {
  el.sliderOcv.value = state.ocv;
  el.sliderCrank.value = state.crank;
  el.sliderCharge.value = state.charge;
  el.sliderLeak.value = state.leak;
  el.valOcv.textContent = `${state.ocv.toFixed(2)} V`;
  el.valCrank.textContent = `${state.crank.toFixed(2)} V`;
  el.valCharge.textContent = `${state.charge.toFixed(2)} V`;
  el.valLeak.textContent = `${state.leak} mA`;
  updateOLED();
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".key-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  playBeep(1100, 0.05);
  updateOLED();
}

// Event Listeners
document.querySelectorAll(".key-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!state.isScanning) setMode(btn.dataset.mode);
  });
});

el.sliderOcv.addEventListener("input", (e) => { state.ocv = parseFloat(e.target.value); syncSliders(); });
el.sliderCrank.addEventListener("input", (e) => { state.crank = parseFloat(e.target.value); syncSliders(); });
el.sliderCharge.addEventListener("input", (e) => { state.charge = parseFloat(e.target.value); syncSliders(); });
el.sliderLeak.addEventListener("input", (e) => { state.leak = parseInt(e.target.value, 10); syncSliders(); });
el.selectMotor.addEventListener("change", updateOLED);

// Preset Skenario
const PRESETS = {
  normal: { ocv: 12.68, crank: 10.85, charge: 14.20, leak: 12 },
  weak: { ocv: 11.75, crank: 8.80, charge: 13.85, leak: 15 },
  overcharge: { ocv: 12.90, crank: 11.10, charge: 15.85, leak: 18 },
  undercharge: { ocv: 12.15, crank: 9.70, charge: 12.40, leak: 14 },
  leak: { ocv: 12.05, crank: 9.85, charge: 14.10, leak: 125 }
};

document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (state.isScanning) return;
    Object.assign(state, PRESETS[btn.dataset.preset]);
    playBeep(950, 0.06);
    syncSliders();
  });
});

// Auto-Scan 4 tahap berurutan
el.btnAutoScan.addEventListener("click", async () => {
  if (state.isScanning) return;
  state.isScanning = true;
  el.btnAutoScan.disabled = true;
  el.btnAutoScan.textContent = "SCANNING...";

  const stages = ["ocv", "crank", "charge", "leak"];
  for (const stage of stages) {
    setMode(stage);
    await new Promise((r) => setTimeout(r, 950));
  }

  state.isScanning = false;
  el.btnAutoScan.disabled = false;
  el.btnAutoScan.textContent = "AUTO SCAN (4 TAHAP)";
  printThermalReceipt(true);
});

el.btnPrint.addEventListener("click", () => printThermalReceipt(true));
el.btnPrintPdf.addEventListener("click", () => window.print());

el.btnCopyReceipt.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(el.receiptContent.textContent);
    el.btnCopyReceipt.textContent = "Tersalin!";
    setTimeout(() => (el.btnCopyReceipt.textContent = "Salin Teks"), 1500);
  } catch {
    alert("Gagal menyalin teks struk.");
  }
});

el.btnClearHistory.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
});

// Inisialisasi awal
syncSliders();
renderHistory();
drawWave();