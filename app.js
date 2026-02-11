// ===== fx-chart app.js (no jQuery) =====

const alias = {
  "USA": "United States",
  "US": "United States",
  "America": "United States",
  "日本": "Japan",
  "イギリス": "United Kingdom",
  "韓国": "South Korea"
};

function normalizeCountry(s){
  const t = s.trim();
  return alias[t] ?? t;
}

// ---- DOM ----
const el = (id) => document.getElementById(id);

const countryA = el("countryA");
const countryB = el("countryB");
const daysEl = el("days");
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

async function fetchLatest(base, quote) {
  const url = `https://api.frankfurter.app/latest?base=${base}&symbols=${quote}`;
  const data = await fetchJSON(url);

  const rate = data?.rates?.[quote];
  if (typeof rate !== "number") throw new Error("Rate missing");

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
let currentBase = null;
let currentQuote = null;
let currentDays = 30;
let chartInitialized = false;

async function runFull() {
  note.textContent = "";
  pairText.textContent = "-";
  rateText.textContent = "-";
  timeText.textContent = "-";
    stopAutoTimers();


  const a = normalizeCountry(countryA.value);
  const b = normalizeCountry(countryB.value);

  const days = Math.max(7, Math.min(365, Number(daysEl.value || 30)));
  daysEl.value = String(days);

  if (!a || !b) {
    note.textContent = "国Aと国Bを入力してね（例: Japan / United States）";
    return;
  }

  try {
    const [curA, curB] = await Promise.all([countryToCurrency(a), countryToCurrency(b)]);

    currentBase = curA;
    currentQuote = curB;
    currentDays = days;

    infoA.textContent = `通貨: ${curA}`;
    infoB.textContent = `通貨: ${curB}`;
    pairText.textContent = `${curA}/${curB}`;

    // 最新レート表示
    const latest = await fetchLatest(curA, curB);
    rateText.textContent = `1 ${curA} = ${Number(latest.rate).toFixed(4)} ${curB}`;
    timeText.textContent = `API日付: ${latest.date} / 表示時刻: ${fmtTime(new Date())}`;

    // グラフは「最初に1回だけ」作る
    const hist = await fetchHistory(curA, curB, days);
    renderChart(hist.labels, hist.values, curA, curB);
    chartInitialized = true;

  } catch (e) {
    note.textContent = `エラー: ${e.message}（国名は英語がおすすめ：Japan / United States）`;
    console.error(e);
  }
}

async function runLatestOnly() {
  // まだ初期化できてないなら何もしない
  if (!currentBase || !currentQuote) return;

  try {
    const latest = await fetchLatest(currentBase, currentQuote);
    rateText.textContent = `1 ${currentBase} = ${Number(latest.rate).toFixed(4)} ${currentQuote}`;
    timeText.textContent = `API日付: ${latest.date} / 表示時刻: ${fmtTime(new Date())}`;
  } catch (e) {
    console.error(e);
  }
}

// ---- auto timers (fixed) ----
// 最新レート：1秒
// グラフ：30秒

let rateTimer = null;
let chartTimer = null;

function stopAutoTimers() {
  if (rateTimer) clearInterval(rateTimer);
  if (chartTimer) clearInterval(chartTimer);
  rateTimer = null;
  chartTimer = null;
}

function startAutoTimers() {
  // 重複防止
  stopAutoTimers();

  // 1秒ごとに最新レート更新
  rateTimer = setInterval(runLatestOnly, 10000);

  // 30秒ごとにグラフ更新（履歴を取り直す）
  chartTimer = setInterval(async () => {
    if (!currentBase || !currentQuote) return;

    try {
      const hist = await fetchHistory(currentBase, currentQuote, currentDays);
      renderChart(hist.labels, hist.values, currentBase, currentQuote);
    } catch (e) {
      console.error(e);
    }
  }, 30000);
}


runBtn.addEventListener("click", async () => {
  await runFull();
  startAutoTimers();
});

