// ===== fx-chart app.js (no jQuery) =====

// ---- DOM ----
const el = (id) => document.getElementById(id);

const countryA = el("countryA");
const countryB = el("countryB");
const daysEl = el("days");
const refreshSecEl = el("refreshSec");
const runBtn = el("runBtn");

const infoA = el("infoA");
const infoB = el("infoB");
const pairText = el("pairText");
const rateText = el("rateText");
const timeText = el("timeText");
const note = el("note");

let chart = null;
let timer = null;

// ---- helpers ----
function fmtTime(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return await r.json();
}

// ---- country -> currency (REST Countries) ----
async function countryToCurrency(countryName) {
  // REST Countries v3.1
  const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(countryName)}?fullText=false`;
  const data = await fetchJSON(url);

  if (!Array.isArray(data) || !data[0] || !data[0].currencies) {
    throw new Error("Country not found / currencies missing");
  }

  // 1つ目の通貨コードを使う（例: { JPY: {...} }）
  const codes = Object.keys(data[0].currencies);
  if (!codes.length) throw new Error("No currency code");
  return codes[0];
}

// ---- FX (Frankfurter) ----
async function fetchLatest(base, quote) {
  // Frankfurter API
　rateText.textContent = `1 ${base} = ${Number(rate).toFixed(4)} ${quote}`;
  const data = await fetchJSON(url);
  const rate = data?.rates?.[quote];
  if (!rate) throw new Error("Rate missing");
  return { rate, date: data.date };
}

async function fetchHistory(base, quote, days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));

  const toISO = (d) => d.toISOString().slice(0, 10);
  const url = `https://api.frankfurter.app/${toISO(start)}..${toISO(end)}?base=${base}&symbols=${quote}`;
  const data = await fetchJSON(url);

  const ratesObj = data?.rates || {};
  const labels = Object.keys(ratesObj).sort(); // YYYY-MM-DD
  const values = labels.map((k) => ratesObj[k]?.[quote]).filter((v) => typeof v === "number");

  // labelsとvaluesの長さズレ防止
  const fixedLabels = [];
  const fixedValues = [];
  labels.forEach((k) => {
    const v = ratesObj[k]?.[quote];
    if (typeof v === "number") {
      fixedLabels.push(k);
      fixedValues.push(v);
    }
  });

  if (!fixedValues.length) throw new Error("No history data");
  return { labels: fixedLabels, values: fixedValues };
}

// ---- chart ----
function renderChart(labels, values, base, quote) {
  const ctx = el("chart").getContext("2d");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `${base}/${quote}`,
          data: values,
          tension: 0.25,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true }
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } }
      }
    }
  });
}

// ---- main action ----
async function run() {
  note.textContent = "";
  pairText.textContent = "-";
  rateText.textContent = "-";
  timeText.textContent = "-";

  const a = countryA.value.trim();
  const b = countryB.value.trim();
  const days = Math.max(7, Math.min(365, Number(daysEl.value || 30)));
  daysEl.value = String(days);

  if (!a || !b) {
    note.textContent = "国Aと国Bを入力してね（例: Japan / United States）";
    return;
  }

  try {
    const [curA, curB] = await Promise.all([countryToCurrency(a), countryToCurrency(b)]);
    infoA.textContent = `通貨: ${curA}`;
    infoB.textContent = `通貨: ${curB}`;

    pairText.textContent = `${curA}/${curB}`;

    const latest = await fetchLatest(curA, curB);
    rateText.textContent = String(latest.rate);
    timeText.textContent = fmtTime(new Date());

    const hist = await fetchHistory(curA, curB, days);
    renderChart(hist.labels, hist.values, curA, curB);

  } catch (e) {
    note.textContent = `エラー: ${e.message}（国名は英語がおすすめ：Japan / United States）`;
    console.error(e);
  }
}

// ---- auto refresh ----
function setupAuto() {
  if (timer) clearInterval(timer);
  const sec = Number(refreshSecEl.value || 0);
  if (sec > 0) {
    timer = setInterval(run, sec * 1000);
  }
}

runBtn.addEventListener("click", () => {
  run();
  setupAuto();
});

refreshSecEl.addEventListener("change", setupAuto);
