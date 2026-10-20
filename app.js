// Salat Streak — Québec City prayer times + daily check-ins + streak
// Times: Aladhan API, Québec City coordinates, ISNA method (2), America/Toronto
// Check-ins: saved in this browser only (localStorage key "salat-streak-v1")

const PRAYERS = [
  { key: "Fajr",    label: "Fajr",    arabic: "الفجر" },
  { key: "Dhuhr",   label: "Dhuhr",   arabic: "الظهر" },
  { key: "Asr",     label: "Asr",     arabic: "العصر" },
  { key: "Maghrib", label: "Maghrib", arabic: "المغرب" },
  { key: "Isha",    label: "Isha",    arabic: "العشاء" },
];
const LAT = 46.8139, LON = -71.2080, METHOD = 2, TZ = "America/Toronto";
const STORE_KEY = "salat-streak-v1";
const SCHOOL_KEY = "salat-streak-school";

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => dateKey(new Date());

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function saveStore(s) { localStorage.setItem(STORE_KEY, JSON.stringify(s)); }
function dayChecks(key) {
  const s = loadStore();
  return s[key] || {};
}
function countDone(key) {
  const c = dayChecks(key);
  return PRAYERS.filter((p) => c[p.key]).length;
}
function isComplete(key) { return countDone(key) === 5; }

function computeStreak() {
  // Consecutive complete days ending today (if done) or yesterday (streak still alive today).
  let streak = 0;
  const cursor = new Date();
  if (!isComplete(todayKey())) cursor.setDate(cursor.getDate() - 1);
  while (isComplete(dateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
function computeBest() {
  const s = loadStore();
  const days = Object.keys(s).filter(isComplete).sort();
  let best = 0, run = 0, prev = null;
  for (const k of days) {
    if (prev) {
      const d = new Date(k + "T12:00:00");
      const p = new Date(prev + "T12:00:00");
      run = (d - p) / 86400000 === 1 ? run + 1 : 1;
    } else run = 1;
    best = Math.max(best, run);
    prev = k;
  }
  return Math.max(best, computeStreak());
}
function totalPerfectDays() {
  return Object.keys(loadStore()).filter(isComplete).length;
}

let selected = new Date(); selected.setHours(0, 0, 0, 0);
let todayTimings = null; // for countdown
let countdownTimer = null;

function formatTime(raw) {
  // Aladhan returns "05:12 (EST)" style strings — keep HH:MM, render 12h.
  const m = /^(\d{1,2}):(\d{2})/.exec(raw || "");
  if (!m) return raw || "—";
  let h = parseInt(m[1], 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ampm}`;
}
function apiDate(d) { return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`; }

async function fetchTimings(d) {
  const school = localStorage.getItem(SCHOOL_KEY) || "0";
  const url = `https://api.aladhan.com/v1/timings/${apiDate(d)}?latitude=${LAT}&longitude=${LON}&method=${METHOD}&school=${school}&timezonestring=${encodeURIComponent(TZ)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("API " + res.status);
  const json = await res.json();
  return json.data;
}

function renderStats() {
  $("streakCount").textContent = computeStreak();
  $("bestStreak").textContent = computeBest();
  $("totalDays").textContent = totalPerfectDays();
  $("todayCount").textContent = `${countDone(todayKey())}/5`;
}

function renderHistory() {
  const grid = $("historyGrid");
  grid.innerHTML = "";
  const end = new Date(); end.setHours(0, 0, 0, 0);
  for (let i = 27; i >= 0; i--) {
    const d = new Date(end); d.setDate(d.getDate() - i);
    const k = dateKey(d);
    const n = countDone(k);
    const cell = document.createElement("div");
    cell.className = "day-cell";
    cell.title = `${k}: ${n}/5`;
    cell.innerHTML = `<span class="dot ${n === 5 ? "full" : n > 0 ? "partial" : "empty"}"></span>${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
    grid.appendChild(cell);
  }
}

function nextPrayerInfo(timings) {
  const now = new Date();
  for (const p of PRAYERS) {
    const m = /^(\d{1,2}):(\d{2})/.exec(timings[p.key] || "");
    if (!m) continue;
    const t = new Date(); t.setHours(+m[1], +m[2], 0, 0);
    if (t > now) return { name: p.label, at: t };
  }
  const m = /^(\d{1,2}):(\d{2})/.exec(timings.Fajr || "");
  if (m) { const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(+m[1], +m[2], 0, 0); return { name: "Fajr (tomorrow)", at: t }; }
  return null;
}

function startCountdown() {
  clearInterval(countdownTimer);
  const tick = () => {
    if (!todayTimings) return;
    const info = nextPrayerInfo(todayTimings);
    if (!info) return;
    $("nextPrayerName").textContent = `${info.name} · ${formatTime(todayTimings[info.name.split(" ")[0]])}`;
    let s = Math.max(0, Math.floor((info.at - new Date()) / 1000));
    const h = Math.floor(s / 3600), min = Math.floor((s % 3600) / 60), sec = s % 60;
    $("nextPrayerCountdown").textContent = `in ${h}h ${pad(min)}m ${pad(sec)}s`;
    markNextPrayer(info.name.split(" ")[0]);
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}
function markNextPrayer(key) {
  if (dateKey(selected) !== todayKey()) return;
  document.querySelectorAll(".prayer").forEach((el) => {
    const isNext = el.dataset.key === key;
    el.classList.toggle("next", isNext);
    const tag = el.querySelector(".next-tag");
    if (tag) tag.remove();
    if (isNext) {
      const span = document.createElement("span");
      span.className = "next-tag"; span.textContent = "NEXT";
      el.querySelector(".name").appendChild(span);
    }
  });
}

async function renderDay() {
  const key = dateKey(selected);
  const isToday = key === todayKey();
  $("selectedLabel").textContent = isToday
    ? "Today"
    : selected.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });
  $("nextDay").disabled = isToday;
  $("errorBox").classList.add("hidden");

  const list = $("prayerList");
  list.innerHTML = `<p class="loading">Loading prayer times…</p>`;
  try {
    const data = await fetchTimings(selected);
    const timings = data.timings;
    if (isToday) {
      todayTimings = timings;
      $("gregorianDate").textContent = new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      const h = data.date.hijri;
      $("hijriDate").textContent = `${h.day} ${h.month.en} ${h.year} AH`;
      startCountdown();
    }
    $("sunriseNote").textContent = timings.Sunrise ? `Sunrise (shurouq): ${formatTime(timings.Sunrise)} — not one of the 5 prayers` : "";

    const checks = dayChecks(key);
    list.innerHTML = "";
    for (const p of PRAYERS) {
      const row = document.createElement("div");
      row.className = "prayer" + (checks[p.key] ? " done" : "");
      row.dataset.key = p.key;
      row.innerHTML = `
        <div class="info">
          <span class="name">${p.label}<span class="arabic">${p.arabic}</span></span>
          <div class="time">${formatTime(timings[p.key])}</div>
        </div>`;
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = !!checks[p.key];
      box.setAttribute("aria-label", `Mark ${p.label} as prayed`);
      box.addEventListener("change", () => {
        const s = loadStore();
        s[key] = s[key] || {};
        s[key][p.key] = box.checked;
        saveStore(s);
        row.classList.toggle("done", box.checked);
        renderProgress(key);
        renderStats();
        renderHistory();
      });
      row.appendChild(box);
      list.appendChild(row);
    }
    if (isToday && todayTimings) markNextPrayer((nextPrayerInfo(todayTimings) || {}).name?.split(" ")[0]);
    renderProgress(key);
  } catch (e) {
    list.innerHTML = "";
    const err = $("errorBox");
    err.textContent = "Couldn't load prayer times. Check your connection and reload the page.";
    err.classList.remove("hidden");
  }
  renderStats();
  renderHistory();
}

function renderProgress(key) {
  const n = countDone(key);
  $("progressBar").style.width = `${(n / 5) * 100}%`;
  $("progressText").textContent = `${n} of 5 prayers done`;
  $("completeBanner").classList.toggle("hidden", n !== 5);
}

$("prevDay").addEventListener("click", () => { selected.setDate(selected.getDate() - 1); renderDay(); });
$("nextDay").addEventListener("click", () => { selected.setDate(selected.getDate() + 1); renderDay(); });
$("schoolSelect").value = localStorage.getItem(SCHOOL_KEY) || "0";
$("schoolSelect").addEventListener("change", (e) => {
  localStorage.setItem(SCHOOL_KEY, e.target.value);
  todayTimings = null;
  renderDay();
});

$("gregorianDate").textContent = new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
renderDay();
