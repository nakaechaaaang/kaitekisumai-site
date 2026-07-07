/* =====================================================
   サーフィン気象予報 - Surf Forecast Japan
   Data source: Open-Meteo (Marine API + Forecast API + Geocoding API)
   No API key required.
   ===================================================== */

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const STORAGE_KEY = 'surfForecast.lastSpot';

const SURF_SPOTS = [
  { name: '鵠沼（湘南・神奈川）', lat: 35.3106, lon: 139.4614 },
  { name: '一宮（千葉・九十九里）', lat: 35.3667, lon: 140.3706 },
  { name: '日南（宮崎）', lat: 31.6167, lon: 131.3833 },
  { name: '御前崎（静岡）', lat: 34.6, lon: 138.2167 },
  { name: '白浜（和歌山）', lat: 33.6833, lon: 135.3333 },
  { name: '名護（沖縄）', lat: 26.5917, lon: 127.9772 },
];

const DIRS_JA = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東',
  '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];

const WEATHER_ICON = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌦️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '🌨️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

const el = (id) => document.getElementById(id);

function degToDir(deg) {
  if (deg === null || deg === undefined || isNaN(deg)) return '--';
  const idx = Math.round(deg / 22.5) % 16;
  return DIRS_JA[idx];
}

function fmt(value, digits = 1) {
  if (value === null || value === undefined || isNaN(value)) return '--';
  return Number(value).toFixed(digits);
}

function computeScore(waveHeight, wavePeriod, windSpeedMs) {
  let points = 0;

  if (waveHeight === null || isNaN(waveHeight)) points += 1;
  else if (waveHeight < 0.3) points += 1;
  else if (waveHeight <= 0.6) points += 2;
  else if (waveHeight <= 1.8) points += 4;
  else if (waveHeight <= 2.5) points += 3;
  else points += 1;

  if (wavePeriod === null || isNaN(wavePeriod)) points += 1;
  else if (wavePeriod < 6) points += 1;
  else if (wavePeriod < 9) points += 2;
  else if (wavePeriod < 12) points += 3;
  else points += 4;

  if (windSpeedMs === null || isNaN(windSpeedMs)) points += 1;
  else if (windSpeedMs < 3) points += 4;
  else if (windSpeedMs < 6) points += 3;
  else if (windSpeedMs < 9) points += 2;
  else points += 1;

  if (points >= 10) return { label: '絶好コンディション', cls: 'score-great' };
  if (points >= 8) return { label: '良いコンディション', cls: 'score-good' };
  if (points >= 6) return { label: 'まずまず', cls: 'score-fair' };
  return { label: '小波・微風待ち', cls: 'score-poor' };
}

function showStatus(message, isError = false) {
  const area = el('statusArea');
  area.textContent = message;
  area.classList.remove('hidden');
  area.classList.toggle('error', isError);
}

function hideStatus() {
  el('statusArea').classList.add('hidden');
}

function renderSpotChips(activeName) {
  const wrap = el('spotChips');
  wrap.innerHTML = '';
  SURF_SPOTS.forEach((spot) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'spot-chip' + (spot.name === activeName ? ' active' : '');
    btn.textContent = spot.name;
    btn.addEventListener('click', () => selectSpot(spot));
    wrap.appendChild(btn);
  });
}

async function geocode(query) {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=8&language=ja&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('地名検索に失敗しました');
  const data = await res.json();
  return data.results || [];
}

function renderSearchResults(results) {
  const box = el('searchResults');
  box.innerHTML = '';
  if (!results.length) {
    box.classList.add('hidden');
    return;
  }
  results.forEach((r) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-result-item';
    const admin = [r.admin1, r.country].filter(Boolean).join(' / ');
    btn.innerHTML = `${r.name}<div class="sub">${admin}</div>`;
    btn.addEventListener('click', () => {
      selectSpot({ name: r.name, lat: r.latitude, lon: r.longitude });
      box.classList.add('hidden');
      el('searchInput').value = '';
    });
    box.appendChild(btn);
  });
  box.classList.remove('hidden');
}

async function fetchForecast(lat, lon) {
  const marineParams = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: 'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_period,sea_surface_temperature',
    timezone: 'Asia/Tokyo',
    forecast_days: '3',
  });
  const weatherParams = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: 'wind_speed_10m,wind_direction_10m,temperature_2m,weathercode',
    wind_speed_unit: 'ms',
    timezone: 'Asia/Tokyo',
    forecast_days: '3',
  });

  const [marineRes, weatherRes] = await Promise.all([
    fetch(`${MARINE_URL}?${marineParams}`),
    fetch(`${WEATHER_URL}?${weatherParams}`),
  ]);

  if (!marineRes.ok || !weatherRes.ok) {
    throw new Error('この地点の海洋データが取得できませんでした。海に近い地点を選んでください。');
  }

  const marine = await marineRes.json();
  const weather = await weatherRes.json();

  const times = marine.hourly.time;
  const combined = times.map((t, i) => ({
    time: t,
    waveHeight: marine.hourly.wave_height[i],
    waveDirection: marine.hourly.wave_direction[i],
    wavePeriod: marine.hourly.wave_period[i],
    swellHeight: marine.hourly.swell_wave_height[i],
    swellPeriod: marine.hourly.swell_wave_period[i],
    seaTemp: marine.hourly.sea_surface_temperature[i],
    windSpeed: weather.hourly.wind_speed_10m[i],
    windDirection: weather.hourly.wind_direction_10m[i],
    airTemp: weather.hourly.temperature_2m[i],
    weatherCode: weather.hourly.weathercode[i],
  }));

  return combined;
}

function nearestIndexToNow(combined) {
  const now = new Date();
  let bestIdx = 0;
  let bestDiff = Infinity;
  combined.forEach((row, i) => {
    const diff = Math.abs(new Date(row.time) - now);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  });
  return bestIdx;
}

function renderCurrent(spotName, row) {
  el('spotName').textContent = spotName;
  const d = new Date(row.time);
  el('spotUpdated').textContent = `予報時刻: ${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`;

  const score = computeScore(row.waveHeight, row.wavePeriod, row.windSpeed);
  const badge = el('scoreBadge');
  badge.className = 'score-badge ' + score.cls;
  el('scoreLabel').textContent = score.label;

  const metrics = [
    { label: '波高', value: fmt(row.waveHeight), unit: 'm' },
    { label: '周期', value: fmt(row.wavePeriod), unit: '秒' },
    { label: 'うねり方向', value: degToDir(row.waveDirection), unit: '' },
    { label: '風速', value: fmt(row.windSpeed), unit: 'm/s' },
    { label: '風向', value: degToDir(row.windDirection), unit: '' },
    { label: '水温', value: fmt(row.seaTemp), unit: '℃' },
  ];

  const grid = el('currentMetrics');
  grid.innerHTML = metrics.map((m) => `
    <div class="metric">
      <div class="metric-label">${m.label}</div>
      <div class="metric-value">${m.value}<span class="metric-unit">${m.unit}</span></div>
    </div>
  `).join('');

  el('currentCard').classList.remove('hidden');
}

function renderHourly(combined, startIdx) {
  const slice = combined.slice(startIdx, startIdx + 12);
  const scroll = el('hourlyScroll');
  scroll.innerHTML = slice.map((row) => {
    const d = new Date(row.time);
    const icon = WEATHER_ICON[row.weatherCode] || '🌊';
    return `
      <div class="hour-card">
        <div class="hour-time">${d.getHours()}:00</div>
        <div class="hour-sub">${icon}</div>
        <div class="hour-wave">${fmt(row.waveHeight)}m</div>
        <div class="hour-sub">${fmt(row.windSpeed, 0)}m/s ${degToDir(row.windDirection)}</div>
      </div>
    `;
  }).join('');
  el('hourlySection').classList.remove('hidden');
}

function renderDaily(combined) {
  const byDate = {};
  combined.forEach((row) => {
    const dateKey = row.time.slice(0, 10);
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(row);
  });

  const grid = el('dailyGrid');
  grid.innerHTML = Object.keys(byDate).slice(0, 3).map((dateKey) => {
    const rows = byDate[dateKey];
    const maxWave = Math.max(...rows.map((r) => r.waveHeight ?? 0));
    const avgPeriod = rows.reduce((s, r) => s + (r.wavePeriod ?? 0), 0) / rows.length;
    const avgWind = rows.reduce((s, r) => s + (r.windSpeed ?? 0), 0) / rows.length;
    const d = new Date(dateKey + 'T00:00:00');
    const weekday = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    return `
      <div class="day-card">
        <div class="day-name">${d.getMonth() + 1}/${d.getDate()}（${weekday}）</div>
        <div class="day-row"><span>最大波高</span><strong>${fmt(maxWave)}m</strong></div>
        <div class="day-row"><span>平均周期</span><strong>${fmt(avgPeriod)}秒</strong></div>
        <div class="day-row"><span>平均風速</span><strong>${fmt(avgWind)}m/s</strong></div>
      </div>
    `;
  }).join('');
  el('dailySection').classList.remove('hidden');
}

async function selectSpot(spot) {
  renderSpotChips(spot.name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spot));
  showStatus(`${spot.name} の予報を取得しています…`);

  try {
    const combined = await fetchForecast(spot.lat, spot.lon);
    const idx = nearestIndexToNow(combined);
    hideStatus();
    renderCurrent(spot.name, combined[idx]);
    renderHourly(combined, idx);
    renderDaily(combined);
  } catch (err) {
    console.error(err);
    const message = err instanceof TypeError
      ? '通信エラーが発生しました。ネットワーク接続をご確認のうえ、再度お試しください。'
      : (err.message || '予報の取得中にエラーが発生しました。');
    showStatus(message, true);
    el('currentCard').classList.add('hidden');
    el('hourlySection').classList.add('hidden');
    el('dailySection').classList.add('hidden');
  }
}

function init() {
  renderSpotChips(null);

  el('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = el('searchInput').value.trim();
    if (!query) return;
    try {
      showStatus(`「${query}」を検索しています…`);
      const results = await geocode(query);
      hideStatus();
      renderSearchResults(results);
      if (!results.length) showStatus('該当する地名が見つかりませんでした。', true);
    } catch (err) {
      console.error(err);
      const message = err instanceof TypeError
        ? '通信エラーが発生しました。ネットワーク接続をご確認のうえ、再度お試しください。'
        : '地名検索でエラーが発生しました。';
      showStatus(message, true);
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-panel')) {
      el('searchResults').classList.add('hidden');
    }
  });

  let initialSpot = SURF_SPOTS[0];
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.lat && saved.lon) initialSpot = saved;
  } catch (_) { /* ignore malformed storage */ }

  selectSpot(initialSpot);
}

init();
