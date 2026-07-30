// Live weather + short forecast for map popups (camps/lodges, fire hotspots).
// Uses Open-Meteo — free, no API key required, generous rate limits.
// https://open-meteo.com/en/docs

const WEATHER_CODES = {
  0: ['Clear sky', '☀️'],
  1: ['Mainly clear', '🌤️'],
  2: ['Partly cloudy', '⛅'],
  3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'],
  48: ['Rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'],
  53: ['Drizzle', '🌦️'],
  55: ['Dense drizzle', '🌧️'],
  56: ['Freezing drizzle', '🌧️'],
  57: ['Freezing drizzle', '🌧️'],
  61: ['Slight rain', '🌦️'],
  63: ['Rain', '🌧️'],
  65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'],
  67: ['Freezing rain', '🌧️'],
  71: ['Slight snow', '🌨️'],
  73: ['Snow', '🌨️'],
  75: ['Heavy snow', '❄️'],
  77: ['Snow grains', '❄️'],
  80: ['Rain showers', '🌦️'],
  81: ['Rain showers', '🌧️'],
  82: ['Violent showers', '⛈️'],
  85: ['Snow showers', '🌨️'],
  86: ['Snow showers', '🌨️'],
  95: ['Thunderstorm', '⛈️'],
  96: ['Thunderstorm, hail', '⛈️'],
  99: ['Thunderstorm, hail', '⛈️'],
};

export function describeWeatherCode(code) {
  return WEATHER_CODES[code] || ['—', '❓'];
}

export async function fetchWeather(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max` +
    `&timezone=auto&forecast_days=5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
  return res.json();
}

function weatherPopupHtml(data) {
  const cur = data.current || {};
  const [curLabel, curEmoji] = describeWeatherCode(cur.weather_code);
  const daily = data.daily || {};
  const days = (daily.time || [])
    .slice(0, 5)
    .map((date, i) => {
      const [, emoji] = describeWeatherCode(daily.weather_code?.[i]);
      const max = Math.round(daily.temperature_2m_max?.[i]);
      const min = Math.round(daily.temperature_2m_min?.[i]);
      const dayName = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
      return `<div style="display:flex;justify-content:space-between;gap:10px;font-size:11px;padding:1px 0;">
        <span>${dayName}</span><span>${emoji}</span><span>${max}° / ${min}°</span>
      </div>`;
    })
    .join('');

  return `
    <div style="margin-top:6px;padding-top:6px;border-top:1px solid #e5e7eb;min-width:150px;">
      <div style="font-size:12px;font-weight:600;">${curEmoji} ${Math.round(cur.temperature_2m)}°C — ${curLabel}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px;">Wind ${Math.round(cur.wind_speed_10m || 0)} km/h · Humidity ${
    cur.relative_humidity_2m ?? '—'
  }%</div>
      <div style="margin-top:4px;">${days}</div>
    </div>
  `;
}

/**
 * Lazily loads + renders a weather forecast inside a Leaflet layer's popup the
 * first time it's opened (so we don't hit the API for markers nobody clicks).
 */
export function attachWeatherPopup(layer, lat, lon, baseHtml) {
  let loaded = false;
  layer.on('popupopen', async () => {
    if (loaded) return;
    const popup = layer.getPopup();
    if (!popup) return;
    popup.setContent(`${baseHtml}<div style="margin-top:6px;font-size:11px;color:#6b7280;">Loading weather…</div>`);
    try {
      const data = await fetchWeather(lat, lon);
      loaded = true;
      popup.setContent(`${baseHtml}${weatherPopupHtml(data)}`);
    } catch (e) {
      popup.setContent(`${baseHtml}<div style="margin-top:6px;font-size:11px;color:#b42318;">Weather unavailable</div>`);
    }
  });
}
