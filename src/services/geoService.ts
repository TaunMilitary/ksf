import { FATSA_COURTHOUSE, FATSA_NEIGHBORHOODS } from "../data/fatsaData";
import {
  normalizeMahalleKey,
  resolveCandidateTkgmMahalles,
  resolveTkgmMahalle,
  TKGM_MAHALLE_LIST,
} from "../data/tkgmMahalleData";
import {
  CourtDistrict,
  FatsaNeighborhood,
  InspectionRecord,
  ParcelItem,
  SmartSuggestion,
  UserProfileConfig,
  VehicleInspectionInfo,
} from "../types";

/**
 * Haversine formülü ile iki koordinat arası kuş uçuşu mesafe (km)
 */
export function calculateHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Dünya yarıçapı (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

/**
 * Verilen koordinata en yakın yerel mahalleyi ve ilçe bilgisini bulur
 */
export function findNearestLocalNeighborhood(
  lat: number,
  lng: number,
  targetDistrict?: CourtDistrict | "Tümü"
): {
  neighborhood: FatsaNeighborhood;
  distanceKm: number;
} {
  const pool =
    targetDistrict && targetDistrict !== "Tümü"
      ? FATSA_NEIGHBORHOODS.filter((n) => n.district === targetDistrict)
      : FATSA_NEIGHBORHOODS;

  const validPool = pool.length > 0 ? pool : FATSA_NEIGHBORHOODS;
  let closest = validPool[0];
  let minDistance = Infinity;

  for (const item of validPool) {
    const dist = calculateHaversineKm(lat, lng, item.lat, item.lng);
    if (dist < minDistance) {
      minDistance = dist;
      closest = item;
    }
  }

  return { neighborhood: closest, distanceKm: minDistance };
}

/**
 * OSRM API ile Fatsa Adliyesi'nden seçilen noktaya (veya çoklu durağa) gerçek karayolu mesafesi,
 * sürüş süresi ve polyline rota geometrisini hesaplar.
 */
export async function calculateOSRMRoute(
  points: { lat: number; lng: number }[]
): Promise<{
  distanceKm: number;
  durationMin: number;
  geometry: [number, number][];
  isFallback: boolean;
}> {
  if (points.length < 2) {
    return { distanceKm: 0, durationMin: 0, geometry: [], isFallback: false };
  }

  const coordsParam = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`OSRM HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.code === "Ok" && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const distanceKm = Number((route.distance / 1000).toFixed(1));
      const durationMin = Math.max(2, Math.round(route.duration / 60));
      const geometry: [number, number][] = route.geometry.coordinates.map(
        (coord: [number, number]) => [coord[1], coord[0]]
      );
      return {
        distanceKm,
        durationMin,
        geometry,
        isFallback: false,
      };
    }
    throw new Error("OSRM rota bulunamadı");
  } catch {
    let totalAirKm = 0;
    const geometry: [number, number][] = [];
    for (let i = 0; i < points.length; i++) {
      geometry.push([points[i].lat, points[i].lng]);
      if (i > 0) {
        totalAirKm += calculateHaversineKm(
          points[i - 1].lat,
          points[i - 1].lng,
          points[i].lat,
          points[i].lng
        );
      }
    }
    const roadKm = Number((totalAirKm * 1.38).toFixed(1));
    const durationMin = Math.max(3, Math.round((roadKm / 40) * 60));
    return {
      distanceKm: roadKm,
      durationMin,
      geometry,
      isFallback: true,
    };
  }
}

export interface NominatimSearchResult {
  name: string;
  district: CourtDistrict;
  displayName: string;
  lat: number;
  lng: number;
  corridor: string;
  tkgmMahalleId?: number;
  source: "local" | "tkgm" | "nominatim";
}

/**
 * Yerel Mahalle Veri Tabanı + 148 Resmi TKGM Mahalle Listesi + Nominatim API ile arama
 */
export async function searchFatsaLocations(
  query: string,
  selectedDistrict: CourtDistrict | "Tümü" = "Tümü"
): Promise<NominatimSearchResult[]> {
  const trimmed = query.trim();
  const normalizedQuery = trimmed.toLocaleLowerCase("tr-TR");
  const normalizedKey = normalizeMahalleKey(trimmed);

  // 1. Önce yerel mahalle veri tabanında eşleşenleri bul
  const filteredLocal = FATSA_NEIGHBORHOODS.filter((n) => {
    if (selectedDistrict !== "Tümü" && n.district !== selectedDistrict) {
      return false;
    }
    if (!trimmed) return true;
    return (
      n.name.toLocaleLowerCase("tr-TR").includes(normalizedQuery) ||
      normalizeMahalleKey(n.name).includes(normalizedKey) ||
      n.corridor.toLocaleLowerCase("tr-TR").includes(normalizedQuery) ||
      n.district.toLocaleLowerCase("tr-TR").includes(normalizedQuery)
    );
  });

  const localMatches: NominatimSearchResult[] = filteredLocal
    .slice(0, 8)
    .map((n) => {
      const tkgm = resolveTkgmMahalle(n.district, n.name);
      return {
        name: n.name,
        district: n.district,
        displayName: `${n.name}, ${n.district}, Ordu (${n.corridor})`,
        lat: n.lat,
        lng: n.lng,
        corridor: n.corridor,
        tkgmMahalleId: tkgm?.id,
        source: "local",
      };
    });

  // 2. 148 Resmi TKGM mahallesinden eşleşenleri ekle
  if (normalizedKey.length >= 1) {
    const tkgmPool = TKGM_MAHALLE_LIST.filter((m) => {
      if (selectedDistrict !== "Tümü" && m.district !== selectedDistrict) {
        return false;
      }
      return (
        m.text.toLocaleLowerCase("tr-TR").includes(normalizedQuery) ||
        normalizeMahalleKey(m.text).includes(normalizedKey)
      );
    });

    for (const tm of tkgmPool) {
      const cleanName = `${tm.text} Mahallesi`;
      const alreadyInLocal = localMatches.some(
        (lm) =>
          lm.tkgmMahalleId === tm.id ||
          normalizeMahalleKey(lm.name) === normalizeMahalleKey(tm.text)
      );
      if (!alreadyInLocal) {
        const districtFallback = FATSA_NEIGHBORHOODS.find(
          (n) => n.district === tm.district
        );
        localMatches.push({
          name: cleanName,
          district: tm.district,
          displayName: `${cleanName}, ${tm.district} (TKGM Kadastro ID: ${tm.id})`,
          lat: districtFallback ? districtFallback.lat : 41.0287,
          lng: districtFallback ? districtFallback.lng : 37.5008,
          corridor: `${tm.district} Kadastro Bölgesi`,
          tkgmMahalleId: tm.id,
          source: "tkgm",
        });
      }
    }
  }

  if (trimmed.length < 2 || localMatches.length >= 8) {
    return localMatches.slice(0, 10);
  }

  // 3. Nominatim API üzerinden Ordu sınırlarında arama yap
  try {
    const districtFilterName =
      selectedDistrict && selectedDistrict !== "Tümü"
        ? selectedDistrict
        : "Fatsa";
    const searchQ = `${trimmed}, ${districtFilterName}, Ordu, Türkiye`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      searchQ
    )}&addressdetails=1&limit=4&countrycodes=tr`;

    const res = await fetch(url, {
      headers: {
        "Accept-Language": "tr",
      },
    });

    if (!res.ok) {
      return localMatches.slice(0, 10);
    }

    const items = await res.json();
    const nominatimResults: NominatimSearchResult[] = [];

    for (const item of items) {
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);
      if (isNaN(lat) || isNaN(lng)) continue;

      const rawName =
        item.address?.suburb ||
        item.address?.village ||
        item.address?.neighbourhood ||
        item.address?.town ||
        item.name ||
        item.display_name.split(",")[0];

      const cleanName = rawName.includes("Mahalle")
        ? rawName
        : `${rawName} Mahallesi`;

      const nearest = findNearestLocalNeighborhood(lat, lng, selectedDistrict);
      const inferredDistrict: CourtDistrict =
        selectedDistrict !== "Tümü"
          ? selectedDistrict
          : nearest.neighborhood.district;

      const alreadyExists = localMatches.some(
        (m) =>
          normalizeMahalleKey(m.name) === normalizeMahalleKey(cleanName) ||
          calculateHaversineKm(m.lat, m.lng, lat, lng) < 0.5
      );

      if (!alreadyExists) {
        const tkgm = resolveTkgmMahalle(inferredDistrict, cleanName);
        nominatimResults.push({
          name: cleanName,
          district: inferredDistrict,
          displayName: `${cleanName}, ${inferredDistrict}, Ordu`,
          lat,
          lng,
          corridor: nearest.neighborhood.corridor,
          tkgmMahalleId: tkgm?.id,
          source: "nominatim",
        });
      }
    }

    return [...localMatches, ...nominatimResults].slice(0, 10);
  } catch {
    return localMatches.slice(0, 10);
  }
}

/**
 * Harita üzerinden tıklanan noktanın mahalle, ilçe ve varsa cadde/sokak/bina adını bulur
 */
export async function reverseGeocodeFatsaPoint(
  lat: number,
  lng: number,
  preferredDistrict?: CourtDistrict
): Promise<{
  name: string;
  district: CourtDistrict;
  corridor: string;
  roadOrAddress?: string;
}> {
  const nearestLocal = findNearestLocalNeighborhood(
    lat,
    lng,
    preferredDistrict || "Tümü"
  );

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { "Accept-Language": "tr" },
    });
    if (res.ok) {
      const data = await res.json();
      const raw =
        data.address?.suburb ||
        data.address?.village ||
        data.address?.neighbourhood ||
        data.address?.hamlet ||
        data.name;

      const roadPart =
        data.address?.road ||
        data.address?.pedestrian ||
        data.address?.residential ||
        data.address?.Commercial ||
        "";
      const buildingPart =
        data.address?.building ||
        data.address?.apartments ||
        data.address?.shop ||
        data.address?.amenity ||
        "";
      const houseNo = data.address?.house_number
        ? `No: ${data.address.house_number}`
        : "";
      const roadOrAddress = [roadPart, buildingPart, houseNo]
        .filter(Boolean)
        .join(" ")
        .trim();

      let detectedDistrict: CourtDistrict = nearestLocal.neighborhood.district;
      const addrCounty = (
        data.address?.county ||
        data.address?.town ||
        ""
      ).toLocaleLowerCase("tr-TR");
      if (addrCounty.includes("çamaş")) {
        detectedDistrict = "Çamaş";
      } else if (addrCounty.includes("çatalpınar")) {
        detectedDistrict = "Çatalpınar";
      } else if (addrCounty.includes("fatsa")) {
        detectedDistrict = "Fatsa";
      }

      if (raw) {
        const formattedName =
          raw.toLocaleLowerCase("tr-TR").includes("mahalle") ||
          raw.toLocaleLowerCase("tr-TR").includes("köy")
            ? raw
            : `${raw} Mahallesi`;
        return {
          name:
            nearestLocal.distanceKm <= 0.8
              ? nearestLocal.neighborhood.name
              : formattedName,
          district: detectedDistrict,
          corridor: nearestLocal.neighborhood.corridor,
          roadOrAddress: roadOrAddress || undefined,
        };
      }

      if (roadOrAddress) {
        return {
          name: nearestLocal.neighborhood.name,
          district: detectedDistrict,
          corridor: nearestLocal.neighborhood.corridor,
          roadOrAddress,
        };
      }
    }
  } catch {
    // Fallback to nearest local neighborhood below
  }

  return {
    name:
      nearestLocal.distanceKm <= 1.2
        ? nearestLocal.neighborhood.name
        : `${nearestLocal.neighborhood.name} Mevkii`,
    district: nearestLocal.neighborhood.district,
    corridor: nearestLocal.neighborhood.corridor,
  };
}

/**
 * Adres bazlı keşiflerde yazılan Cadde / Sokak / Bina / Açık Adresi Nominatim üzerinden sorgular
 * ve harita üzerinde nokta koordinatını (bulunamazsa mahalle merkezini) döndürür.
 */
export async function geocodeStreetAddressInDistrict(
  addressText: string,
  neighborhood: string,
  district: CourtDistrict
): Promise<{
  lat: number;
  lng: number;
  matchedNeighborhood: string;
  district: CourtDistrict;
  displayLabel: string;
  foundExactStreet: boolean;
}> {
  const cleanAddr = addressText.trim();
  const cleanNeigh = neighborhood.trim();
  const cleanNeighShort = cleanNeigh.replace(/\s+Mahallesi$/i, "").trim();

  if (cleanAddr.length >= 2) {
    const queries = [
      `${cleanAddr}, ${cleanNeighShort}, ${district}, Ordu, Türkiye`,
      `${cleanAddr}, ${district}, Ordu, Türkiye`,
    ];

    for (const q of queries) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          q
        )}&addressdetails=1&limit=3&countrycodes=tr`;
        const res = await fetch(url, {
          headers: { "Accept-Language": "tr" },
        });
        if (res.ok) {
          const items = await res.json();
          if (Array.isArray(items) && items.length > 0) {
            const first = items[0];
            const lat = parseFloat(first.lat);
            const lng = parseFloat(first.lon);
            if (!isNaN(lat) && !isNaN(lng)) {
              const nearest = findNearestLocalNeighborhood(lat, lng, district);
              // Sadece bölge sınırları içindeyse (Adliye'ye < 45 km) kabul et
              if (
                calculateHaversineKm(
                  FATSA_COURTHOUSE.lat,
                  FATSA_COURTHOUSE.lng,
                  lat,
                  lng
                ) <= 45
              ) {
                const subName =
                  first.address?.suburb ||
                  first.address?.neighbourhood ||
                  first.address?.village ||
                  "";
                const resolvedNeigh = subName
                  ? subName.toLocaleLowerCase("tr-TR").includes("mahalle")
                    ? subName
                    : `${subName} Mahallesi`
                  : cleanNeigh || nearest.neighborhood.name;
                return {
                  lat: Number(lat.toFixed(6)),
                  lng: Number(lng.toFixed(6)),
                  matchedNeighborhood: resolvedNeigh,
                  district: nearest.neighborhood.district || district,
                  displayLabel:
                    first.display_name?.split(",").slice(0, 3).join(", ") ||
                    cleanAddr,
                  foundExactStreet: true,
                };
              }
            }
          }
        }
      } catch {
        // continue to next query or local fallback
      }
    }
  }

  // Sokak Nominatim'de bulunamazsa seçili mahallenin koordinatını döndür
  const fallbackNeigh = resolveNeighborhoodCoordinates(cleanNeigh, district);
  if (fallbackNeigh) {
    return {
      lat: fallbackNeigh.lat,
      lng: fallbackNeigh.lng,
      matchedNeighborhood: fallbackNeigh.matchedName,
      district: fallbackNeigh.district,
      displayLabel: `${fallbackNeigh.matchedName} (${cleanAddr || "Mahalle Merkezi"})`,
      foundExactStreet: false,
    };
  }

  const firstInDist =
    FATSA_NEIGHBORHOODS.find((n) => n.district === district) ||
    FATSA_NEIGHBORHOODS[0];
  return {
    lat: firstInDist.lat,
    lng: firstInDist.lng,
    matchedNeighborhood: cleanNeigh || firstInDist.name,
    district,
    displayLabel: `${cleanNeigh || firstInDist.name} (${district})`,
    foundExactStreet: false,
  };
}

export function formatDateTR(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

export function formatLongDateTR(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  });
}

/**
 * Akıllı Rota ve Tarih Öneri Motoru:
 * Seçilen yeni mahalle ve ilçe ile mevcut planlanmış keşifleri karşılaştırır.
 */
export function findSmartRouteSuggestions(
  targetLat: number,
  targetLng: number,
  targetNeighborhood: string,
  targetDistrict: CourtDistrict,
  allInspections: InspectionRecord[],
  radiusKm = 12
): SmartSuggestion[] {
  if (!targetLat || !targetLng) return [];

  const todayStr = new Date().toISOString().split("T")[0];
  const nearestTargetInfo = findNearestLocalNeighborhood(
    targetLat,
    targetLng,
    targetDistrict
  );
  const targetCorridor = nearestTargetInfo.neighborhood.corridor;

  const byDate = new Map<string, InspectionRecord[]>();
  for (const rec of allInspections) {
    if (rec.date < todayStr && allInspections.some((r) => r.date >= todayStr)) {
      continue;
    }
    const list = byDate.get(rec.date) || [];
    list.push(rec);
    byDate.set(rec.date, list);
  }

  const suggestions: SmartSuggestion[] = [];

  for (const [date, records] of byDate.entries()) {
    let minDistance = Infinity;
    let closestRecord: InspectionRecord | null = null;
    let corridorMatched = false;

    for (const rec of records) {
      const dist = calculateHaversineKm(targetLat, targetLng, rec.lat, rec.lng);
      if (dist < minDistance) {
        minDistance = dist;
        closestRecord = rec;
      }
      if (
        rec.corridor &&
        targetCorridor &&
        rec.corridor === targetCorridor &&
        targetCorridor !== "Fatsa Merkez"
      ) {
        corridorMatched = true;
      }
      if (rec.district === targetDistrict && dist <= 8) {
        corridorMatched = true;
      }
    }

    if (closestRecord && (minDistance <= radiusKm || corridorMatched)) {
      const formattedDate = formatDateTR(date);
      const distanceText =
        minDistance < 0.3
          ? "aynı mahallede"
          : `${minDistance.toFixed(1)} km uzaklıktaki`;

      const districtLabel =
        closestRecord.district !== targetDistrict
          ? ` (${closestRecord.district} ilçesi)`
          : "";

      const message =
        minDistance < 0.3
          ? `💡 Akıllı Öneri: Doğrudan [${closestRecord.neighborhood}${districtLabel}] için ${formattedDate} tarihinde ${records.length} adet keşif planlanmış. Aynı güne ekleyerek güzergahı birleştirebilirsiniz!`
          : `💡 Akıllı Öneri: Bu mahalleye ${distanceText} [${closestRecord.neighborhood}${districtLabel}] için ${formattedDate} tarihinde ${records.length} adet keşif planlanmış. Aynı güne ekleyerek güzergahı birleştirebilirsiniz!`;

      suggestions.push({
        date,
        formattedDate,
        district: closestRecord.district || targetDistrict,
        closestNeighborhood: closestRecord.neighborhood,
        distanceBetweenKm: Number(minDistance.toFixed(1)),
        existingCount: records.length,
        existingRecords: records,
        corridorMatch: corridorMatched,
        message,
      });
    }
  }

  return suggestions.sort((a, b) => a.distanceBetweenKm - b.distanceBetweenKm);
}

/**
 * Mahalle adından (veya TKGM mahalle kaydından) en doğru koordinatı bulur
 */
export function resolveNeighborhoodCoordinates(
  neighborhoodName: string,
  preferredDistrict: CourtDistrict = "Fatsa"
): { lat: number; lng: number; matchedName: string; district: CourtDistrict } | null {
  const clean = neighborhoodName.trim();
  if (!clean) return null;
  const key = normalizeMahalleKey(clean);
  if (!key) return null;

  // 1. Önce yerel mahalle koordinat listesinde tam veya kısmi eşleşme ara
  const exactLocal =
    FATSA_NEIGHBORHOODS.find(
      (n) =>
        n.district === preferredDistrict &&
        (normalizeMahalleKey(n.name) === key ||
          normalizeMahalleKey(n.name).startsWith(key) ||
          key.startsWith(normalizeMahalleKey(n.name)))
    ) ||
    FATSA_NEIGHBORHOODS.find(
      (n) =>
        normalizeMahalleKey(n.name) === key ||
        normalizeMahalleKey(n.name).startsWith(key) ||
        key.startsWith(normalizeMahalleKey(n.name))
    );

  if (exactLocal) {
    return {
      lat: exactLocal.lat,
      lng: exactLocal.lng,
      matchedName: exactLocal.name,
      district: exactLocal.district,
    };
  }

  // 2. TKGM Mahalle listesinden eşleştir
  const tkgmMatch = resolveTkgmMahalle(preferredDistrict, clean);
  if (tkgmMatch) {
    const localForTkgm = FATSA_NEIGHBORHOODS.find(
      (n) =>
        n.district === tkgmMatch.district &&
        normalizeMahalleKey(n.name).startsWith(normalizeMahalleKey(tkgmMatch.text))
    );
    if (localForTkgm) {
      return {
        lat: localForTkgm.lat,
        lng: localForTkgm.lng,
        matchedName: `${tkgmMatch.text} Mahallesi`,
        district: tkgmMatch.district,
      };
    }
  }

  return null;
}

/**
 * Bir keşif dosyasındaki tüm mahalleleri (hem parcels listesindeki farklı mahalleleri
 * hem de mahalle alanında virgül / tire / eğik çizgi / '+' ile ayrılmış mahalleleri) tespit eder.
 */
export function getRecordUniqueNeighborhoods(rec: {
  neighborhood?: string;
  parcels?: ParcelItem[];
}): string[] {
  const seenKeys = new Set<string>();
  const result: string[] = [];

  const addIfUnique = (rawName?: string) => {
    if (!rawName) return;
    // Eğer tek bir metin içinde birden fazla mahalle yazılmışsa ("Saraytepe Mah., Ilıca Mah." veya "Evkaf / Dolunay") ayrıştır.
    // DİKKAT: "Kayaköy/Akçakese" veya "Geyikçeli Bld/Fatih" gibi resmi TKGM mahalle adlarındaki boşluksuz '/' karakterini bölme!
    const parts = rawName
      .split(/[,;+&]+|\s+\/\s+|\s+-\s+|\s+ve\s+/i)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);

    for (const part of parts) {
      const formatted =
        part.toLocaleLowerCase("tr-TR").includes("mahalle") ||
        part.toLocaleLowerCase("tr-TR").includes("köy")
          ? part
          : `${part} Mahallesi`;
      const k = normalizeMahalleKey(formatted);
      if (!k || seenKeys.has(k)) continue;
      seenKeys.add(k);
      result.push(formatted);
    }
  };

  if (rec.parcels && rec.parcels.length > 0) {
    for (const p of rec.parcels) {
      if (p.neighborhood) {
        addIfUnique(p.neighborhood);
      }
    }
  }

  if (rec.neighborhood) {
    addIfUnique(rec.neighborhood);
  }

  return result;
}

export interface RecordLocationStop {
  lat: number;
  lng: number;
  neighborhood: string;
  district: CourtDistrict;
  adaNo?: string;
  parselNo?: string;
  yuzolcumuM2?: number;
  nitelik?: string;
  polygon?: [number, number][];
  stopIndexInRecord: number;
  totalStopsInRecord: number;
  label: string;
}

/**
 * Bir keşif dosyasındaki (InspectionRecord) TÜM mahalleleri ve parsel konumlarını tespit ederek
 * harita pinleri ve OSRM rota oluşturma için sıralı durak listesi döndürür.
 */
export function extractRecordLocationStops(
  rec: Pick<InspectionRecord, "district" | "neighborhood" | "lat" | "lng"> &
    Partial<InspectionRecord>
): RecordLocationStop[] {
  const rawStops: Omit<
    RecordLocationStop,
    "stopIndexInRecord" | "totalStopsInRecord"
  >[] = [];

  // 1. Önce dosyadaki çoklu parselleri (rec.parcels) incele (Sadece taşınmaz keşiflerinde)
  if (
    rec.subjectType !== "arac" &&
    rec.subjectType !== "adres" &&
    rec.parcels &&
    rec.parcels.length > 0
  ) {
    for (const p of rec.parcels) {
      const pNeigh = (p.neighborhood || rec.neighborhood || "").trim();
      let pLat = p.centerLat;
      let pLng = p.centerLng;

      if ((!pLat || !pLng) && p.polygon && p.polygon.length >= 3) {
        const c = getPolygonCentroid(p.polygon);
        pLat = c.lat;
        pLng = c.lng;
      }

      // Eğer parselin koordinatı yoksa veya farklı bir mahalle seçilmiş ama koordinat güncellenmemişse mahalle koordinatını çöz
      if (pNeigh) {
        const resolved = resolveNeighborhoodCoordinates(pNeigh, rec.district);
        if (resolved) {
          if (!pLat || !pLng) {
            pLat = resolved.lat;
            pLng = resolved.lng;
          } else if (
            rawStops.length > 0 &&
            normalizeMahalleKey(pNeigh) !==
              normalizeMahalleKey(rawStops[0].neighborhood) &&
            calculateHaversineKm(pLat, pLng, rawStops[0].lat, rawStops[0].lng) <
              0.05
          ) {
            // Farklı mahalle adı verilmiş fakat eski mahallenin merkez koordinatı kalmışsa yeni mahallenin koordinatını kullan
            pLat = resolved.lat;
            pLng = resolved.lng;
          }
        }
      }

      const finalLat = pLat || rec.lat;
      const finalLng = pLng || rec.lng;

      rawStops.push({
        lat: finalLat,
        lng: finalLng,
        neighborhood: pNeigh || rec.neighborhood,
        district: rec.district,
        adaNo: p.adaNo,
        parselNo: p.parselNo,
        yuzolcumuM2: p.yuzolcumuM2,
        nitelik: p.nitelik,
        polygon: p.polygon,
        label: `${pNeigh || rec.neighborhood} (${p.adaNo || "0"}/${
          p.parselNo || "1"
        } - ${rec.esasNo})`,
      });
    }
  }

  // 2. Ayrıca rec.neighborhood içinde birden fazla mahalle adı yazılmışsa (Örn: "Saraytepe Mah. / Ilıca Mah.") ve yukarıdaki parsellerde yoksa onları da ekle
  const allMentionedNeighborhoods = getRecordUniqueNeighborhoods(rec);
  for (let i = 0; i < allMentionedNeighborhoods.length; i++) {
    const neighName = allMentionedNeighborhoods[i];
    const neighKey = normalizeMahalleKey(neighName);
    const alreadyInStops = rawStops.some(
      (s) => normalizeMahalleKey(s.neighborhood) === neighKey
    );
    if (!alreadyInStops) {
      const resolved = resolveNeighborhoodCoordinates(neighName, rec.district);
      // Eğer tek mahalleli (veya ilk duraklı) adres/araç/taşınmaz kaydıysa ve rec.lat/rec.lng seçilmişse doğrudan nokta koordinatını koru!
      const useExactRecordCoord =
        rawStops.length === 0 &&
        allMentionedNeighborhoods.length <= 1 &&
        Boolean(rec.lat && rec.lng);
      const stopLat = useExactRecordCoord
        ? rec.lat
        : resolved
        ? resolved.lat
        : rec.lat;
      const stopLng = useExactRecordCoord
        ? rec.lng
        : resolved
        ? resolved.lng
        : rec.lng;
      rawStops.push({
        lat: stopLat,
        lng: stopLng,
        neighborhood: resolved ? resolved.matchedName : neighName,
        district: resolved ? resolved.district : rec.district,
        adaNo:
          rawStops.length === 0 && rec.subjectType === "tasinmaz"
            ? rec.adaNo
            : undefined,
        parselNo:
          rawStops.length === 0 && rec.subjectType === "tasinmaz"
            ? rec.parselNo
            : undefined,
        yuzolcumuM2:
          rawStops.length === 0 && rec.subjectType === "tasinmaz"
            ? rec.yuzolcumuM2
            : undefined,
        nitelik: rawStops.length === 0 ? rec.nitelik : undefined,
        polygon:
          rawStops.length === 0 && rec.subjectType === "tasinmaz"
            ? rec.parcelPolygon
            : undefined,
        label: `${neighName} (${rec.district} - ${rec.esasNo})`,
      });
    }
  }

  // 3. Hiç durak çıkmadıysa dosyanın ana koordinatını ekle
  if (rawStops.length === 0) {
    rawStops.push({
      lat: rec.lat,
      lng: rec.lng,
      neighborhood: rec.neighborhood,
      district: rec.district,
      adaNo: rec.subjectType === "tasinmaz" ? rec.adaNo : undefined,
      parselNo: rec.subjectType === "tasinmaz" ? rec.parselNo : undefined,
      yuzolcumuM2: rec.subjectType === "tasinmaz" ? rec.yuzolcumuM2 : undefined,
      nitelik: rec.nitelik,
      polygon: rec.subjectType === "tasinmaz" ? rec.parcelPolygon : undefined,
      label: `${rec.neighborhood} (${rec.district} - ${rec.esasNo})`,
    });
  }

  return rawStops.map((s, idx) => ({
    ...s,
    stopIndexInRecord: idx + 1,
    totalStopsInRecord: rawStops.length,
  }));
}

/**
 * Günlük keşif listesindeki tüm dosyaları ve her dosyanın içindeki tüm farklı mahalle/parsel
 * duraklarını tespit ederek Adliye çıkışlı tam rota noktalarını oluşturur.
 */
export function buildDailyRoutePoints(
  dayRecords: InspectionRecord[]
): { lat: number; lng: number; label: string; esasNo?: string; neighborhood?: string }[] {
  const sorted = [...dayRecords].sort((a, b) => a.time.localeCompare(b.time));
  const points: {
    lat: number;
    lng: number;
    label: string;
    esasNo?: string;
    neighborhood?: string;
  }[] = [
    {
      lat: FATSA_COURTHOUSE.lat,
      lng: FATSA_COURTHOUSE.lng,
      label: FATSA_COURTHOUSE.shortName,
    },
  ];

  for (const rec of sorted) {
    const stops = extractRecordLocationStops(rec);
    for (const st of stops) {
      const prev = points[points.length - 1];
      // Aynı mahallede birbirine 60 metreden daha yakın bitişik parsellerde gereksiz zikzak yapmamak için kontrol et,
      // ancak mahalle adı farklıysa veya aralarında mesafe varsa mutlaka rotaya durak olarak ekle!
      const distFromPrevKm = prev
        ? calculateHaversineKm(prev.lat, prev.lng, st.lat, st.lng)
        : 999;
      const isDifferentNeighborhood =
        !prev?.neighborhood ||
        normalizeMahalleKey(prev.neighborhood) !==
          normalizeMahalleKey(st.neighborhood);

      if (distFromPrevKm >= 0.06 || isDifferentNeighborhood) {
        points.push({
          lat: st.lat,
          lng: st.lng,
          label: st.label,
          esasNo: rec.esasNo,
          neighborhood: st.neighborhood,
        });
      }
    }
  }

  return points;
}

/**
 * Verilen poligon koordinatlarının [lat, lng][] gerçek alanını metrekare (m²) cinsinden hesaplar
 */
export function calculatePolygonAreaM2(polygon: [number, number][]): number {
  if (!polygon || polygon.length < 3) return 0;

  const refLat = polygon[0][0];
  const metersPerDegLat = 111132.92;
  const metersPerDegLng = 111412.84 * Math.cos((refLat * Math.PI) / 180);

  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    const x1 = (p1[1] - polygon[0][1]) * metersPerDegLng;
    const y1 = (p1[0] - polygon[0][0]) * metersPerDegLat;
    const x2 = (p2[1] - polygon[0][1]) * metersPerDegLng;
    const y2 = (p2[0] - polygon[0][0]) * metersPerDegLat;
    sum += x1 * y2 - x2 * y1;
  }

  return Number(Math.max(1, Math.abs(sum) / 2).toFixed(2));
}

/**
 * Poligonun ağırlık merkezini (centroid) [lat, lng] olarak döndürür
 */
export function getPolygonCentroid(
  polygon: [number, number][]
): { lat: number; lng: number } {
  if (!polygon || polygon.length === 0) {
    return { lat: FATSA_COURTHOUSE.lat, lng: FATSA_COURTHOUSE.lng };
  }
  const sum = polygon.reduce(
    (acc, pt) => ({ lat: acc.lat + pt[0], lng: acc.lng + pt[1] }),
    { lat: 0, lng: 0 }
  );
  return {
    lat: Number((sum.lat / polygon.length).toFixed(6)),
    lng: Number((sum.lng / polygon.length).toFixed(6)),
  };
}

/**
 * TKGM alan metnini ("2.746,15", "30.013,27", "4,603.66", "448,00") yuvarlama yapmadan
 * tam ondalıklı metrekare sayısına (Örn: 2746.15) dönüştürür.
 */
export function parseTkgmAreaM2(raw: unknown): number {
  if (typeof raw === "number") {
    return isNaN(raw) ? 0 : Number(raw.toFixed(2));
  }
  const str = String(raw ?? "").trim();
  if (!str) return 0;

  const lastComma = str.lastIndexOf(",");
  const lastDot = str.lastIndexOf(".");
  let normalized = str;

  if (lastComma > lastDot) {
    // Türkçe format: "2.746,15" veya "448,00" -> nokta binlik ayracı, virgül ondalık ayracı
    normalized = str.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma && lastComma !== -1) {
    // İngilizce format: "4,603.66" -> virgül binlik ayracı, nokta ondalık ayracı
    normalized = str.replace(/,/g, "");
  } else if (lastComma !== -1) {
    // Sadece virgül var: "448,50"
    normalized = str.replace(",", ".");
  } else if (lastDot !== -1) {
    // Sadece nokta var: Eğer noktadan sonra tam 3 basamak varsa ve sayı > 1 ise ("1.250"), binlik ayracı olabilir;
    // ancak TKGM koordinat servisi her zaman 2 ondalık basamak ("124.00") döndürür.
    const parts = str.split(".");
    if (parts.length > 2) {
      normalized = parts.join("");
    } else if (parts.length === 2 && parts[1].length === 3 && Number(parts[0]) > 0) {
      normalized = parts.join("");
    }
  }

  const val = parseFloat(normalized);
  return isNaN(val) ? 0 : Number(val.toFixed(2));
}

/**
 * Metrekare değerini Türkçe tapu formatında ("2.746,15" veya "448") biçimlendirir
 */
export function formatAreaM2(val?: number | string | null): string {
  if (val === undefined || val === null || val === "") return "0";
  const num = typeof val === "number" ? val : parseTkgmAreaM2(val);
  if (!num || isNaN(num)) return "0";
  const hasDecimals = Math.abs(num - Math.round(num)) > 0.001;
  return num.toLocaleString("tr-TR", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/**
 * TKGM MEGSİS v3.1 API'sine tarayıcı Referer engeline (HTTP 403) takılmadan istek atar.
 * Hem doğrudan klasörden (file://) hem de sunucu üzerinden (%100 uyumlu) çalışır.
 */
async function fetchTkgmApiJson(
  directUrl: string,
  proxyPath?: string,
  timeoutMs = 6000
): Promise<{ ok: boolean; status: number; data: any }> {
  // 1. Önce referrerPolicy: "no-referrer" ile doğrudan TKGM API'den çek (Hem file:// hem http/https'de Referer: 403 engelini aşar)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(directUrl, {
      method: "GET",
      referrerPolicy: "no-referrer",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return { ok: true, status: res.status, data };
    }
    if (res.status === 404) {
      return { ok: false, status: 404, data: null };
    }
  } catch {
    // Doğrudan bağlantı başarısız olursa ve http/https modundaysak sunucu vekiline (proxy) geç
  }

  // 2. Yedek: Sunucu üzerinden çalışıyorsa /api/tkgm-... proxy rotasını kullan
  if (
    proxyPath &&
    typeof window !== "undefined" &&
    window.location.protocol.startsWith("http")
  ) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(proxyPath, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        return { ok: true, status: res.status, data };
      }
      return { ok: false, status: res.status, data: null };
    } catch {
      // ignore
    }
  }

  return { ok: false, status: 0, data: null };
}

/**
 * GeoJSON Polygon veya MultiPolygon koordinat halkasından en büyük dış sınır halkasını [lat, lng][] olarak çıkarır
 */
function extractBestPolygonRing(geom: any): [number, number][] | null {
  if (!geom || !Array.isArray(geom.coordinates)) return null;

  let candidateRings: [number, number][][] = [];
  if (geom.type === "Polygon") {
    if (Array.isArray(geom.coordinates[0])) {
      candidateRings = [geom.coordinates[0]];
    }
  } else if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) {
      if (Array.isArray(poly?.[0])) {
        candidateRings.push(poly[0]);
      }
    }
  }

  if (candidateRings.length === 0) return null;

  let bestPolygon: [number, number][] | null = null;
  let bestArea = -1;

  for (const ring of candidateRings) {
    if (!Array.isArray(ring) || ring.length < 3) continue;
    const closedTrimmed =
      ring.length > 3 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, ring.length - 1)
        : ring;

    const converted: [number, number][] = closedTrimmed
      .map((c: [number, number]) => [Number(c[1]), Number(c[0])] as [number, number])
      .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

    if (converted.length < 3) continue;
    const area = calculatePolygonAreaM2(converted);
    if (area > bestArea) {
      bestArea = area;
      bestPolygon = converted;
    }
  }

  return bestPolygon;
}

/**
 * TKGM GeoJSON Feature nesnesinden gerçek poligon koordinatlarını ve tapu özniteliklerini çıkarır.
 * Eğer parsel 3402 S.Y. 22/A kadastro yenilemesi görmüşse (`gittigiParselListe` doluysa),
 * yeni aktif parselin sınırlarını ve bilgilerini otomatik çözümler.
 */
async function extractTkgmFeatureResult(
  data: any,
  fallbackAda: string,
  fallbackParsel: string
): Promise<{
  polygon: [number, number][];
  centerLat: number;
  centerLng: number;
  areaM2: number;
  paftaNo: string;
  nitelik?: string;
  mevkii?: string;
  mahalleAd?: string;
  mahalleId?: number;
  ilceAd?: string;
  adaNo: string;
  parselNo: string;
  renewalNote?: string;
} | null> {
  if (!data) return null;

  let activeFeature = data.type === "Feature" ? data : data.features?.[0];
  if (!activeFeature) return null;

  let renewalNote: string | undefined;

  // Eğer parsel pasifse (geometry: null) ve 22/A yenilemesi ile gittiği aktif parsel listesi varsa:
  if (
    !activeFeature.geometry &&
    activeFeature.properties?.gittigiParselListe &&
    typeof activeFeature.properties.gittigiParselListe === "string"
  ) {
    try {
      const wentObj = JSON.parse(activeFeature.properties.gittigiParselListe);
      const wentFeature = wentObj?.features?.[0];
      if (wentFeature) {
        const oldAda = activeFeature.properties?.adaNo || fallbackAda;
        const oldParsel = activeFeature.properties?.parselNo || fallbackParsel;
        const newProps = wentFeature.properties || {};

        if (wentFeature.geometry) {
          renewalNote = `Eski ${oldAda || "0"}/${oldParsel} parseli kadastro yenilemesi (22/A) ile ${
            newProps.mahalleAd || ""
          } ${newProps.adaNo || "0"} Ada / ${newProps.parselNo} Parsele gitmiştir. Güncel TKGM sınırları çizildi.`;
          activeFeature = wentFeature;
        } else if (newProps.mahalleId && newProps.parselNo) {
          // Eğer gittigiParselListe içinde geometri boşsa doğrudan yeni parselin geometrisini çek
          const wentAda = newProps.adaNo || "0";
          const wentUrl = `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/parsel/${newProps.mahalleId}/${encodeURIComponent(
            wentAda
          )}/${encodeURIComponent(newProps.parselNo)}`;
          const wentProxy = `/api/tkgm-parsel/${newProps.mahalleId}/${encodeURIComponent(
            wentAda
          )}/${encodeURIComponent(newProps.parselNo)}`;
          const wentRes = await fetchTkgmApiJson(wentUrl, wentProxy);
          if (wentRes.ok && wentRes.data?.geometry) {
            renewalNote = `Eski ${oldAda || "0"}/${oldParsel} parseli kadastro yenilemesi (22/A) ile ${
              newProps.mahalleAd || ""
            } ${wentAda} Ada / ${newProps.parselNo} Parsele gitmiştir. Güncel TKGM sınırları çizildi.`;
            activeFeature = wentRes.data;
          }
        }
      }
    } catch {
      // ignore parse error
    }
  }

  const polygon = extractBestPolygonRing(activeFeature.geometry);
  if (!polygon || polygon.length < 3) return null;

  const props = activeFeature.properties || {};
  const centroid = getPolygonCentroid(polygon);
  const parsedArea =
    parseTkgmAreaM2(props.alan ?? props.TapuAlan ?? props.Alan) ||
    calculatePolygonAreaM2(polygon);

  return {
    polygon,
    centerLat: centroid.lat,
    centerLng: centroid.lng,
    areaM2: parsedArea,
    paftaNo: String(props.pafta || "").trim(),
    nitelik: props.nitelik ? String(props.nitelik).trim() : undefined,
    mevkii: props.mevkii ? String(props.mevkii).trim() : undefined,
    mahalleAd: props.mahalleAd ? String(props.mahalleAd).trim() : undefined,
    mahalleId: props.mahalleId ? Number(props.mahalleId) : undefined,
    ilceAd: props.ilceAd ? String(props.ilceAd).trim() : undefined,
    adaNo: String(props.adaNo || fallbackAda || "0").trim(),
    parselNo: String(props.parselNo || fallbackParsel || "1").trim(),
    renewalNote,
  };
}

/**
 * Harita üzerinden tıklanan noktanın doğrudan TKGM parsel sınırlarını ve Ada/Parsel bilgilerini çeker
 */
export async function fetchTkgmParcelByCoordinate(
  lat: number,
  lng: number
): Promise<{
  polygon: [number, number][];
  centerLat: number;
  centerLng: number;
  areaM2: number;
  paftaNo: string;
  nitelik?: string;
  mevkii?: string;
  mahalleAd?: string;
  mahalleId?: number;
  ilceAd?: string;
  adaNo: string;
  parselNo: string;
} | null> {
  const directUrl = `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/parsel/${lat}/${lng}`;
  const proxyUrl = `/api/tkgm-coord/${lat}/${lng}`;
  const res = await fetchTkgmApiJson(directUrl, proxyUrl, 5000);
  if (!res.ok || !res.data) return null;
  return await extractTkgmFeatureResult(res.data, "0", "1");
}

/**
 * TKGM MEGSİS v3.1 API üzerinden Mahalle + Ada + Parsel bilgisiyle resmi parsel sınırlarını çeker.
 * (`https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/parsel/{mahalleId}/{ada}/{parsel}`)
 * Asla sahte/alakasız parsel poligonu uydurmaz; doğrudan TKGM'deki gerçek sınırları ve tam yüzölçümünü döndürür.
 */
export async function queryParcelBoundary(params: {
  district?: CourtDistrict;
  neighborhood?: string;
  tkgmMahalleId?: number;
  baseLat: number;
  baseLng: number;
  adaNo: string;
  parselNo: string;
  yuzolcumuM2?: number;
  keepExactCenter?: boolean;
}): Promise<{
  polygon: [number, number][];
  centerLat: number;
  centerLng: number;
  areaM2: number;
  paftaNo: string;
  nitelik?: string;
  mevkii?: string;
  mahalleAd?: string;
  mahalleId?: number;
  adaNo: string;
  parselNo: string;
  source: "tkgm_api" | "cadastre_computed";
  statusMessage: string;
}> {
  const rawAda = params.adaNo.trim();
  const cleanAda =
    rawAda === "" || rawAda === "-" || rawAda === "0" ? "0" : rawAda;
  const cleanParsel = params.parselNo.trim();

  if (!cleanParsel) {
    return {
      polygon: [],
      centerLat: params.baseLat,
      centerLng: params.baseLng,
      areaM2: 0,
      paftaNo: "",
      adaNo: cleanAda,
      parselNo: "",
      source: "cadastre_computed",
      statusMessage: "Lütfen sorgulanacak Parsel numarasını girin.",
    };
  }

  // Aday TKGM Mahalle ID listesini oluştur (Önce seçili mahalleId, ardından aynı isimli alt mahalleler)
  const candidateMahalles = resolveCandidateTkgmMahalles(
    params.district,
    params.neighborhood,
    params.tkgmMahalleId
  );

  let passiveTapuRecord: any = null;
  let passiveMahalleText = "";

  for (const cand of candidateMahalles) {
    const directUrl = `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/parsel/${cand.id}/${encodeURIComponent(
      cleanAda
    )}/${encodeURIComponent(cleanParsel)}`;
    const proxyUrl = `/api/tkgm-parsel/${cand.id}/${encodeURIComponent(
      cleanAda
    )}/${encodeURIComponent(cleanParsel)}`;

    const res = await fetchTkgmApiJson(directUrl, proxyUrl, 6000);
    if (res.ok && res.data) {
      const extracted = await extractTkgmFeatureResult(
        res.data,
        cleanAda,
        cleanParsel
      );
      if (extracted && extracted.polygon.length >= 3) {
        const formattedArea = formatAreaM2(extracted.areaM2);
        const statusMsg = extracted.renewalNote
          ? `✅ TKGM Resmi Veri (22/A Yenileme): ${extracted.renewalNote} (Yüzölçümü: ${formattedArea} m²)`
          : `✅ TKGM Resmi Parsel Sınırı Çekildi: [${
              extracted.mahalleAd || cand.text
            }] ${extracted.adaNo} Ada / ${
              extracted.parselNo
            } Parsel · Yüzölçümü: ${formattedArea} m² · Nitelik: ${
              extracted.nitelik || "Taşınmaz"
            }`;

        return {
          polygon: extracted.polygon,
          centerLat: extracted.centerLat,
          centerLng: extracted.centerLng,
          areaM2: extracted.areaM2,
          paftaNo: extracted.paftaNo,
          nitelik: extracted.nitelik,
          mevkii: extracted.mevkii,
          mahalleAd: extracted.mahalleAd || cand.text,
          mahalleId: extracted.mahalleId || cand.id,
          adaNo: extracted.adaNo,
          parselNo: extracted.parselNo,
          source: "tkgm_api",
          statusMessage: statusMsg,
        };
      }

      if (res.data?.properties && !passiveTapuRecord) {
        passiveTapuRecord = res.data.properties;
        passiveMahalleText = cand.text;
      }
    }
  }

  // Eğer TKGM'de parselin tapu kaydı bulundu ancak aktif sınır geometrisi yoksa (Örn: eski pasif kayıt durum="0"):
  // Asla rastgele/sahte sınır çizme; gerçek TKGM yüzölçümü ve niteliğini doldurup kullanıcıyı bilgilendir.
  if (passiveTapuRecord) {
    const p = passiveTapuRecord;
    const exactTapuArea = parseTkgmAreaM2(p.alan ?? p.TapuAlan);
    return {
      polygon: [],
      centerLat: params.baseLat,
      centerLng: params.baseLng,
      areaM2: exactTapuArea,
      paftaNo: String(p.pafta || "").trim(),
      nitelik: p.nitelik ? String(p.nitelik).trim() : undefined,
      mevkii: p.mevkii ? String(p.mevkii).trim() : undefined,
      mahalleAd: p.mahalleAd ? String(p.mahalleAd).trim() : passiveMahalleText,
      mahalleId: p.mahalleId ? Number(p.mahalleId) : candidateMahalles[0]?.id,
      adaNo: String(p.adaNo || cleanAda),
      parselNo: String(p.parselNo || cleanParsel),
      source: "tkgm_api",
      statusMessage: `ℹ️ TKGM Tapu Kaydı Bulundu ([${
        p.mahalleAd || passiveMahalleText
      }] ${p.adaNo || cleanAda} Ada / ${
        p.parselNo || cleanParsel
      } Parsel · Yüzölçümü: ${formatAreaM2(exactTapuArea)} m² · ${
        p.nitelik || "Taşınmaz"
      }), ancak bu parsel TKGM'de pasif (eski kadastro) göründüğü için aktif vektör sınırı bulunmamaktadır.`,
    };
  }

  const primaryName =
    candidateMahalles[0]?.text || params.neighborhood || "Seçili Mahalle";
  return {
    polygon: [],
    centerLat: params.baseLat,
    centerLng: params.baseLng,
    areaM2: 0,
    paftaNo: "",
    adaNo: cleanAda,
    parselNo: cleanParsel,
    source: "cadastre_computed",
    statusMessage: `⚠️ TKGM MEGSİS'te [${primaryName}] için ${cleanAda} Ada / ${cleanParsel} Parsel kaydı bulunamadı. Lütfen Mahalle, Ada ve Parsel numarasını kontrol edin (Ada numarası yoksa 0 yazın).`,
  };
}

/**
 * TKGM Parsel Sorgu (parselsorgu.tkgm.gov.tr) üzerinden indirilen GeoJSON / JSON dosyasını çözümler
 */
export function parseTkgmGeoJson(rawText: string): {
  polygon: [number, number][];
  centerLat: number;
  centerLng: number;
  adaNo?: string;
  parselNo?: string;
  nitelik?: string;
  yuzolcumuM2?: number;
  paftaNo?: string;
  mahalle?: string;
  ilce?: string;
} | null {
  try {
    const obj = JSON.parse(rawText);
    const feature =
      obj.type === "FeatureCollection" && Array.isArray(obj.features)
        ? obj.features[0]
        : obj.type === "Feature"
        ? obj
        : obj.geometry
        ? obj
        : null;

    if (!feature || !feature.geometry) return null;

    const polygon = extractBestPolygonRing(feature.geometry);
    if (!polygon || polygon.length < 3) return null;

    const centroid = getPolygonCentroid(polygon);
    const props = feature.properties || obj.properties || {};

    const rawArea =
      props.Alan ??
      props.alan ??
      props.TapuAlan ??
      props.tapuAlan ??
      props.Shape_Area;
    const parsedArea = rawArea
      ? parseTkgmAreaM2(rawArea)
      : calculatePolygonAreaM2(polygon);

    return {
      polygon,
      centerLat: centroid.lat,
      centerLng: centroid.lng,
      adaNo:
        String(props.Ada || props.adaNo || props.ada || "").trim() || undefined,
      parselNo:
        String(props.Parsel || props.parselNo || props.parsel || "").trim() ||
        undefined,
      nitelik:
        String(props.Nitelik || props.nitelik || props.Cins || "").trim() ||
        undefined,
      yuzolcumuM2: parsedArea || calculatePolygonAreaM2(polygon),
      paftaNo: String(props.Pafta || props.pafta || "").trim() || undefined,
      mahalle:
        String(
          props.Mahalle || props.mahalleAd || props.mahalle || ""
        ).trim() || undefined,
      ilce:
        String(props.Ilce || props.ilceAd || props.ilce || "").trim() ||
        undefined,
    };
  } catch {
    return null;
  }
}

/**
 * 1. Parsel girildiğinde aynı mahalle/ada içindeki komşu parsel numaralarını ve
 * parsel sınırının hemen bitişiğindeki (Kuzey/Güney/Doğu/Batı) diğer TKGM parsellerini
 * eşzamanlı sorgulayarak kullanıcıya tek tıkla eklenebilir yakın parsel önerileri döndürür.
 */
export async function fetchNearbyTkgmParcels(params: {
  district?: CourtDistrict;
  neighborhood?: string;
  tkgmMahalleId?: number;
  adaNo: string;
  parselNo: string;
  centerLat: number;
  centerLng: number;
  polygon?: [number, number][];
  excludeParcelKeys?: string[];
}): Promise<ParcelItem[]> {
  const rawAda = params.adaNo.trim();
  const cleanAda =
    rawAda === "" || rawAda === "-" || rawAda === "0" ? "0" : rawAda;
  const cleanParsel = params.parselNo.trim();
  const baseParselNum = parseInt(cleanParsel, 10);

  const candidates = resolveCandidateTkgmMahalles(
    params.district,
    params.neighborhood,
    params.tkgmMahalleId
  );
  const primaryMahalle = candidates[0];
  if (!primaryMahalle) return [];

  const mahalleId = primaryMahalle.id;
  const excludeSet = new Set<string>(params.excludeParcelKeys || []);
  excludeSet.add(`${mahalleId}-${cleanAda}-${cleanParsel}`);
  excludeSet.add(`${cleanAda}/${cleanParsel}`);

  // 1. Aynı Ada içerisindeki ardışık/yakın parsel numaraları
  const candidateParselNums: string[] = [];
  if (!isNaN(baseParselNum) && baseParselNum > 0) {
    const offsets = [1, 2, 3, -1, 4, 5, -2, 6, 7, 8, -3, 9, 10];
    for (const off of offsets) {
      const target = baseParselNum + off;
      if (target > 0 && String(target) !== cleanParsel) {
        candidateParselNums.push(String(target));
      }
      if (candidateParselNums.length >= 9) break;
    }
  } else {
    candidateParselNums.push("1", "2", "3", "4", "5", "6");
  }

  const byNumberPromises = candidateParselNums.map(async (pNo) => {
    const directUrl = `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/parsel/${mahalleId}/${encodeURIComponent(
      cleanAda
    )}/${encodeURIComponent(pNo)}`;
    const proxyUrl = `/api/tkgm-parsel/${mahalleId}/${encodeURIComponent(
      cleanAda
    )}/${encodeURIComponent(pNo)}`;
    const res = await fetchTkgmApiJson(directUrl, proxyUrl, 4500);
    if (!res.ok || !res.data) return null;
    return await extractTkgmFeatureResult(res.data, cleanAda, pNo);
  });

  // 2. 1. Parselin poligon sınırlarının hemen dışındaki 4 yöndeki komşu parseller (farklı ada veya uzak parsel no olsa bile yakalar)
  const coordProbes: [number, number][] = [];
  if (params.polygon && params.polygon.length >= 3) {
    const lats = params.polygon.map((p) => p[0]);
    const lngs = params.polygon.map((p) => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    coordProbes.push(
      [Number((maxLat + 0.00028).toFixed(6)), params.centerLng],
      [Number((minLat - 0.00028).toFixed(6)), params.centerLng],
      [params.centerLat, Number((maxLng + 0.00035).toFixed(6))],
      [params.centerLat, Number((minLng - 0.00035).toFixed(6))]
    );
  }

  const byCoordPromises = coordProbes.map(async ([plat, plng]) => {
    try {
      return await fetchTkgmParcelByCoordinate(plat, plng);
    } catch {
      return null;
    }
  });

  const allResolved = await Promise.all([
    ...byNumberPromises,
    ...byCoordPromises,
  ]);

  const foundMap = new Map<string, ParcelItem>();

  for (const item of allResolved) {
    if (!item || !item.polygon || item.polygon.length < 3) continue;
    const itemMahId = item.mahalleId || mahalleId;
    const key1 = `${itemMahId}-${item.adaNo}-${item.parselNo}`;
    const key2 = `${item.adaNo}/${item.parselNo}`;
    if (excludeSet.has(key1) || excludeSet.has(key2) || foundMap.has(key1)) {
      continue;
    }

    const distKm = calculateHaversineKm(
      params.centerLat,
      params.centerLng,
      item.centerLat,
      item.centerLng
    );
    const distMeters = Math.round(distKm * 1000);
    // Sadece gerçekten yakın (Örn: 2.5 km yarıçap içindeki) parselleri öner
    if (distMeters > 2500) continue;

    foundMap.set(key1, {
      id: key1,
      mahalleId: itemMahId,
      neighborhood: item.mahalleAd
        ? item.mahalleAd.includes("Mahalle")
          ? item.mahalleAd
          : `${item.mahalleAd} Mahallesi`
        : params.neighborhood,
      adaNo: item.adaNo,
      parselNo: item.parselNo,
      nitelik: item.nitelik || "Taşınmaz",
      yuzolcumuM2: item.areaM2,
      paftaNo: item.paftaNo,
      mevkii: item.mevkii,
      centerLat: item.centerLat,
      centerLng: item.centerLng,
      polygon: item.polygon,
      source: "tkgm_api",
      distanceFromFirstMeters: distMeters,
    });
  }

  return Array.from(foundMap.values())
    .sort(
      (a, b) =>
        (a.distanceFromFirstMeters ?? 9999) -
        (b.distanceFromFirstMeters ?? 9999)
    )
    .slice(0, 10);
}

/**
 * Kullanıcının Bağımsız Bölüm No kutusuna yazdığı tekil veya çoklu ifadeleri
 * (Örn: "1, 2, 5", "1-4", "Zemin Kat No:1; Kat 1 No:2" veya "3") ayrı ayrı bağımsız bölüm dizisine çevirir.
 */
export function expandBagimsizBolumTokens(rawInput: string | undefined): string[] {
  if (!rawInput) return [];
  const trimmed = rawInput.trim();
  if (!trimmed) return [];

  // Virgül, noktalı virgül veya '+' ile ayrılmış parçaları böl
  const rawParts = trimmed
    .split(/[,;+]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const expanded: string[] = [];
  for (const part of rawParts) {
    // Sadece sayısal aralık ise (Örn: "1-4" veya "2 - 6") genişlet (maksimum 30 adet)
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start <= end && end - start <= 30) {
        for (let n = start; n <= end; n++) {
          const s = String(n);
          if (!expanded.includes(s)) expanded.push(s);
        }
        continue;
      }
    }
    if (!expanded.includes(part)) {
      expanded.push(part);
    }
  }
  return expanded;
}

/**
 * Aynı parsel üzerinde birden fazla bağımsız bölüm eklendiğinde arsa yüzölçümünün (m²)
 * mükerrer toplanmasını önleyerek benzersiz (mahalle + ada + parsel) bazında toplam yüzölçümünü hesaplar.
 */
export function computeUniqueParcelAreaSum(parcels: ParcelItem[] | undefined): number {
  if (!parcels || parcels.length === 0) return 0;
  const seenPhysicalParcels = new Set<string>();
  let sum = 0;
  for (const p of parcels) {
    const key = `${(p.neighborhood || "").trim().toLocaleLowerCase("tr-TR")}__${(
      p.adaNo || "0"
    ).trim()}__${(p.parselNo || "").trim()}`;
    if (!seenPhysicalParcels.has(key)) {
      seenPhysicalParcels.add(key);
      sum += Number(p.yuzolcumuM2) || 0;
    }
  }
  return Number(sum.toFixed(2));
}

/**
 * Kaydın Ada / Parsel ve varsa Bağımsız Bölüm No bilgisini (çoklu parsel ve aynı parselde çoklu bağımsız bölüm desteğiyle) okunaklı etiket olarak döndürür
 */
export function formatAdaParselLabel(rec: {
  subjectType?: "tasinmaz" | "adres" | "arac";
  adaNo?: string;
  parselNo?: string;
  bagimsizBolumNo?: string;
  nitelik?: string;
  yuzolcumuM2?: number;
  parcels?: ParcelItem[];
}): string | null {
  if (rec.subjectType === "arac" || rec.subjectType === "adres") return null;
  if (rec.parcels && rec.parcels.length > 1) {
    // Fiziki olarak kaç farklı ada/parsel var kontrol et
    const uniquePhysicalKeys = new Set(
      rec.parcels.map(
        (p) =>
          `${(p.neighborhood || "").trim()}__${p.adaNo || "0"}__${p.parselNo}`
      )
    );

    // Eğer tüm satırlar aynı ada/parsel üzerindeki farklı bağımsız bölümlerse:
    if (uniquePhysicalKeys.size === 1) {
      const first = rec.parcels[0];
      const bbs = rec.parcels
        .map((p) => p.bagimsizBolumNo?.trim())
        .filter(Boolean);
      if (bbs.length > 0) {
        return `${first.adaNo || "0"} Ada ${first.parselNo} Parsel · ${
          bbs.length
        } Bağımsız Bölüm (No: ${bbs.join(", ")})`;
      }
    }

    const shortList = rec.parcels
      .slice(0, 4)
      .map((p) => {
        const bb = p.bagimsizBolumNo?.trim()
          ? ` (B.Bölüm: ${p.bagimsizBolumNo.trim()})`
          : "";
        return `${p.adaNo || "0"}/${p.parselNo}${bb}`;
      })
      .join(", ");
    const extra =
      rec.parcels.length > 4 ? ` +${rec.parcels.length - 4}` : "";
    const countLabel =
      uniquePhysicalKeys.size !== rec.parcels.length
        ? `${uniquePhysicalKeys.size} Parsel / ${rec.parcels.length} B.Bölüm`
        : `${rec.parcels.length} Parsel`;
    return `${countLabel} (${shortList}${extra})`;
  }
  const singleParcel = rec.parcels?.[0];
  const adaVal = rec.adaNo || singleParcel?.adaNo;
  const parselVal = rec.parselNo || singleParcel?.parselNo;
  const bbVal = (
    rec.bagimsizBolumNo ||
    singleParcel?.bagimsizBolumNo ||
    ""
  ).trim();
  if (!adaVal && !parselVal) return null;
  const adaPart = adaVal ? `${adaVal} Ada` : "0 Ada";
  const parselPart = parselVal ? `${parselVal} Parsel` : "";
  const bbPart = bbVal ? ` · Bağımsız Bölüm No: ${bbVal}` : "";
  return `${adaPart} ${parselPart}${bbPart}`.trim();
}

/**
 * Adres bazlı keşif kayıtları (veya ada/parsel girilmeden açık adres girilen kayıtlar) için
 * açık adres, bağımsız bölüm / daire numarası ve nitelik etiketini döndürür
 */
export function formatAddressLabel(rec: {
  subjectType?: "tasinmaz" | "adres" | "arac";
  addressDetail?: string;
  bagimsizBolumNo?: string;
  nitelik?: string;
  adaNo?: string;
  parselNo?: string;
  parcels?: ParcelItem[];
}): string | null {
  if (rec.subjectType === "arac") return null;
  const hasAnyParcel =
    rec.subjectType !== "adres" &&
    Boolean(
      rec.adaNo ||
        rec.parselNo ||
        (rec.parcels && rec.parcels.length > 0)
    );
  if (hasAnyParcel) return null;

  const addr = (rec.addressDetail || "").trim();
  const bb = (rec.bagimsizBolumNo || "").trim();
  const nit = (rec.nitelik || "").trim();

  if (rec.subjectType !== "adres" && !addr && !bb) return null;

  const parts: string[] = [];
  if (addr) {
    parts.push(addr);
  } else {
    parts.push("Adres Bazlı Keşif");
  }
  if (bb) {
    parts.push(`Daire / B.Bölüm No: ${bb}`);
  }
  if (nit) {
    parts.push(`(${nit})`);
  }
  return parts.join(" · ");
}

/**
 * Araç keşif / delil tespiti kayıtları için plaka ve araç etiketini döndürür
 */
export function formatVehicleLabel(rec: {
  subjectType?: "tasinmaz" | "adres" | "arac";
  vehicleInfo?: VehicleInspectionInfo;
}): string | null {
  if (rec.subjectType !== "arac" || !rec.vehicleInfo?.plateNo) return null;
  const plate = rec.vehicleInfo.plateNo.trim().toLocaleUpperCase("tr-TR");
  const model = rec.vehicleInfo.brandModel?.trim();
  const vType = rec.vehicleInfo.vehicleType?.trim();
  const detail = [model, vType].filter(Boolean).join(" · ");
  return detail ? `${plate} (${detail})` : plate;
}

/**
 * Ayarlar bölümündeki kullanıcı profili (Ad Soyad + Unvan) ve cihaz bilgisini birleştirerek
 * "Keşfi Ekleyen Kişi" bilgisini oluşturur.
 */
export function formatUserProfileCreator(
  profile: UserProfileConfig,
  autoDeviceName?: string
): string {
  const name = profile.fullName.trim();
  const title = profile.title || "Zabıt Katibi";
  const sicil = profile.sicilNo?.trim() ? ` - Sicil: ${profile.sicilNo.trim()}` : "";
  const basePerson = name ? `${name} (${title}${sicil})` : `${title}${sicil}`;
  if (profile.includeDeviceName && autoDeviceName) {
    return `${basePerson} · ${autoDeviceName}`;
  }
  return basePerson;
}

/**
 * Keşfi ekleyen kullanıcının cihaz bilgisini (Bilgisayar Oturum Adı / Bilgisayar Adı veya Telefon Modeli/Adı)
 * tarayıcı Client Hints, User-Agent ve yerel sunucu bilgilerinden otomatik algılar.
 */
export async function detectClientDeviceInfo(): Promise<{
  deviceName: string;
  deviceType: "pc" | "mobile" | "tablet";
}> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { deviceName: "Adliye Kalem Bilgisayarı", deviceType: "pc" };
  }

  const ua = navigator.userAgent || "";
  let deviceType: "pc" | "mobile" | "tablet" = "pc";
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)) {
    deviceType = "tablet";
  } else if (/Mobile|Android|iPhone|iPod|IEMobile|Opera Mini/i.test(ua)) {
    deviceType = "mobile";
  }

  // 1. Eğer yerel bilgisayarda (server.ts) çalışıyorsa gerçek bilgisayar adı (hostname) ve oturum adını (username) kontrol et
  if (deviceType === "pc" && window.location.protocol.startsWith("http")) {
    try {
      const res = await fetch("/api/device-info");
      if (res.ok) {
        const info = await res.json();
        if (info.hostname || info.username) {
          const parts = [info.hostname, info.username].filter(Boolean);
          return {
            deviceName: `${parts.join(" / ")} (Bilgisayar Oturumu)`,
            deviceType: "pc",
          };
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Modern Tarayıcı Client Hints API (Özellikle Android telefon modelini ve işletim sistemini tam verir)
  const navAny = navigator as any;
  if (navAny.userAgentData && typeof navAny.userAgentData.getHighEntropyValues === "function") {
    try {
      const highEntropy = await navAny.userAgentData.getHighEntropyValues([
        "model",
        "platform",
        "platformVersion",
      ]);
      const model = (highEntropy.model || "").trim();
      const platform = (highEntropy.platform || "").trim();
      if (model && (deviceType === "mobile" || deviceType === "tablet")) {
        return {
          deviceName: `${model} (${platform || "Mobil Telefon"})`,
          deviceType,
        };
      }
    } catch {
      // ignore
    }
  }

  // 3. User-Agent üzerinden telefon modeli veya bilgisayar işletim sistemi / oturum bilgisi çıkarımı
  if (deviceType === "mobile" || deviceType === "tablet") {
    if (/iPhone/i.test(ua)) {
      return { deviceName: "iPhone (iOS Mobil)", deviceType: "mobile" };
    }
    if (/iPad/i.test(ua)) {
      return { deviceName: "iPad (iPadOS Tablet)", deviceType: "tablet" };
    }
    // Android cihaz modelini yakala: Örn: "Android 14; SM-S918B" veya "Android 13; Redmi Note 12"
    const androidModelMatch = ua.match(/Android\s+[\d.]+;\s*([^;)]+?)(?:\s+Build\/|\))/i);
    if (androidModelMatch && androidModelMatch[1]) {
      const rawModel = androidModelMatch[1].trim();
      if (rawModel && rawModel !== "K" && rawModel.length >= 2) {
        return {
          deviceName: `${rawModel} (Android Telefon)`,
          deviceType,
        };
      }
    }
    return { deviceName: "Android Cep Telefonu", deviceType };
  }

  // Masaüstü Bilgisayar (PC / Mac / Linux)
  let osLabel = "Masaüstü Bilgisayar";
  if (/Windows NT 10\.0/i.test(ua)) {
    osLabel = "Windows 10/11 PC";
  } else if (/Windows/i.test(ua)) {
    osLabel = "Windows PC";
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    osLabel = "MacBook / macOS";
  } else if (/Linux/i.test(ua)) {
    osLabel = "Linux PC";
  }

  let browserLabel = "Tarayıcı";
  if (/Edg\//i.test(ua)) {
    browserLabel = "Edge Oturumu";
  } else if (/Chrome\//i.test(ua)) {
    browserLabel = "Chrome Oturumu";
  } else if (/Firefox\//i.test(ua)) {
    browserLabel = "Firefox Oturumu";
  } else if (/Safari\//i.test(ua)) {
    browserLabel = "Safari Oturumu";
  }

  return {
    deviceName: `${osLabel} (${browserLabel})`,
    deviceType: "pc",
  };
}

export interface ParsedParcelCandidate {
  district: CourtDistrict;
  neighborhood: string;
  tkgmMahalleId?: number;
  baseLat: number;
  baseLng: number;
  corridor: string;
  adaNo: string;
  parselNo: string;
  bagimsizBolumNo?: string;
}

export interface ParsedInspectionTextResult {
  detectedEsasNo?: string;
  detectedDistrict?: CourtDistrict;
  detectedNeighborhood?: string;
  detectedTkgmMahalleId?: number;
  detectedBagimsizBolumNo?: string;
  parcels: ParsedParcelCandidate[];
}

interface TextNeighborhoodAnchor {
  index: number;
  district: CourtDistrict;
  neighborhood: string;
  tkgmMahalleId?: number;
  lat: number;
  lng: number;
  corridor: string;
}

const AMBIGUOUS_BARE_MAHALLE_KEYS = new Set([
  "yeni",
  "merkez",
  "dere",
  "guney",
  "kulak",
  "maden",
  "fatih",
  "kurtulus",
  "sakarya",
  "karsiyaka",
]);

/**
 * Kopyalanıp yapıştırılan serbest metinden (UYAP, Tapu Kaydı, Tensip Zaptı, Müzekkere, Dilekçe vb.)
 * İlçe, Mahalle/Köy, Ada, Parsel, Bağımsız Bölüm No ve Esas No bilgilerini otomatik tespit eder.
 * Birden fazla mahalle ve birden fazla ada/parsel içeren metinleri sırasıyla çözümler.
 */
export function parsePastedParcelText(
  rawText: string,
  defaultDistrict: CourtDistrict = "Fatsa",
  defaultNeighborhood: string = "Saraytepe Mahallesi"
): ParsedInspectionTextResult {
  const cleanedText = (rawText || "").trim();
  if (!cleanedText) {
    return { parcels: [] };
  }

  // 1. Esas No tespiti (Örn: "2026/145 E.", "2025/88 Esas")
  let detectedEsasNo: string | undefined;
  const esasRegex = /\b(20\d{2})\s*\/\s*(\d+)\s*(?:E\.?|Esas)\b/i;
  const esasMatch = cleanedText.match(esasRegex);
  if (esasMatch) {
    detectedEsasNo = `${esasMatch[1]}/${esasMatch[2]} E.`;
  }

  // 2. Bağımsız Bölüm / Daire No tespiti
  let globalBagimsizBolum: string | undefined;
  const bbMatch =
    cleanedText.match(
      /(?:bağımsız\s*bölüm|bagimsiz\s*bolum|b\.?\s*bölüm|bb)\s*(?:no|numarası|:)?\s*[:.\-]?\s*(\d+[A-Za-z]?)/i
    ) ||
    cleanedText.match(
      /(\d+[A-Za-z]?)\s*(?:nolu|numaralı|no'?lu)\s*bağımsız\s*bölüm/i
    ) ||
    cleanedText.match(/(?:iç\s*kapı|daire)\s*(?:no)?\s*[:.\-]?\s*(\d+[A-Za-z]?)/i);
  if (bbMatch && bbMatch[1]) {
    globalBagimsizBolum = bbMatch[1].trim();
  }

  // 3. Metin içindeki İlçe ipuçlarını bul (Fatsa, Çamaş, Çatalpınar)
  let fallbackDistrict: CourtDistrict = defaultDistrict;
  const lowerFull = cleanedText.toLocaleLowerCase("tr-TR");
  if (lowerFull.includes("çamaş") || lowerFull.includes("camas")) {
    fallbackDistrict = "Çamaş";
  } else if (
    lowerFull.includes("çatalpınar") ||
    lowerFull.includes("catalpinar")
  ) {
    fallbackDistrict = "Çatalpınar";
  } else if (lowerFull.includes("fatsa")) {
    fallbackDistrict = "Fatsa";
  }

  const resolveAnchorMeta = (
    rawMahName: string,
    hintDistrict: CourtDistrict,
    matchIndex: number
  ): TextNeighborhoodAnchor | null => {
    const resolvedCoord = resolveNeighborhoodCoordinates(
      rawMahName,
      hintDistrict
    );
    const tkgm = resolveTkgmMahalle(
      resolvedCoord?.district || hintDistrict,
      rawMahName
    );
    if (!resolvedCoord && !tkgm) return null;

    const finalDistrict =
      resolvedCoord?.district || tkgm?.district || hintDistrict;
    const finalName =
      resolvedCoord?.matchedName ||
      (tkgm
        ? tkgm.text.toLocaleLowerCase("tr-TR").includes("mahalle")
          ? tkgm.text
          : `${tkgm.text} Mahallesi`
        : `${rawMahName.trim()} Mahallesi`);
    const localN = FATSA_NEIGHBORHOODS.find(
      (n) =>
        n.district === finalDistrict &&
        normalizeMahalleKey(n.name) === normalizeMahalleKey(finalName)
    );

    return {
      index: matchIndex,
      district: finalDistrict,
      neighborhood: finalName,
      tkgmMahalleId: tkgm?.id,
      lat: resolvedCoord?.lat || localN?.lat || FATSA_COURTHOUSE.lat,
      lng: resolvedCoord?.lng || localN?.lng || FATSA_COURTHOUSE.lng,
      corridor: localN?.corridor || `${finalDistrict} Güzergahı`,
    };
  };

  // 4. Metin içindeki tüm Mahalle / Köy geçişlerini konumlarıyla (index) bul
  const anchors: TextNeighborhoodAnchor[] = [];
  const addAnchorIfNotOverlapping = (anchor: TextNeighborhoodAnchor | null) => {
    if (!anchor) return;
    const existsClose = anchors.some(
      (a) =>
        Math.abs(a.index - anchor.index) < 12 &&
        normalizeMahalleKey(a.neighborhood) ===
          normalizeMahalleKey(anchor.neighborhood)
    );
    if (!existsClose) {
      anchors.push(anchor);
    }
  };

  // A) "Mahalle/Köy: Saraytepe" veya "Mahallesi : Ilıca" biçimi
  const prefixMahRegex =
    /(?:mahallesi|mahalle\s*\/\s*köy|mahalle|köyü|köy)\s*[:\-]\s*([A-ZÇĞİÖŞÜa-zçğıöşü.]+(?:\s+[A-ZÇĞİÖŞÜa-zçğıöşü.]+){0,2})/gi;
  let pmMatch: RegExpExecArray | null;
  while ((pmMatch = prefixMahRegex.exec(cleanedText)) !== null) {
    const candidateName = pmMatch[1]
      .replace(/\b(?:ada|parsel|ilçesi|ili)\b.*$/i, "")
      .trim();
    if (candidateName.length >= 2) {
      addAnchorIfNotOverlapping(
        resolveAnchorMeta(candidateName, fallbackDistrict, pmMatch.index)
      );
    }
  }

  // B) "<İsim> Mahallesi / Mah. / Mah / Köyü / Köy" biçimi
  const suffixMahRegex =
    /([A-ZÇĞİÖŞÜa-zçğıöşü./-]+(?:\s+[A-ZÇĞİÖŞÜa-zçğıöşü./-]+){0,2})\s+(?:Mahallesi|Mah\.|Mah\b|Köyü|Köy\b)/gi;
  let smMatch: RegExpExecArray | null;
  while ((smMatch = suffixMahRegex.exec(cleanedText)) !== null) {
    // İsimden önce "Ordu İli Fatsa İlçesi" gibi kelimeler varsa temizle
    const rawPhrase = smMatch[1]
      .replace(
        /^.*?\b(?:ili|ilçesi|ilcesi|fatsa|çamaş|camas|çatalpınar|catalpinar|ordu|ve|ile)\b\s*[,:-]?\s*/i,
        ""
      )
      .trim();
    if (rawPhrase.length >= 2) {
      // Bu eşleşmenin hemen öncesinde ilçe adı geçiyor mu kontrol et
      const lookbehind = cleanedText
        .slice(Math.max(0, smMatch.index - 35), smMatch.index + smMatch[0].length)
        .toLocaleLowerCase("tr-TR");
      let localDist = fallbackDistrict;
      if (lookbehind.includes("çamaş") || lookbehind.includes("camas")) {
        localDist = "Çamaş";
      } else if (
        lookbehind.includes("çatalpınar") ||
        lookbehind.includes("catalpinar")
      ) {
        localDist = "Çatalpınar";
      } else if (lookbehind.includes("fatsa")) {
        localDist = "Fatsa";
      }
      addAnchorIfNotOverlapping(
        resolveAnchorMeta(rawPhrase, localDist, smMatch.index)
      );
    }
  }

  // C) "Mahallesi" kelimesi yazılmadan doğrudan bilinen mahalle adlarının geçmesi (Örn: "Saraytepe 101/1, Ilıca 137/13")
  const knownPool: { name: string; district: CourtDistrict; key: string }[] = [];
  for (const n of FATSA_NEIGHBORHOODS) {
    const clean = n.name
      .replace(/\s*\(.*?\)\s*/g, "")
      .replace(/\s*Mahallesi$/i, "")
      .trim();
    const k = normalizeMahalleKey(clean);
    if (k.length >= 3) {
      knownPool.push({ name: clean, district: n.district, key: k });
    }
  }
  for (const m of TKGM_MAHALLE_LIST) {
    const k = normalizeMahalleKey(m.text);
    if (k.length >= 3 && !knownPool.some((p) => p.key === k && p.district === m.district)) {
      knownPool.push({ name: m.text, district: m.district, key: k });
    }
  }
  // Uzun mahalle adlarına öncelik ver ("Yukarıbahçeler" -> "Bahçeler"den önce)
  knownPool.sort((a, b) => b.name.length - a.name.length);

  for (const item of knownPool) {
    if (AMBIGUOUS_BARE_MAHALLE_KEYS.has(item.key)) continue;
    const escaped = item.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const bareRegex = new RegExp(
      `(?:^|[^A-ZÇĞİÖŞÜa-zçğıöşü])(${escaped})(?=[^A-ZÇĞİÖŞÜa-zçğıöşü]|$)`,
      "gi"
    );
    let bm: RegExpExecArray | null;
    while ((bm = bareRegex.exec(cleanedText)) !== null) {
      const hitIdx = bm.index + (bm[0].length - bm[1].length);
      addAnchorIfNotOverlapping(
        resolveAnchorMeta(item.name, item.district, hitIdx)
      );
    }
  }

  anchors.sort((a, b) => a.index - b.index);

  // Varsayılan (fallback) mahalle çapası
  const defaultAnchor =
    resolveAnchorMeta(defaultNeighborhood, fallbackDistrict, 0) || {
      index: 0,
      district: fallbackDistrict,
      neighborhood: defaultNeighborhood,
      tkgmMahalleId: resolveTkgmMahalle(fallbackDistrict, defaultNeighborhood)?.id,
      lat: FATSA_COURTHOUSE.lat,
      lng: FATSA_COURTHOUSE.lng,
      corridor: `${fallbackDistrict} Güzergahı`,
    };

  const getAnchorForPosition = (pos: number): TextNeighborhoodAnchor => {
    if (anchors.length === 0) return defaultAnchor;
    // Kendinden önce gelen en yakın mahalleyi seç; eğer kendinden önce yoksa ilk mahalleyi seç
    let chosen = anchors[0];
    for (const a of anchors) {
      if (a.index <= pos + 3) {
        chosen = a;
      } else {
        break;
      }
    }
    return chosen;
  };

  // 5. Ada ve Parsel eşleşmelerini çıkarmak için Esas No, Karar No ve Tarihleri maskele
  let maskedText = cleanedText
    // Esas / Karar numaraları (Örn: 2026/145 E., 2025/12 K.)
    .replace(/\b20\d{2}\s*\/\s*\d+\s*(?:E\.?|K\.?|Esas|Karar|D\.?\s*İş)?\b/gi, (m) =>
      " ".repeat(m.length)
    )
    // Tarihler (Örn: 14.05.2026 veya 14/05/2026)
    .replace(/\b\d{1,2}[./]\d{1,2}[./]20\d{2}\b/g, (m) => " ".repeat(m.length))
    // 3402 S.Y. 22/A veya 2/B gibi yasa maddeleri
    .replace(/\b(?:22\s*\/\s*A|2\s*\/\s*B)\b/gi, (m) => " ".repeat(m.length));

  const extractedRaw: {
    pos: number;
    adaNo: string;
    parselNo: string;
    bagimsizBolumNo?: string;
  }[] = [];

  const maskRange = (start: number, length: number) => {
    maskedText =
      maskedText.slice(0, start) +
      " ".repeat(length) +
      maskedText.slice(start + length);
  };

  const splitParcelListTokens = (rawListStr: string): string[] => {
    return rawListStr
      .split(/(?:,|;|\s+ve\s+|\s+ile\s+|\s*-\s*|\s+)/i)
      .map((s) => s.replace(/[^\d]/g, "").trim())
      .filter((s) => s.length > 0 && Number(s) > 0);
  };

  // KURAL 1: "<Ada> ada <Parsel1, Parsel2...> parsel(ler)" (Örn: "101 ada 1, 2 ve 5 parsel" veya "137 ada, 13 nolu parsel")
  const patternAdaSuffixParsel =
    /\b(\d+)\s*(?:nolu\s+|numaralı\s+|no'?lu\s+)?ada\b[\s,:-]*((?:\d+(?:\s*(?:,|;|-|\bve\b|\bile\b)\s*)?)+)\s*(?:nolu\s+|numaralı\s+|no'?lu\s+|sayılı\s+)?parsel(?:ler|de|in|i|e)?\b/gi;
  let m1: RegExpExecArray | null;
  while ((m1 = patternAdaSuffixParsel.exec(maskedText)) !== null) {
    const ada = m1[1].trim();
    const pTokens = splitParcelListTokens(m1[2]);
    for (const p of pTokens) {
      extractedRaw.push({
        pos: m1.index,
        adaNo: ada,
        parselNo: p,
        bagimsizBolumNo: globalBagimsizBolum,
      });
    }
    maskRange(m1.index, m1[0].length);
  }

  // KURAL 2: "Ada (No): <Ada> [,] Parsel (No): <Parsel1, Parsel2...>" (UYAP / Tapu tablo formatı)
  const patternPrefixAdaParsel =
    /\bada\s*(?:no|numarası)?\s*[:.\-]?\s*(\d+)[\s,;/-]+parsel\s*(?:no|numarası)?\s*[:.\-]?\s*(\d+(?:\s*(?:,|;|-|\bve\b)\s*\d+)*)/gi;
  let m2: RegExpExecArray | null;
  while ((m2 = patternPrefixAdaParsel.exec(maskedText)) !== null) {
    const ada = m2[1].trim();
    const pTokens = splitParcelListTokens(m2[2]);
    for (const p of pTokens) {
      extractedRaw.push({
        pos: m2.index,
        adaNo: ada,
        parselNo: p,
        bagimsizBolumNo: globalBagimsizBolum,
      });
    }
    maskRange(m2.index, m2[0].length);
  }

  // KURAL 3: Ters sıra "<Parsel> parsel <Ada> ada" veya "Parsel No: <Parsel> Ada No: <Ada>"
  const patternReverseParselAda =
    /\b(\d+)\s*(?:nolu\s+|numaralı\s+)?parsel\b[\s,:-]*(\d+)\s*(?:nolu\s+|numaralı\s+)?ada\b/gi;
  let m3: RegExpExecArray | null;
  while ((m3 = patternReverseParselAda.exec(maskedText)) !== null) {
    extractedRaw.push({
      pos: m3.index,
      adaNo: m3[2].trim(),
      parselNo: m3[1].trim(),
      bagimsizBolumNo: globalBagimsizBolum,
    });
    maskRange(m3.index, m3[0].length);
  }

  // KURAL 4: Eğik çizgi formatı "<Ada>/<Parsel>" veya "<Ada>/<Parsel1>-<Parsel2>" (Örn: "137/13", "101/1, 101/2", "105/4-5")
  const patternSlash = /\b(\d{1,5})\s*\/\s*(\d{1,5}(?:\s*-\s*\d{1,5})*)\b/g;
  let m4: RegExpExecArray | null;
  while ((m4 = patternSlash.exec(maskedText)) !== null) {
    const ada = m4[1].trim();
    const pTokens = splitParcelListTokens(m4[2]);
    for (const p of pTokens) {
      extractedRaw.push({
        pos: m4.index,
        adaNo: ada,
        parselNo: p,
        bagimsizBolumNo: globalBagimsizBolum,
      });
    }
    maskRange(m4.index, m4[0].length);
  }

  // KURAL 5: Sadece Parsel (Adasız / Eski Kadastro 0 Ada: Örn: "412 parsel", "412 ve 415 parsel", "Parsel No: 412")
  const patternParselOnlySuffix =
    /\b((?:\d+(?:\s*(?:,|;|-|\bve\b|\bile\b)\s*)?)+)\s*(?:nolu\s+|numaralı\s+|no'?lu\s+|sayılı\s+)?parsel(?:ler|de|in|i|e)?\b/gi;
  let m5: RegExpExecArray | null;
  while ((m5 = patternParselOnlySuffix.exec(maskedText)) !== null) {
    const pTokens = splitParcelListTokens(m5[1]);
    for (const p of pTokens) {
      extractedRaw.push({
        pos: m5.index,
        adaNo: "0",
        parselNo: p,
        bagimsizBolumNo: globalBagimsizBolum,
      });
    }
    maskRange(m5.index, m5[0].length);
  }

  const patternParselOnlyPrefix =
    /\bparsel\s*(?:no|numarası)?\s*[:.\-]?\s*(\d+(?:\s*(?:,|;|-|\bve\b)\s*\d+)*)/gi;
  let m6: RegExpExecArray | null;
  while ((m6 = patternParselOnlyPrefix.exec(maskedText)) !== null) {
    const pTokens = splitParcelListTokens(m6[1]);
    for (const p of pTokens) {
      extractedRaw.push({
        pos: m6.index,
        adaNo: "0",
        parselNo: p,
        bagimsizBolumNo: globalBagimsizBolum,
      });
    }
    maskRange(m6.index, m6[0].length);
  }

  // Pozisyona göre sırala ve mükerrerleri ayıkla
  extractedRaw.sort((a, b) => a.pos - b.pos);

  const uniqueParcels: ParsedParcelCandidate[] = [];
  for (const raw of extractedRaw) {
    const anchor = getAnchorForPosition(raw.pos);
    const dup = uniqueParcels.some(
      (u) =>
        u.district === anchor.district &&
        normalizeMahalleKey(u.neighborhood) ===
          normalizeMahalleKey(anchor.neighborhood) &&
        u.adaNo === raw.adaNo &&
        u.parselNo === raw.parselNo
    );
    if (!dup) {
      uniqueParcels.push({
        district: anchor.district,
        neighborhood: anchor.neighborhood,
        tkgmMahalleId: anchor.tkgmMahalleId,
        baseLat: anchor.lat,
        baseLng: anchor.lng,
        corridor: anchor.corridor,
        adaNo: raw.adaNo,
        parselNo: raw.parselNo,
        bagimsizBolumNo: raw.bagimsizBolumNo,
      });
    }
  }

  const primaryAnchor = anchors[0] || (uniqueParcels.length > 0 ? defaultAnchor : undefined);

  return {
    detectedEsasNo,
    detectedDistrict: primaryAnchor?.district,
    detectedNeighborhood: primaryAnchor?.neighborhood,
    detectedTkgmMahalleId: primaryAnchor?.tkgmMahalleId,
    detectedBagimsizBolumNo: globalBagimsizBolum,
    parcels: uniqueParcels,
  };
}


