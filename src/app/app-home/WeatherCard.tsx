import { useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';

/**
 * WeatherCard.tsx
 * ─────────────────────────────────────────────
 * Today's weather under the categories on home, with one line of advice that
 * ties it back to medicines — the heat, the rain and the UV are what decide
 * how people should store and stock up on them here.
 *
 * Data is Open-Meteo (free, no key). It shows Metro Manila until the person
 * taps "Use my location"; the phone is never asked for its location on its
 * own, only from that tap. The chosen place and the last reading are kept on
 * the device, so home does not refetch on every visit. Like HealthArticles,
 * the card hides itself if the weather cannot be reached.
 *
 * Rain is shown as when, not as the day's peak chance: "Partly cloudy" next to
 * "Rain 100%" at 8 AM reads as a contradiction when the 100% is a 3 PM storm.
 * So the card looks at the hours still left today, names the first one where
 * rain is likely, and once those hours have passed it drops back to the chance
 * for the rest of the day.
 */

const BRAND = '#1D9FDA';

const MANILA = { lat: 14.5995, lon: 120.9842 };
const PLACE_KEY = 'getmeds_weather_place';
// v2: readings now carry the hourly rain forecast; older ones lack it.
const CACHE_KEY = 'getmeds_weather_cache_v2';
const CACHE_MS = 30 * 60 * 1000;
/** The chance from which an hour counts as "rain likely". */
const LIKELY = 50;

type Place = { lat: number; lon: number; mine: boolean };

type Reading = {
  temp: number;
  feels: number;
  humidity: number;
  code: number;
  isDay: boolean;
  max: number;
  min: number;
  uv: number;
  /** The place's offset from UTC, so "now" is its hour, not the phone's. */
  offset: number;
  /** Today's 24 hours: rain chance (%) and weather code, index = hour. */
  hourlyRain: number[];
  hourlyCode: number[];
};

type RainOutlook =
  /** A likely-rain hour is still ahead today; `hour` may be the current one. */
  | { kind: 'likely'; hour: number; now: boolean; stormHour: number | null }
  /** No likely hour left: the highest chance over the rest of today. */
  | { kind: 'chance'; pct: number };

/** Rain over the hours still left today, from the place's current hour. */
function rainOutlook(r: Reading): RainOutlook {
  const nowHour = new Date(Date.now() + r.offset * 1000).getUTCHours();
  for (let h = nowHour; h < r.hourlyRain.length; h++) {
    if (r.hourlyRain[h] >= LIKELY) {
      // A storm anywhere in the likely stretch, not just its first hour.
      let stormHour: number | null = null;
      for (let k = h; k < r.hourlyRain.length && r.hourlyRain[k] >= LIKELY; k++) {
        if (r.hourlyCode[k] >= 95) { stormHour = k; break; }
      }
      return { kind: 'likely', hour: h, now: h === nowHour, stormHour };
    }
  }
  const rest = r.hourlyRain.slice(nowHour);
  return { kind: 'chance', pct: rest.length ? Math.max(...rest) : 0 };
}

const clock = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

const readPlace = (): Place => {
  try {
    const raw = window.localStorage.getItem(PLACE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* no storage: fall back to Manila */ }
  return { ...MANILA, mine: false };
};

const savePlace = (p: Place) => {
  try { window.localStorage.setItem(PLACE_KEY, JSON.stringify(p)); } catch { /* not kept, still shown */ }
};

const readCache = (p: Place): Reading | null => {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (c.lat !== p.lat || c.lon !== p.lon || Date.now() - c.at > CACHE_MS) return null;
    return c.reading;
  } catch { return null; }
};

const saveCache = (p: Place, reading: Reading) => {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ lat: p.lat, lon: p.lon, at: Date.now(), reading }));
  } catch { /* not cached, refetched next time */ }
};

async function fetchWeather(p: Place): Promise<Reading> {
  const q = new URLSearchParams({
    latitude: String(p.lat),
    longitude: String(p.lon),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day',
    hourly: 'precipitation_probability,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min,uv_index_max',
    timezone: 'auto',
    forecast_days: '1',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  const d = await res.json();
  return {
    temp: d.current.temperature_2m,
    feels: d.current.apparent_temperature,
    humidity: d.current.relative_humidity_2m,
    code: d.current.weather_code,
    isDay: d.current.is_day === 1,
    max: d.daily.temperature_2m_max[0],
    min: d.daily.temperature_2m_min[0],
    uv: d.daily.uv_index_max[0] ?? 0,
    offset: d.utc_offset_seconds ?? 0,
    hourlyRain: (d.hourly.precipitation_probability as (number | null)[]).map((v) => v ?? 0),
    hourlyCode: (d.hourly.weather_code as (number | null)[]).map((v) => v ?? 0),
  };
}

/** WMO weather code → words and a Font Awesome icon. */
function describe(code: number, isDay: boolean): { en: string; tl: string; icon: string } {
  if (code === 0) return { en: 'Clear', tl: 'Maaliwalas', icon: isDay ? 'fa-sun' : 'fa-moon' };
  if (code <= 2) return { en: 'Partly cloudy', tl: 'Bahagyang maulap', icon: isDay ? 'fa-cloud-sun' : 'fa-cloud-moon' };
  if (code === 3) return { en: 'Cloudy', tl: 'Maulap', icon: 'fa-cloud' };
  if (code === 45 || code === 48) return { en: 'Foggy', tl: 'Mahamog', icon: 'fa-smog' };
  if (code >= 51 && code <= 57) return { en: 'Drizzle', tl: 'Ambon', icon: 'fa-cloud-rain' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { en: 'Rain', tl: 'Umuulan', icon: 'fa-cloud-showers-heavy' };
  if (code >= 95) return { en: 'Thunderstorm', tl: 'May bagyo at kidlat', icon: 'fa-cloud-bolt' };
  return { en: 'Cloudy', tl: 'Maulap', icon: 'fa-cloud' };
}

/** The one line of advice, most pressing first. */
function advice(r: Reading, rain: RainOutlook): { en: string; tl: string } {
  const nowHour = new Date(Date.now() + r.offset * 1000).getUTCHours();
  const around = (h: number) => h === nowHour
    ? { en: '', tl: '' }
    : { en: ` around ${clock(h)}`, tl: ` bandang ${clock(h)}` };
  const stormAt = r.code >= 95 ? nowHour : rain.kind === 'likely' ? rain.stormHour : null;
  if (stormAt !== null) {
    const when = around(stormAt);
    return {
      en: `Storms likely${when.en}. Keep at least a week of your maintenance medicines at home.`,
      tl: `Posibleng may bagyo${when.tl}. Mag-imbak ng hindi bababa sa isang linggong maintenance na gamot.`,
    };
  }
  if (rain.kind === 'likely') {
    const when = around(rain.hour);
    return {
      en: `Rain likely${when.en}. Request refills early so you are not caught short.`,
      tl: `Malamang umulan${when.tl}. Mag-request ng refill nang maaga para hindi maubusan.`,
    };
  }
  if (r.feels >= 38) return {
    en: 'Very hot. Drink water often, and keep medicines out of the sun and below 30°C.',
    tl: 'Napakainit. Uminom ng tubig nang madalas, at ilayo ang gamot sa araw at init.',
  };
  if (r.uv >= 8) return {
    en: 'High UV today. Some medicines make skin burn faster, so cover up outdoors.',
    tl: 'Mataas ang UV ngayon. May mga gamot na nagpapabilis masunog ang balat, kaya magtakip sa labas.',
  };
  return {
    en: 'Store medicines in a cool, dry place away from direct sunlight.',
    tl: 'Itago ang gamot sa malamig at tuyong lugar, malayo sa direktang sikat ng araw.',
  };
}

export function WeatherCard() {
  const { tr } = useLang();
  const [place, setPlace] = useState<Place>(readPlace);
  const [reading, setReading] = useState<Reading | null>(() => readCache(readPlace()));
  const [failed, setFailed] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState(false);

  useEffect(() => {
    const cached = readCache(place);
    if (cached) { setReading(cached); return; }
    let live = true;
    fetchWeather(place)
      .then((r) => { if (!live) return; setReading(r); setFailed(false); saveCache(place, r); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [place]);

  const useMyLocation = () => {
    if (!navigator.geolocation) { setLocError(true); return; }
    setLocating(true);
    setLocError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Rounded to ~1 km: plenty for weather, and less precise than a home address.
        const p = { lat: +pos.coords.latitude.toFixed(2), lon: +pos.coords.longitude.toFixed(2), mine: true };
        savePlace(p);
        setPlace(p);
        setLocating(false);
      },
      () => { setLocating(false); setLocError(true); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 30 * 60 * 1000 },
    );
  };

  if (failed && !reading) return null;

  if (!reading) {
    return <div className="mb-6 h-[132px] animate-pulse rounded-[20px] bg-white" />;
  }

  const sky = describe(reading.code, reading.isDay);
  const rain = rainOutlook(reading);
  const tip = advice(reading, rain);
  const rainLine =
    rain.kind === 'chance' ? tr(`Rain ${rain.pct}%`, `Ulan ${rain.pct}%`)
    : rain.now ? tr('Rain likely now', 'Malamang umulan')
    : tr(`Rain at ${clock(rain.hour)}`, `Ulan ${clock(rain.hour)}`);
  const placeName = place.mine ? tr('Your location', 'Lokasyon mo') : 'Metro Manila';

  return (
    <section className="mb-6 rounded-[20px] bg-white p-4" aria-label={tr('Weather today', 'Panahon ngayon')}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[12px] text-gray-500">
          <i className="fa-solid fa-location-dot text-[11px]" style={{ color: BRAND }} />
          {placeName}
        </p>
        {!place.mine && (
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="text-[12px] font-semibold disabled:opacity-60"
            style={{ color: BRAND }}
          >
            {locating ? tr('Locating…', 'Hinahanap…') : tr('Use my location', 'Gamitin ang lokasyon ko')}
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <i className={`fa-solid ${sky.icon} text-[38px]`} style={{ color: reading.isDay && sky.icon === 'fa-sun' ? '#F5A524' : BRAND }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[28px] font-semibold leading-none text-gray-900">{Math.round(reading.temp)}°C</p>
          <p className="mt-1 text-[12.5px] leading-snug text-gray-600">{tr(sky.en, sky.tl)}</p>
          <p className="text-[12px] leading-snug text-gray-500">{tr(`Feels like ${Math.round(reading.feels)}°`, `Pakiramdam ${Math.round(reading.feels)}°`)}</p>
        </div>
        {/* Under 360px wide (Galaxy Fold, iPhone SE 1st gen) this column would crush
            the middle one, so it becomes its own row under it. */}
        <div className="shrink-0 text-right text-[11.5px] leading-relaxed text-gray-500 max-[359px]:flex max-[359px]:basis-full max-[359px]:flex-wrap max-[359px]:gap-x-3 max-[359px]:text-left">
          <p>H {Math.round(reading.max)}° · L {Math.round(reading.min)}°</p>
          <p><i className="fa-solid fa-droplet mr-1 text-[10px]" />{rainLine}</p>
          <p>UV {Math.round(reading.uv)}</p>
        </div>
      </div>

      <p className="mt-3 rounded-[12px] px-3 py-2 text-[12px] leading-snug text-gray-700" style={{ background: '#EEF6FB' }}>
        <i className="fa-solid fa-pills mr-1.5 text-[11px]" style={{ color: BRAND }} />
        {tr(tip.en, tip.tl)}
      </p>

      {locError && (
        <p className="mt-2 text-[11px] text-gray-400">
          {tr('Could not get your location, so this is Metro Manila.', 'Hindi makuha ang lokasyon mo, kaya Metro Manila ito.')}
        </p>
      )}
    </section>
  );
}
