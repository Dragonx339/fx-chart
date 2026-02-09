Sadconst $ = (id) => document.getElementById(id);

const countryAEl = $("countryA");
const countryBEl = $("countryB");
const infoAEl = $("infoA");
const infoBEl = $("infoB");
const daysEl = $("days");
const refreshSecEl = $("refreshSec");
const runBtn = $("runBtn");

const pairText = $("pairText");
const rateText = $("rateText");
const timeText = $("timeText");
const noteEl = $("note");

let chart = null;
let timer = null;

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function fetchCountryCurrency(countryName) {
  // REST Countries: /v3.1/name/{name}
  // 返り値は配列。いちばん先頭を採用して通貨コードを取る（c.currencies は object）
  const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(countryName)}?fullText=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`国が見つからない: ${countryName}`);
  const data = await res.json();
  const c = data?.[0];
  const currencies = c?.currencies;
  if (!currencies || typeof currencies !== "object") throw new Error(`通貨情報が取れない: ${countryName}`);
  const code = Object.keys(currencies)[0]; // 例: JPY, USD
  const name = currencies[code]?.name ?? "";
  return { code, name, country: c?.name?.common ?? countryName };
}

async function fetchLatest(base, quote) {
  // Frankfurter latest
  const url = `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(quote)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("レート取得失敗(latest)");
  return await res.json();
}

async function fetchTimeseries(base, quote, start, end) {
  // Frankfurter time series
  const url =
    `https://api.frankfurter.dev/v1/${start}..${end}?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(quote)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("レート取得失敗(timeseries)");
  return await res.json();
}

function setMeta(pair, latestRate, dateText) {
  pairText.textContent = pair;
  rateText.textContent = latestRate;
  timeText.textContent = dateText;
}

function destroyTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function scheduleRefresh(fn) {
  destroyTimer();
  const sec = Number(refreshSecEl.value);
  if (!Number.isFinite(sec) || sec <= 0) return;
  timer = setInterval(fn, sec * 1000);
}

function upsertChart(labels, values, labelName) {
  const ctx = $("chart");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{ label: labelName, data: values, tension: 0.25 }]
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#e8eefc" } }
      },
      scales: {
        x: { ticks: { color: "#e8eefc" }, grid: { color: "rgba(232,238,252,0.08)" } },
        y: { ticks: { color: "#e8eefc" }, grid: { color: "rgba(232,238,252,0.08)" } }
      }
    }
  });
}

async function runOnce() {
  const aName = countryAEl.value.trim();
  const bName = countryBEl.value.trim();
  if (!aName || !bName) throw new Error("国Aと国Bを両方入れてね");

  const days = Math.max(7, Math.min(365, Number(daysEl.value) || 30));
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);

  // 1) 国→通貨
  const [a, b] = await Promise.all([
    fetchCountryCurrency(aName),
    fetchCountryCurrency(bName)
  ]);

  infoAEl.textContent = `通貨: ${a.code} ${a.name ? `(${a.name})` : ""} / 国: ${a.country}`;
  infoBEl.textContent = `通貨: ${b.code} ${b.name ? `(${b.name})` : ""} / 国: ${b.country}`;

  // 2) latest
  const latest = await fetchLatest(a.code, b.code);
  const latestRate = latest?.rates?.[b.code];
  if (latestRate == null) throw new Error("最新レートが取れなかった");
  setMeta(`${a.code}/${b.code}`, `${latestRate}`, `${latest.date} (source: Frankfurter)`);

  // 3) timeseries
  const ts = await fetchTimeseries(a.code, b.code, isoDate(start), isoDate(end));
  const rates = ts?.rates || {};
  const labels = Object.keys(rates).sort(); // "YYYY-MM-DD"
  const values = labels.map(d => rates[d]?.[b.code]).filter(v => typeof v === "number");

  upsertChart(labels, values, `${a.code} → ${b.code}`);
  noteEl.textContent =
    "※ Frankfurter はECB等の公開レート基準で、超秒単位の相場ではなく日次/定期更新が中心。見た目の自動更新は可能。";
}

async function runAll() {
  try {
    noteEl.textContent = "";
    await runOnce();
    scheduleRefresh(async () => {
      try { await runOnce(); } catch (e) { /* 連続エラーは黙って止めない */ }
    });
  } catch (e) {
    destroyTimer();
    noteEl.textContent = `エラー: ${e.message}`;
  }
}

runBtn.addEventListener("click", runAll);