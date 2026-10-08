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
    // Zelf gekozen stad gaat voor de locatie van de telefoon.
    if (state.profile.city) return state.profile.city;
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
    const res = await fetch(url).catch(() => { throw new Error('Geen internet, dus geen weerbericht.'); });
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

  // Weer over het logische moment van een situatie (overdag voor werk, 's avonds voor een feest).
  // Loopt het over middernacht (22:00–03:00), dan telt de volgende dag mee.
  // Voor vandaag tellen uren die al voorbij zijn niet mee; is het moment helemaal voorbij,
  // dan kijkt de app naar de komende 6 uur.
  async function forWindow(dayOffset, from, to) {
    const fc = await load();
    const start = `${dateStr(dayOffset)}T${from}`;
    let end = to > from ? `${dateStr(dayOffset)}T${to}` : `${dateStr(dayOffset + 1)}T${to}`;
    let startHour = start.slice(0, 14) + '00';
    const now = new Date();
    const hourStr = d => `${dateStr(Math.round((new Date(d.toDateString()) - new Date(now.toDateString())) / 86400000))}T${String(d.getHours()).padStart(2, '0')}:00`;
    const nowHour = hourStr(now);
    if (dayOffset === 0 && nowHour > startHour) startHour = nowHour;
    if (dayOffset === 0 && end < nowHour) end = hourStr(new Date(now.getTime() + 6 * 3600 * 1000));
    const hours = fc.hours.filter(h => h.time >= startHour && h.time <= end);
    if (!hours.length) throw new Error('Geen weerbericht voor dat moment.');
    const avg = list => list.reduce((s, v) => s + v, 0) / list.length;
    return {
      avgFeels: avg(hours.map(h => h.feels)),
      avgTemp: avg(hours.map(h => h.temp)),
      minFeels: Math.min(...hours.map(h => h.feels)),
      minTemp: Math.min(...hours.map(h => h.temp)),
      maxTemp: Math.max(...hours.map(h => h.temp)),
      rain: Math.max(...hours.map(h => h.rain)),
      wind: Math.max(...hours.map(h => h.wind)),
    };
  }

  // Van graden naar warm / mild / koud, met de koukleum-instelling en het vervoer erbij.
  // koukleum: -2 (snel warm) … +2 (snel koud). Wie het snel koud heeft, vindt 12° al koud.
  // De outfit kijkt naar het gemiddelde over de uren dat je weg bent (anders kleed je je een
  // hele dag aan op het koudste kwartier); het jas-advies kijkt naar het koudste moment.
  function classify(w, { koukleum = 0, transport = 'fiets' } = {}) {
    const adjust = t => t + (transport === 'fiets' ? -2 : transport === 'auto' ? 3 : 0); // rijwind / weinig buiten
    const shift = koukleum * 1.5;
    const levelOf = t => t < 10 + shift ? 'koud' : t > 18 + shift ? 'warm' : 'mild';
    const outside = transport !== 'auto';
    return {
      level: levelOf(adjust(w.avgFeels ?? w.minFeels)),
      coatLevel: levelOf(adjust(w.minFeels)),
      rain: outside && w.rain >= 50,
      windy: outside && w.wind >= 30,
    };
  }

  // Gemiddelde temperatuur; loopt het flink uiteen, dan ook van-tot ("13°, 8–17°").
  function describe(w) {
    const avgT = Math.round(w.avgTemp ?? w.minTemp), avgF = Math.round(w.avgFeels ?? w.minFeels);
    const parts = [`${avgT}°`];
    if (avgF < avgT) parts[0] += `, voelt als ${avgF}°`;
    if (Math.round(w.maxTemp) - Math.round(w.minTemp) >= 4) parts.push(`${Math.round(w.minTemp)}–${Math.round(w.maxTemp)}°`);
    if (w.rain >= 20) parts.push(`${w.rain}% regen`);
    if (w.wind >= 30) parts.push('veel wind');
    return parts.join(' · ');
  }

  // Steden zoeken via de geocoding van Open-Meteo (dezelfde dienst als het weer).
  async function searchCity(name) {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=6&language=nl&format=json`)
      .catch(() => { throw new Error('Geen internet. Probeer het later nog eens.'); });
    if (!res.ok) throw new Error('Zoeken lukte niet.');
    const data = await res.json();
    return (data.results || []).map(r => ({
      name: r.name, area: [r.admin1, r.country].filter(Boolean).join(', '),
      lat: Math.round(r.latitude * 100) / 100, lon: Math.round(r.longitude * 100) / 100,
    }));
  }

  // De temperatuur nu, op de locatie die de app gebruikt: om te controleren of het klopt.
  async function now() {
    const loc = await location();
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m&timezone=auto`);
    if (!res.ok) throw new Error('Weer kon niet worden opgehaald.');
    const data = await res.json();
    return { loc, temp: Math.round(data.current.temperature_2m) };
  }

  function forget() { forecast = null; }

  return { askLocation, forWindow, classify, describe, searchCity, now, forget };
})();
