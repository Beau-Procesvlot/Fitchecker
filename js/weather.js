// Weer ophalen via Open-Meteo (gratis, geen account) en omzetten naar wat de outfit nodig heeft.

const Weather = (() => {
  let forecast = null;   // { fetchedAt, lat, lon, hours: [{ time, temp, feels, rain, wind }] }

  // Locatie van de telefoon, afgerond op 2 decimalen (ongeveer 1 km).
  function askLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Deze browser kan geen locatie delen.'));
      navigator.geolocation.getCurrentPosition(
        pos => resolve({
          lat: Math.round(pos.coords.latitude * 100) / 100,
          lon: Math.round(pos.coords.longitude * 100) / 100,
          at: Date.now(),
        }),
        err => reject(new Error(err.code === 1 ? 'Je hebt locatie niet toegestaan.' : 'Locatie niet gevonden.')),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 6 * 3600 * 1000 },
      );
    });
  }

  async function location() {
    const saved = await DB.getMeta('location');
    // Ververs op de achtergrond als de locatie ouder is dan 6 uur.
    if (saved && Date.now() - saved.at < 6 * 3600 * 1000) return saved;
    try {
      const fresh = await askLocation();
      await DB.setMeta('location', fresh);
      return fresh;
    } catch (err) {
      if (saved) return saved;
      throw err;
    }
  }

  async function load() {
    const loc = await location();
    if (forecast && forecast.lat === loc.lat && forecast.lon === loc.lon && Date.now() - forecast.fetchedAt < 3600 * 1000) return forecast;
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${loc.lat}&longitude=${loc.lon}`
      + '&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m'
      + '&timezone=auto&forecast_days=3';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Weer kon niet worden opgehaald.');
    const data = await res.json();
    const h = data.hourly;
    forecast = {
      fetchedAt: Date.now(), lat: loc.lat, lon: loc.lon,
      hours: h.time.map((time, i) => ({
        time, temp: h.temperature_2m[i], feels: h.apparent_temperature[i],
        rain: h.precipitation_probability[i] ?? 0, wind: h.wind_speed_10m[i],
      })),
    };
    return forecast;
  }

  // Lokale datum als "2026-10-04" (Open-Meteo geeft tijden in de lokale tijdzone).
  function dateStr(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Weer over een tijdvenster. Loopt het venster over middernacht (22:00–03:00), dan telt de volgende dag mee.
  async function forWindow(dayOffset, from, to) {
    const fc = await load();
    const start = `${dateStr(dayOffset)}T${from}`;
    const end = to > from ? `${dateStr(dayOffset)}T${to}` : `${dateStr(dayOffset + 1)}T${to}`;
    const startHour = start.slice(0, 14) + '00';
    const hours = fc.hours.filter(h => h.time >= startHour && h.time <= end);
    if (!hours.length) throw new Error('Geen weerbericht voor dat moment.');
    return {
      minFeels: Math.min(...hours.map(h => h.feels)),
      minTemp: Math.min(...hours.map(h => h.temp)),
      maxTemp: Math.max(...hours.map(h => h.temp)),
      rain: Math.max(...hours.map(h => h.rain)),
      wind: Math.max(...hours.map(h => h.wind)),
    };
  }

  // Van graden naar warm / mild / koud, met de koukleum-instelling en het vervoer erbij.
  // koukleum: -2 (snel warm) … +2 (snel koud). Wie het snel koud heeft, vindt 12° al koud.
  function classify(w, { koukleum = 0, transport = 'fiets' } = {}) {
    let feels = w.minFeels;
    if (transport === 'fiets') feels -= 2;      // rijwind
    if (transport === 'auto') feels += 3;       // je staat weinig buiten
    const shift = koukleum * 1.5;
    const level = feels < 10 + shift ? 'koud' : feels > 18 + shift ? 'warm' : 'mild';
    const outside = transport !== 'auto';
    return {
      level,
      rain: outside && w.rain >= 50,
      windy: outside && w.wind >= 30,
    };
  }

  function describe(w) {
    const parts = [`${Math.round(w.minTemp)}°`];
    if (Math.round(w.minFeels) < Math.round(w.minTemp)) parts[0] += `, voelt als ${Math.round(w.minFeels)}°`;
    if (w.rain >= 20) parts.push(`${w.rain}% regen`);
    if (w.wind >= 30) parts.push('veel wind');
    return parts.join(' · ');
  }

  return { askLocation, forWindow, classify, describe };
})();
