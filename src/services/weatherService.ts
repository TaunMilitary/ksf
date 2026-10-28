import { WeatherForecast } from "../types";

const weatherCache = new Map<string, WeatherForecast>();

/**
 * WMO Weather interpretation codes (Open-Meteo) -> Türkçe durum ve ikon tipi
 */
function mapWmoCodeToCondition(code: number): {
  condition: WeatherForecast["condition"];
  label: string;
} {
  if (code === 0 || code === 1) {
    return { condition: "sunny", label: "Güneşli / Açık" };
  }
  if (code === 2) {
    return { condition: "partly_cloudy", label: "Parçalı Bulutlu" };
  }
  if (code === 3 || code === 45 || code === 48) {
    return { condition: "cloudy", label: "Çok Bulutlu" };
  }
  if (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82)
  ) {
    return { condition: "rainy", label: "Yağmurlu" };
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return { condition: "snowy", label: "Karlı / Karla Karışık" };
  }
  if (code >= 95) {
    return { condition: "stormy", label: "Sağanak / Fırtınalı" };
  }
  return { condition: "partly_cloudy", label: "Parçalı Bulutlu" };
}

/**
 * 16 günü aşan ileri tarihler için Ordu / Fatsa iklim normallerine ve rakıma göre gerçekçi tahmin
 */
function getFatsaSeasonalEstimate(
  lat: number,
  lng: number,
  dateStr: string
): WeatherForecast {
  const parts = dateStr.split("-").map(Number);
  const month = parts[1] || 5;
  const day = parts[2] || 15;

  // İç kesim yüksek mahallelerde (İslamdağ, Aslancami, Geyikçeli) sıcaklık sahile göre ~2-3 derece düşüktür
  const isInlandHigh = lat < 40.97;
  const elevOffset = isInlandHigh ? -2 : 0;

  const monthlyAvgMax = [11, 12, 14, 17, 21, 25, 28, 28, 25, 20, 16, 13];
  const monthlyAvgMin = [4, 4, 6, 9, 13, 17, 20, 20, 17, 13, 8, 6];

  const baseMax = (monthlyAvgMax[month - 1] ?? 19) + elevOffset;
  const baseMin = (monthlyAvgMin[month - 1] ?? 11) + elevOffset;

  // Deterministik varyasyon (aynı tarih ve koordinat her zaman aynı tahmini verir)
  const seed = Math.abs(Math.round(lat * 1000 + lng * 1000 + day * 17 + month * 31));
  const mod = seed % 10;

  let condition: WeatherForecast["condition"] = "partly_cloudy";
  let label = "Parçalı Bulutlu";
  let precipitationProb = 20;

  if (mod <= 3) {
    condition = "sunny";
    label = "Güneşli";
    precipitationProb = 10;
  } else if (mod <= 6) {
    condition = "partly_cloudy";
    label = "Parçalı Bulutlu";
    precipitationProb = 25;
  } else if (mod <= 8) {
    condition = "rainy";
    label = "Yağmurlu";
    precipitationProb = 70;
  } else {
    condition = "cloudy";
    label = "Çok Bulutlu";
    precipitationProb = 40;
  }

  return {
    condition,
    label,
    tempMax: baseMax + ((seed % 3) - 1),
    tempMin: baseMin + ((seed % 2) - 1),
    precipitationProb,
    source: "seasonal_norm",
  };
}

/**
 * Ücretsiz Open-Meteo API kullanarak seçilen tarih ve Fatsa mahalle koordinatı için
 * hava durumu tahminini getirir (API anahtarı gerektirmez).
 */
export async function fetchWeatherForInspection(
  lat: number,
  lng: number,
  dateStr: string
): Promise<WeatherForecast> {
  if (!dateStr || !lat || !lng) {
    return getFatsaSeasonalEstimate(41.0287, 37.5008, "2026-10-27");
  }

  const cacheKey = `${lat.toFixed(3)}_${lng.toFixed(3)}_${dateStr}`;
  const cached = weatherCache.get(cacheKey);
  if (cached) return cached;

  // Check if dateStr is within Open-Meteo's forecast range (-5 days to +15 days from today)
  const now = new Date();
  const target = new Date(`${dateStr}T12:00:00`);
  const diffDays = (target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays < -5 || diffDays > 15) {
    const fallback = getFatsaSeasonalEstimate(lat, lng, dateStr);
    weatherCache.set(cacheKey, fallback);
    return fallback;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(
      4
    )}&longitude=${lng.toFixed(
      4
    )}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FIstanbul&start_date=${dateStr}&end_date=${dateStr}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}`);
    }

    const data = await res.json();
    if (
      data?.daily &&
      Array.isArray(data.daily.weathercode) &&
      data.daily.weathercode.length > 0
    ) {
      const code = Number(data.daily.weathercode[0] ?? 2);
      const tMax = Math.round(Number(data.daily.temperature_2m_max?.[0] ?? 18));
      const tMin = Math.round(Number(data.daily.temperature_2m_min?.[0] ?? 11));
      const precip = Math.round(
        Number(data.daily.precipitation_probability_max?.[0] ?? 20)
      );
      const mapped = mapWmoCodeToCondition(code);

      const forecast: WeatherForecast = {
        condition: mapped.condition,
        label: mapped.label,
        tempMax: tMax,
        tempMin: tMin,
        precipitationProb: precip,
        source: "open_meteo",
      };

      weatherCache.set(cacheKey, forecast);
      return forecast;
    }
    throw new Error("Veri boş");
  } catch {
    const fallback = getFatsaSeasonalEstimate(lat, lng, dateStr);
    weatherCache.set(cacheKey, fallback);
    return fallback;
  }
}
