import React, { useState, useMemo, useEffect } from "react";
import {
  Sparkles,
  Plus,
  Trash2,
  Route,
  Calendar as CalendarIcon,
  MapPin,
  Navigation,
  CheckCircle2,
  Layers,
  ArrowRight,
  FileText,
  Clock,
  Compass,
} from "lucide-react";
import {
  CourtDistrict,
  InspectionRecord,
  ParcelBoundarySource,
  ParcelItem,
} from "../types";
import {
  CASE_TYPES,
  DISTRICTS,
  FATSA_COURTHOUSE,
  FATSA_NEIGHBORHOODS,
} from "../data/fatsaData";
import {
  resolveTkgmMahalle,
  TKGM_MAHALLE_LIST,
} from "../data/tkgmMahalleData";
import {
  calculateOSRMRoute,
  formatAreaM2,
  formatDateTR,
  formatLongDateTR,
  calculateHaversineKm,
  queryParcelBoundary,
} from "../services/geoService";
import { InteractiveMap } from "./InteractiveMap";

export interface RouteCandidateItem {
  id: string;
  esasNo: string;
  district: CourtDistrict;
  neighborhood: string;
  tkgmMahalleId?: number;
  adaNo?: string;
  parselNo?: string;
  nitelik?: string;
  yuzolcumuM2?: number;
  paftaNo?: string;
  addressDetail?: string;
  lat: number;
  lng: number;
  corridor: string;
  distanceKm: number;
  durationMin: number;
  caseType: string;
  parcelPolygon?: [number, number][];
  parcelSource?: ParcelBoundarySource;
  parcels?: ParcelItem[];
}

export interface RecommendedDayCluster {
  clusterId: string;
  recommendedDate: string;
  formattedDate: string;
  corridorTitle: string;
  districts: CourtDistrict[];
  isMergedWithExistingDay: boolean;
  existingDayRecords: InspectionRecord[];
  orderedStops: (RouteCandidateItem & {
    recommendedTime: string;
    stopOrder: number;
    legDistanceKm: number;
  })[];
  standaloneRoundTripKm: number;
  optimizedRoundTripKm: number;
  savedKm: number;
  totalDurationMin: number;
  googleMapsUrl: string;
  aiDayAdvice: string;
}

interface MultiRouteAdvisorViewProps {
  existingInspections: InspectionRecord[];
  defaultExpertsText: string;
  createdByLabel: string;
  deviceType: "pc" | "mobile" | "tablet";
  onAddRecordsBatch: (newRecords: InspectionRecord[]) => void;
  onSwitchToAgenda: () => void;
}

function getNextAvailableWorkDates(
  existingDates: Set<string>,
  count: number
): string[] {
  const result: string[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1);

  while (result.length < count) {
    const dayOfWeek = cursor.getDay(); // 0 = Sun, 6 = Sat
    const yyyy = cursor.getFullYear();
    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getDate()).padStart(2, "0");
    const iso = `${yyyy}-${mm}-${dd}`;

    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !existingDates.has(iso)) {
      result.push(iso);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function addMinutesToTime(baseTime: string, minutesToAdd: number): string {
  const [hh, mm] = baseTime.split(":").map(Number);
  const total = (hh || 13) * 60 + (mm || 0) + minutesToAdd;
  const nextH = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const nextM = String(total % 60).padStart(2, "0");
  return `${nextH}:${nextM}`;
}

export const MultiRouteAdvisorView: React.FC<MultiRouteAdvisorViewProps> = ({
  existingInspections,
  defaultExpertsText,
  createdByLabel,
  deviceType,
  onAddRecordsBatch,
  onSwitchToAgenda,
}) => {
  // Tekli/Çoklu Ekleme Form State
  const [district, setDistrict] = useState<CourtDistrict>("Fatsa");
  const [neighborhood, setNeighborhood] = useState<string>("Ilıca Mahallesi");
  const [adaInput, setAdaInput] = useState<string>("");
  const [parselInput, setParselInput] = useState<string>("");
  const [esasInput, setEsasInput] = useState<string>("");
  const [caseTypeInput, setCaseTypeInput] = useState<string>(CASE_TYPES[0]);
  const [baseStartTime, setBaseStartTime] = useState<string>("13:00");
  const [maxStopsPerDay, setMaxStopsPerDay] = useState<number>(4);

  // Serbest Metin Toplu Giriş State
  const [bulkText, setBulkText] = useState<string>("");
  const [isAddingItem, setIsAddingItem] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Kullanıcının Rota Havuzuna Eklediği Mahalle / Parsel Listesi
  const [candidates, setCandidates] = useState<RouteCandidateItem[]>([]);

  // Yapay Zeka Detaylı Analiz State
  const [aiSummaryText, setAiSummaryText] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [selectedClusterIdForMap, setSelectedClusterIdForMap] = useState<
    string | null
  >(null);
  const [clusterRouteGeometry, setClusterRouteGeometry] = useState<
    [number, number][]
  >([]);
  const [addedClusterIds, setAddedClusterIds] = useState<Set<string>>(
    new Set()
  );

  const districtNeighborhoods = useMemo(() => {
    return FATSA_NEIGHBORHOODS.filter((n) => n.district === district).sort(
      (a, b) => a.name.localeCompare(b.name, "tr-TR")
    );
  }, [district]);

  // Tekli veya Çoklu Parsel İle Rota Havuzuna Nokta Ekleme
  const handleAddCandidateFromForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!neighborhood.trim()) return;
    setIsAddingItem(true);
    setStatusBanner(null);

    try {
      const localN =
        FATSA_NEIGHBORHOODS.find(
          (n) =>
            n.district === district &&
            n.name.toLocaleLowerCase("tr-TR") ===
              neighborhood.trim().toLocaleLowerCase("tr-TR")
        ) ||
        FATSA_NEIGHBORHOODS.find(
          (n) =>
            n.district === district &&
            n.name
              .toLocaleLowerCase("tr-TR")
              .includes(
                neighborhood
                  .replace(" Mahallesi", "")
                  .trim()
                  .toLocaleLowerCase("tr-TR")
              )
        );

      const tkgmMah = resolveTkgmMahalle(district, neighborhood);
      const baseLat = localN?.lat || FATSA_COURTHOUSE.lat;
      const baseLng = localN?.lng || FATSA_COURTHOUSE.lng;
      const corridor = localN?.corridor || `${district} Güzergahı`;

      // Parsel numarası virgülle ayrılmış çoklu parsel olabilir (Örn: "1, 2, 5")
      const parselTokens = parselInput
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const parcelList: ParcelItem[] = [];
      let finalLat = baseLat;
      let finalLng = baseLng;
      let primaryPolygon: [number, number][] | undefined = undefined;
      let primaryArea: number | undefined = undefined;
      let primaryNitelik: string | undefined = undefined;
      let primaryPafta: string | undefined = undefined;
      let primarySource: ParcelBoundarySource | undefined = undefined;

      if (adaInput.trim() || parselTokens.length > 0) {
        const cleanAda = adaInput.trim() || "0";
        const tokensToQuery = parselTokens.length > 0 ? parselTokens : ["1"];

        for (let i = 0; i < tokensToQuery.length; i++) {
          const pNo = tokensToQuery[i];
          const res = await queryParcelBoundary({
            district,
            neighborhood,
            tkgmMahalleId: tkgmMah?.id,
            baseLat,
            baseLng,
            adaNo: cleanAda,
            parselNo: pNo,
            keepExactCenter: false,
          });
          if (i === 0) {
            finalLat = res.centerLat;
            finalLng = res.centerLng;
            primaryPolygon =
              res.polygon.length >= 3 ? res.polygon : undefined;
            primaryArea = res.areaM2;
            primaryNitelik = res.nitelik;
            primaryPafta = res.paftaNo;
            primarySource = res.source;
          }
          parcelList.push({
            id: `cand-p-${Date.now()}-${i}`,
            mahalleId: res.mahalleId || tkgmMah?.id,
            neighborhood,
            adaNo: res.adaNo || cleanAda,
            parselNo: res.parselNo || pNo,
            nitelik: res.nitelik,
            yuzolcumuM2: res.areaM2,
            paftaNo: res.paftaNo,
            mevkii: res.mevkii,
            centerLat: res.centerLat,
            centerLng: res.centerLng,
            polygon: res.polygon.length >= 3 ? res.polygon : undefined,
            source: res.source,
          });
        }
      }

      const osrm = await calculateOSRMRoute([
        { lat: FATSA_COURTHOUSE.lat, lng: FATSA_COURTHOUSE.lng },
        { lat: finalLat, lng: finalLng },
      ]);

      const newCandidate: RouteCandidateItem = {
        id: `cand-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        esasNo:
          esasInput.trim() ||
          `2026/${100 + candidates.length + 1} E.`,
        district,
        neighborhood: localN?.name || neighborhood.trim(),
        tkgmMahalleId: tkgmMah?.id,
        adaNo: parcelList[0]?.adaNo || adaInput.trim() || undefined,
        parselNo:
          parcelList.length > 1
            ? parcelList.map((p) => p.parselNo).join(", ")
            : parcelList[0]?.parselNo || parselInput.trim() || undefined,
        nitelik: primaryNitelik,
        yuzolcumuM2:
          parcelList.reduce((acc, p) => acc + (p.yuzolcumuM2 || 0), 0) ||
          primaryArea,
        paftaNo: primaryPafta,
        lat: finalLat,
        lng: finalLng,
        corridor,
        distanceKm: osrm.distanceKm,
        durationMin: osrm.durationMin,
        caseType: caseTypeInput,
        parcelPolygon: primaryPolygon,
        parcelSource: primarySource,
        parcels: parcelList.length > 0 ? parcelList : undefined,
      };

      setCandidates((prev) => [...prev, newCandidate]);
      setAdaInput("");
      setParselInput("");
      setEsasInput("");
      setStatusBanner(
        `✓ [${newCandidate.district}] ${newCandidate.neighborhood}${
          newCandidate.adaNo
            ? ` (${newCandidate.adaNo} Ada / ${newCandidate.parselNo} Parsel)`
            : ""
        } rota havuzuna eklendi.`
      );
    } finally {
      setIsAddingItem(false);
    }
  };

  // Serbest Metin (Çoklu Satır Mahalle / Ada / Parsel) Çözümleyici
  const handleParseBulkText = async () => {
    const rawLines = bulkText
      .split(/\r?\n|;/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (rawLines.length === 0) return;

    setIsAddingItem(true);
    setStatusBanner(null);

    try {
      const addedItems: RouteCandidateItem[] = [];

      for (let idx = 0; idx < rawLines.length; idx++) {
        const line = rawLines[idx];
        const lower = line.toLocaleLowerCase("tr-TR");

        // 1. İlçe tespiti
        let detectedDistrict: CourtDistrict = district;
        if (lower.includes("çamaş") || lower.includes("camas")) {
          detectedDistrict = "Çamaş";
        } else if (
          lower.includes("çatalpınar") ||
          lower.includes("catalpinar")
        ) {
          detectedDistrict = "Çatalpınar";
        } else if (lower.includes("fatsa")) {
          detectedDistrict = "Fatsa";
        }

        // 2. Mahalle tespiti (FATSA_NEIGHBORHOODS veya TKGM_MAHALLE_LIST)
        let matchedNeigh = FATSA_NEIGHBORHOODS.find((n) => {
          const cleanName = n.name
            .replace(/\s*\(.*?\)\s*/g, "")
            .replace(/\s*Mahallesi/i, "")
            .trim()
            .toLocaleLowerCase("tr-TR");
          return cleanName.length >= 3 && lower.includes(cleanName);
        });

        let matchedTkgm = TKGM_MAHALLE_LIST.find((m) => {
          const cleanM = m.text.trim().toLocaleLowerCase("tr-TR");
          return cleanM.length >= 3 && lower.includes(cleanM);
        });

        if (matchedNeigh) {
          detectedDistrict = matchedNeigh.district;
        } else if (matchedTkgm) {
          detectedDistrict = matchedTkgm.district;
          matchedNeigh = FATSA_NEIGHBORHOODS.find(
            (n) =>
              n.district === matchedTkgm!.district &&
              n.name
                .toLocaleLowerCase("tr-TR")
                .startsWith(matchedTkgm!.text.toLocaleLowerCase("tr-TR"))
          );
        }

        const neighName =
          matchedNeigh?.name ||
          (matchedTkgm ? `${matchedTkgm.text} Mahallesi` : line.split(/\d/)[0]?.trim() || "Merkez Mahallesi");

        const tkgmResolved =
          matchedTkgm || resolveTkgmMahalle(detectedDistrict, neighName);

        // 3. Esas No tespiti (Örn: 2026/145)
        const esasMatch = line.match(/(20\d{2}\/\d+\s*(?:E\.?)?)/i);
        const extractedEsas = esasMatch
          ? esasMatch[1].trim()
          : `2026/${200 + candidates.length + idx + 1} E.`;

        // 4. Ada / Parsel tespiti (Örn: "101 ada 5 parsel" veya "101/5")
        const withoutEsas = line.replace(/20\d{2}\/\d+\s*(?:E\.?)?/gi, " ");
        let extractedAda: string | undefined;
        let extractedParsel: string | undefined;

        const adaParselWordMatch = withoutEsas.match(
          /(\d+)\s*ada\s*(\d+(?:\s*,\s*\d+)*)\s*parsel/i
        );
        const slashMatch = withoutEsas.match(/(\d+)\s*\/\s*(\d+)/);
        const parselOnlyMatch = withoutEsas.match(/(\d+)\s*parsel/i);

        if (adaParselWordMatch) {
          extractedAda = adaParselWordMatch[1];
          extractedParsel = adaParselWordMatch[2];
        } else if (slashMatch) {
          extractedAda = slashMatch[1];
          extractedParsel = slashMatch[2];
        } else if (parselOnlyMatch) {
          extractedAda = "0";
          extractedParsel = parselOnlyMatch[1];
        }

        const baseLat = matchedNeigh?.lat || FATSA_COURTHOUSE.lat;
        const baseLng = matchedNeigh?.lng || FATSA_COURTHOUSE.lng;
        let finalLat = baseLat;
        let finalLng = baseLng;
        let poly: [number, number][] | undefined;
        let areaM2: number | undefined;
        let nitelikStr: string | undefined;
        let sourceType: ParcelBoundarySource | undefined;
        const pItems: ParcelItem[] = [];

        if (extractedAda && extractedParsel) {
          const firstParsel = extractedParsel.split(",")[0].trim();
          const res = await queryParcelBoundary({
            district: detectedDistrict,
            neighborhood: neighName,
            tkgmMahalleId: tkgmResolved?.id,
            baseLat,
            baseLng,
            adaNo: extractedAda,
            parselNo: firstParsel,
            keepExactCenter: false,
          });
          finalLat = res.centerLat;
          finalLng = res.centerLng;
          poly = res.polygon.length >= 3 ? res.polygon : undefined;
          areaM2 = res.areaM2;
          nitelikStr = res.nitelik;
          sourceType = res.source;
          pItems.push({
            id: `bulk-p-${Date.now()}-${idx}`,
            mahalleId: res.mahalleId || tkgmResolved?.id,
            neighborhood: neighName,
            adaNo: extractedAda,
            parselNo: firstParsel,
            nitelik: res.nitelik,
            yuzolcumuM2: res.areaM2,
            paftaNo: res.paftaNo,
            centerLat: res.centerLat,
            centerLng: res.centerLng,
            polygon: poly,
            source: res.source,
          });
        }


        const osrm = await calculateOSRMRoute([
          { lat: FATSA_COURTHOUSE.lat, lng: FATSA_COURTHOUSE.lng },
          { lat: finalLat, lng: finalLng },
        ]);

        addedItems.push({
          id: `cand-bulk-${Date.now()}-${idx}`,
          esasNo: extractedEsas,
          district: detectedDistrict,
          neighborhood: neighName,
          tkgmMahalleId: tkgmResolved?.id,
          adaNo: extractedAda,
          parselNo: extractedParsel,
          nitelik: nitelikStr,
          yuzolcumuM2: areaM2,
          lat: finalLat,
          lng: finalLng,
          corridor: matchedNeigh?.corridor || `${detectedDistrict} Hattı`,
          distanceKm: osrm.distanceKm,
          durationMin: osrm.durationMin,
          caseType: caseTypeInput,
          parcelPolygon: poly,
          parcelSource: sourceType,
          parcels: pItems.length > 0 ? pItems : undefined,
        });
      }

      setCandidates((prev) => [...prev, ...addedItems]);
      setBulkText("");
      setStatusBanner(
        `✓ Metindeki ${addedItems.length} adet mahalle/parsel çözümlenerek rota havuzuna eklendi.`
      );
    } finally {
      setIsAddingItem(false);
    }
  };

  // Hızlı Mahalle Çipiyle Ekleme
  const handleQuickAddNeighborhood = async (
    n: (typeof FATSA_NEIGHBORHOODS)[number]
  ) => {
    const tkgmMah = resolveTkgmMahalle(n.district, n.name);
    const newItem: RouteCandidateItem = {
      id: `cand-quick-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      esasNo: `2026/${100 + candidates.length + 1} E.`,
      district: n.district,
      neighborhood: n.name,
      tkgmMahalleId: tkgmMah?.id,
      lat: n.lat,
      lng: n.lng,
      corridor: n.corridor,
      distanceKm: n.avgDistanceKm,
      durationMin: n.avgDurationMin,
      caseType: caseTypeInput,
    };
    setCandidates((prev) => [...prev, newItem]);
  };

  // ============================================================================
  // COĞRAFİ KORİDOR KÜMELEME, MEVCUT KEŞİF GÜNLERİYLE EŞLEŞTİRME & ROTA MOTORU
  // ============================================================================
  const recommendedClusters = useMemo<RecommendedDayCluster[]>(() => {
    if (candidates.length === 0) return [];

    // 1. Adayları coğrafi yakınlık (<= 8 km) veya aynı koridora göre grupla
    const rawGroups: RouteCandidateItem[][] = [];

    for (const item of candidates) {
      let placed = false;
      for (const group of rawGroups) {
        if (group.length >= maxStopsPerDay) continue;
        const first = group[0];
        const sameCorridor = first.corridor === item.corridor;
        const minDistanceInGroup = Math.min(
          ...group.map((g) => calculateHaversineKm(g.lat, g.lng, item.lat, item.lng))
        );
        if (sameCorridor || minDistanceInGroup <= 7.8) {
          group.push(item);
          placed = true;
          break;
        }
      }
      if (!placed) {
        rawGroups.push([item]);
      }
    }

    // 2. Mevcut kayıtlı keşif günlerini analiz et
    const activeExisting = existingInspections.filter(
      (r) => r.status !== "iptal_edildi" && r.status !== "yapildi"
    );
    const existingByDate = new Map<string, InspectionRecord[]>();
    for (const rec of activeExisting) {
      const list = existingByDate.get(rec.date) || [];
      list.push(rec);
      existingByDate.set(rec.date, list);
    }

    const usedDates = new Set<string>(Array.from(existingByDate.keys()));
    const availableNewDates = getNextAvailableWorkDates(
      usedDates,
      rawGroups.length + 5
    );
    let newDateCursor = 0;

    return rawGroups.map((group, gIdx) => {
      // Fatsa Adliyesi'ne en yakından en uzağa doğru (veya komşu zinciriyle) sırala
      const sorted = [...group].sort((a, b) => a.distanceKm - b.distanceKm);

      // Bu koridorla eşleşen mevcut bir keşif günü var mı?
      let matchedExistingDate: string | null = null;
      let matchedExistingRecords: InspectionRecord[] = [];

      for (const [extDate, extRecords] of existingByDate.entries()) {
        if (extRecords.length + sorted.length > maxStopsPerDay + 1) continue;
        const hasNearbyOrSameCorridor = extRecords.some((er) => {
          if (er.corridor === sorted[0].corridor) return true;
          const dist = calculateHaversineKm(
            er.lat,
            er.lng,
            sorted[0].lat,
            sorted[0].lng
          );
          return dist <= 8.5;
        });
        if (hasNearbyOrSameCorridor) {
          matchedExistingDate = extDate;
          matchedExistingRecords = extRecords.sort((a, b) =>
            a.time.localeCompare(b.time)
          );
          break;
        }
      }

      const assignedDate =
        matchedExistingDate ||
        availableNewDates[newDateCursor++] ||
        new Date().toISOString().split("T")[0];

      // Başlangıç saatini belirle (Mevcut günle birleşiyorsa son keşiften 45 dk sonrası, yeni günse baseStartTime)
      let startClock = baseStartTime || "13:00";
      if (matchedExistingRecords.length > 0) {
        const lastExistingTime =
          matchedExistingRecords[matchedExistingRecords.length - 1].time ||
          "13:00";
        startClock = addMinutesToTime(lastExistingTime, 45);
      }

      let prevLat = FATSA_COURTHOUSE.lat;
      let prevLng = FATSA_COURTHOUSE.lng;
      if (matchedExistingRecords.length > 0) {
        const lastRec =
          matchedExistingRecords[matchedExistingRecords.length - 1];
        prevLat = lastRec.lat;
        prevLng = lastRec.lng;
      }

      const orderedStops = sorted.map((stop, sIdx) => {
        const legStraight = calculateHaversineKm(
          prevLat,
          prevLng,
          stop.lat,
          stop.lng
        );
        const legRoadKm =
          sIdx === 0 && matchedExistingRecords.length === 0
            ? stop.distanceKm
            : Number((legStraight * 1.35).toFixed(1));
        prevLat = stop.lat;
        prevLng = stop.lng;

        return {
          ...stop,
          stopOrder: matchedExistingRecords.length + sIdx + 1,
          recommendedTime: addMinutesToTime(startClock, sIdx * 45),
          legDistanceKm: legRoadKm,
        };
      });

      const standaloneRoundTripKm = Number(
        sorted.reduce((acc, s) => acc + s.distanceKm * 2, 0).toFixed(1)
      );
      const maxDist = Math.max(...sorted.map((s) => s.distanceKm), 0);
      const interLegs = orderedStops
        .slice(1)
        .reduce((acc, s) => acc + s.legDistanceKm, 0);
      const optimizedRoundTripKm = Number((maxDist * 2 + interLegs).toFixed(1));
      const savedKm = Math.max(
        0,
        Number((standaloneRoundTripKm - optimizedRoundTripKm).toFixed(1))
      );
      const totalDurationMin = Math.round(
        Math.max(...sorted.map((s) => s.durationMin), 0) * 2 +
          orderedStops.length * 12
      );

      const distinctDistricts = Array.from(
        new Set(sorted.map((s) => s.district))
      ) as CourtDistrict[];
      const distinctCorridors = Array.from(
        new Set(sorted.map((s) => s.corridor))
      );
      const corridorTitle = distinctCorridors.join(" & ");

      const allWaypoints = [
        `${FATSA_COURTHOUSE.lat},${FATSA_COURTHOUSE.lng}`,
        ...matchedExistingRecords.map((r) => `${r.lat},${r.lng}`),
        ...orderedStops.map((s) => `${s.lat},${s.lng}`),
        `${FATSA_COURTHOUSE.lat},${FATSA_COURTHOUSE.lng}`,
      ].join("/");
      const googleMapsUrl = `https://www.google.com/maps/dir/${allWaypoints}`;

      const stopSummaryStr = orderedStops
        .map(
          (s) =>
            `${s.recommendedTime} ${s.neighborhood.replace(" Mahallesi", "")}${
              s.adaNo ? ` (${s.adaNo}/${s.parselNo})` : ""
            }`
        )
        .join(" → ");

      const aiDayAdvice = matchedExistingDate
        ? `Mevcut keşif takviminizde ${formatLongDateTR(
            matchedExistingDate
          )} günü aynı güzergahta (${matchedExistingRecords
            .map((r) => `${r.neighborhood} - ${r.esasNo}`)
            .join(
              ", "
            )}) kayıtlı keşfiniz bulunduğu tespit edildi. Yeni girdiğiniz ${
            orderedStops.length
          } taşınmazı bu güne ekleyerek (${stopSummaryStr}) ikinci kez araç ve bilirkişi çıkarmadan ~${savedKm} km yol tasarrufu sağlayabilirsiniz.`
        : `${corridorTitle} hattındaki ${
            orderedStops.length
          } nokta birbirine yakın olduğu için ${formatLongDateTR(
            assignedDate
          )} gününe gruplandı. Fatsa Adliyesi'nden çıkışla sırasıyla ${stopSummaryStr} rotası izlendiğinde ayrı ayrı gidilmesine kıyasla ~${savedKm} km tasarruf edilir.`;

      return {
        clusterId: `cluster-${gIdx + 1}-${assignedDate}`,
        recommendedDate: assignedDate,
        formattedDate: formatLongDateTR(assignedDate),
        corridorTitle,
        districts: distinctDistricts,
        isMergedWithExistingDay: Boolean(matchedExistingDate),
        existingDayRecords: matchedExistingRecords,
        orderedStops,
        standaloneRoundTripKm,
        optimizedRoundTripKm,
        savedKm,
        totalDurationMin,
        googleMapsUrl,
        aiDayAdvice,
      };
    });
  }, [candidates, existingInspections, maxStopsPerDay, baseStartTime]);

  const activeCluster = useMemo(() => {
    if (recommendedClusters.length === 0) return null;
    return (
      recommendedClusters.find((c) => c.clusterId === selectedClusterIdForMap) ||
      recommendedClusters[0]
    );
  }, [recommendedClusters, selectedClusterIdForMap]);

  // Seçili gün grubunun OSRM rota çizgisini hesapla
  useEffect(() => {
    let cancelled = false;
    async function loadRoute() {
      if (!activeCluster) {
        setClusterRouteGeometry([]);
        return;
      }
      const points = [
        { lat: FATSA_COURTHOUSE.lat, lng: FATSA_COURTHOUSE.lng },
        ...activeCluster.existingDayRecords.map((r) => ({
          lat: r.lat,
          lng: r.lng,
        })),
        ...activeCluster.orderedStops.map((s) => ({
          lat: s.lat,
          lng: s.lng,
        })),
      ];
      const res = await calculateOSRMRoute(points);
      if (!cancelled) {
        setClusterRouteGeometry(res.geometry);
      }
    }
    loadRoute();
    return () => {
      cancelled = true;
    };
  }, [activeCluster]);

  // Gemini AI Çoklu Mahalle & Gün Tavsiyesi İsteği
  const handleGenerateAiMultiAdvice = async () => {
    if (recommendedClusters.length === 0) return;
    setIsGeneratingAi(true);

    try {
      const payload = {
        candidates: candidates.map((c) => ({
          esasNo: c.esasNo,
          district: c.district,
          neighborhood: c.neighborhood,
          adaParsel: c.adaNo ? `${c.adaNo}/${c.parselNo || "1"}` : undefined,
          corridor: c.corridor,
          distanceKm: c.distanceKm,
        })),
        recommendedDays: recommendedClusters.map((cl) => ({
          date: cl.recommendedDate,
          formattedDate: cl.formattedDate,
          corridor: cl.corridorTitle,
          isMergedWithExistingDay: cl.isMergedWithExistingDay,
          existingFiles: cl.existingDayRecords.map(
            (r) => `${r.esasNo} (${r.neighborhood})`
          ),
          stops: cl.orderedStops.map(
            (s) =>
              `${s.recommendedTime} - [${s.district}] ${s.neighborhood}${
                s.adaNo ? ` (${s.adaNo}/${s.parselNo})` : ""
              }`
          ),
          savedKm: cl.savedKm,
        })),
        existingInspections: existingInspections.map((r) => ({
          date: r.date,
          time: r.time,
          district: r.district,
          neighborhood: r.neighborhood,
          corridor: r.corridor,
          esasNo: r.esasNo,
        })),
      };

      const response = await fetch("/api/ai-multi-route-advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.summary) {
          setAiSummaryText(data.summary);
          setIsGeneratingAi(false);
          return;
        }
      }
      throw new Error("Local fallback");
    } catch {
      // GitHub Pages statik çalışma ortamı veya çevrimdışı durum için detaylı akıllı rapor
      const totalSaved = recommendedClusters
        .reduce((acc, c) => acc + c.savedKm, 0)
        .toFixed(1);
      const lines = [
        `⚖️ FATSA ADLİYESİ AKILLI ROTA VE GÜN PLANLAMA RAPORU (${candidates.length} Taşınmaz / Mahalle · ${recommendedClusters.length} Keşif Günü):`,
        ``,
        ...recommendedClusters.map(
          (cl, idx) =>
            `${idx + 1}. GÜN ÖNERİSİ — ${cl.formattedDate} (${cl.corridorTitle}):\n` +
            `   • Durum: ${
              cl.isMergedWithExistingDay
                ? `Mevcut keşif gününüzle (${cl.existingDayRecords
                    .map((r) => r.esasNo)
                    .join(", ")}) birleştirildi.`
                : "Yeni keşif günü olarak planlandı."
            }\n` +
            `   • Önerilen Ziyaret Sırası: Fatsa Adliyesi Çıkış → ${cl.orderedStops
              .map(
                (s) =>
                  `Saat ${s.recommendedTime}: [${s.district}] ${s.neighborhood}${
                    s.adaNo ? ` (${s.adaNo} Ada / ${s.parselNo} Parsel)` : ""
                  }`
              )
              .join(" → ")} → Fatsa Adliyesi Dönüş.\n` +
            `   • Mesafe Avantajı: Toplam ~${cl.optimizedRoundTripKm} km (~${cl.totalDurationMin} dk sürüş, tekil gidişe göre ~${cl.savedKm} km tasarruf).`
        ),
        ``,
        `💡 Genel Tavsiye: Girdiğiniz tüm mahalle ve parsellerin önerilen ${recommendedClusters.length} gün planına göre icra edilmesi toplamda ~${totalSaved} km yol ve bilirkişi mesaisi tasarrufu sağlamaktadır.`,
      ];
      setAiSummaryText(lines.join("\n"));
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Önerilen Gün Grubunu Keşif Listesine (Ajandaya) Aktarma
  const handleSaveClusterToInspections = (cluster: RecommendedDayCluster) => {
    const recordsToCreate: InspectionRecord[] = cluster.orderedStops.map(
      (stop, idx) => ({
        id: `kesif-${Date.now()}-${idx}-${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        esasNo: stop.esasNo,
        district: stop.district,
        neighborhood: stop.neighborhood,
        tkgmMahalleId: stop.tkgmMahalleId,
        subjectType: "tasinmaz",
        adaNo: stop.adaNo,
        parselNo: stop.parselNo,
        nitelik: stop.nitelik,
        yuzolcumuM2: stop.yuzolcumuM2,
        paftaNo: stop.paftaNo,
        parcelPolygon: stop.parcelPolygon,
        parcelSource: stop.parcelSource,
        parcels: stop.parcels,
        addressDetail:
          stop.addressDetail ||
          (stop.adaNo
            ? `${stop.adaNo} Ada ${stop.parselNo || "1"} Parsel`
            : `${stop.neighborhood} Keşif Noktası`),
        lat: stop.lat,
        lng: stop.lng,
        date: cluster.recommendedDate,
        time: stop.recommendedTime,
        caseType: stop.caseType,
        experts: defaultExpertsText || "Fen Bilirkişisi + Ziraat Bilirkişisi",
        notes: `Yapay Zeka Rota & Gün Tavsiyesi ile planlandı (${cluster.corridorTitle}).`,
        distanceKm: stop.distanceKm,
        durationMin: stop.durationMin,
        corridor: stop.corridor,
        status: "planlandi",
        createdBy: createdByLabel,
        deviceType,
        createdAt: new Date().toISOString(),
      })
    );

    onAddRecordsBatch(recordsToCreate);
    setAddedClusterIds((prev) => new Set(prev).add(cluster.clusterId));
    setStatusBanner(
      `✓ ${cluster.formattedDate} günü için ${recordsToCreate.length} adet keşif dosyası Ajanda listenize kaydedildi!`
    );
  };

  const handleSaveAllClustersToInspections = () => {
    const remaining = recommendedClusters.filter(
      (c) => !addedClusterIds.has(c.clusterId)
    );
    if (remaining.length === 0) return;

    const allNewRecords: InspectionRecord[] = [];
    const nextAdded = new Set(addedClusterIds);

    remaining.forEach((cluster, cIdx) => {
      nextAdded.add(cluster.clusterId);
      cluster.orderedStops.forEach((stop, sIdx) => {
        allNewRecords.push({
          id: `kesif-${Date.now()}-${cIdx}-${sIdx}-${Math.random()
            .toString(36)
            .slice(2, 6)}`,
          esasNo: stop.esasNo,
          district: stop.district,
          neighborhood: stop.neighborhood,
          tkgmMahalleId: stop.tkgmMahalleId,
          subjectType: "tasinmaz",
          adaNo: stop.adaNo,
          parselNo: stop.parselNo,
          nitelik: stop.nitelik,
          yuzolcumuM2: stop.yuzolcumuM2,
          paftaNo: stop.paftaNo,
          parcelPolygon: stop.parcelPolygon,
          parcelSource: stop.parcelSource,
          parcels: stop.parcels,
          addressDetail:
            stop.addressDetail ||
            (stop.adaNo
              ? `${stop.adaNo} Ada ${stop.parselNo || "1"} Parsel`
              : `${stop.neighborhood} Keşif Noktası`),
          lat: stop.lat,
          lng: stop.lng,
          date: cluster.recommendedDate,
          time: stop.recommendedTime,
          caseType: stop.caseType,
          experts: defaultExpertsText || "Fen Bilirkişisi + Ziraat Bilirkişisi",
          notes: `Yapay Zeka Çoklu Rota & Gün Tavsiyesi ile planlandı (${cluster.corridorTitle}).`,
          distanceKm: stop.distanceKm,
          durationMin: stop.durationMin,
          corridor: stop.corridor,
          status: "planlandi",
          createdBy: createdByLabel,
          deviceType,
          createdAt: new Date().toISOString(),
        });
      });
    });

    onAddRecordsBatch(allNewRecords);
    setAddedClusterIds(nextAdded);
    setStatusBanner(
      `✓ Tüm önerilen plan (${allNewRecords.length} adet keşif dosyası) Ajanda ve Takvim listenize kaydedildi!`
    );
  };

  // Harita önizlemesi için seçili kümedeki noktaları InspectionRecord formatına dönüştür
  const mapPreviewRecords = useMemo<InspectionRecord[]>(() => {
    if (!activeCluster) return [];
    const fromExisting = activeCluster.existingDayRecords;
    const fromCandidates: InspectionRecord[] = activeCluster.orderedStops.map(
      (s) => ({
        id: s.id,
        esasNo: s.esasNo,
        district: s.district,
        neighborhood: s.neighborhood,
        tkgmMahalleId: s.tkgmMahalleId,
        adaNo: s.adaNo,
        parselNo: s.parselNo,
        nitelik: s.nitelik,
        yuzolcumuM2: s.yuzolcumuM2,
        parcelPolygon: s.parcelPolygon,
        parcelSource: s.parcelSource,
        parcels: s.parcels,
        addressDetail: `${s.stopOrder}. Durak (${s.recommendedTime})`,
        lat: s.lat,
        lng: s.lng,
        date: activeCluster.recommendedDate,
        time: s.recommendedTime,
        caseType: s.caseType,
        experts: defaultExpertsText,
        notes: "",
        distanceKm: s.distanceKm,
        durationMin: s.durationMin,
        corridor: s.corridor,
        status: "planlandi",
        createdAt: new Date().toISOString(),
      })
    );
    return [...fromExisting, ...fromCandidates];
  }, [activeCluster, defaultExpertsText]);

  return (
    <div className="space-y-5">
      {/* Üst Başlık ve Açıklama Kartı */}
      <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 p-4 sm:p-6 text-white shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/20 border border-emerald-400/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
              <span>AKILLI ÇOKLU MAHALLE & PARSEL ROTA PLANLAYICI</span>
            </div>
            <h1 className="text-base sm:text-xl font-bold tracking-tight text-white">
              Yapay Zeka Rota Önerisi & Günlere Göre Keşif Tavsiyesi
            </h1>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              Birden fazla mahalle adı, ada/parsel numarası veya dosya listesi girdiğinizde; sistem TKGM konumlarını ve Fatsa Adliyesi mesafelerini hesaplar, <strong>mevcut girdiğiniz keşif günleriyle karşılaştırır</strong> ve hangi dosyaların hangi gün ve sırayla gezilmesi gerektiğini tavsiye eder.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs">
              <span className="text-slate-400 block text-[10px]">
                MEVCUT KAYITLI KEŞİF
              </span>
              <span className="font-mono font-bold text-emerald-400">
                {existingInspections.length} Dosya (
                {new Set(existingInspections.map((r) => r.date)).size} Gün)
              </span>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs">
              <span className="text-slate-400 block text-[10px]">
                ROTA HAVUZUNDAKİ NOKTA
              </span>
              <span className="font-mono font-bold text-amber-400">
                {candidates.length} Mahalle / Parsel
              </span>
            </div>
          </div>
        </div>
      </div>

      {statusBanner && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-950">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{statusBanner}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSwitchToAgenda}
              className="rounded bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-800"
            >
              Ajandayı Gör &rarr;
            </button>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-emerald-800 hover:underline"
            >
              Kapat
            </button>
          </div>
        </div>
      )}

      {/* BÖLÜM 1: ÇOKLU MAHALLE & PARSEL GİRİŞ PANELLERİ */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
        {/* Sol 7 Sütun: Form ile Ekleme + Hızlı Mahalle Seçimi */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                1. Rota Havuzuna Mahalle ve Ada/Parsel Ekle
              </h2>
              <p className="text-xs text-slate-500">
                İstediğiniz kadar mahalle ve parsel ekleyin; sistem hepsini birlikte analiz edecektir
              </p>
            </div>
            {candidates.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setCandidates([]);
                  setAiSummaryText(null);
                  setAddedClusterIds(new Set());
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Havuzu Temizle ({candidates.length})</span>
              </button>
            )}
          </div>

          <form onSubmit={handleAddCandidateFromForm} className="space-y-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  İlçe
                </label>
                <select
                  value={district}
                  onChange={(e) => {
                    const nextD = e.target.value as CourtDistrict;
                    setDistrict(nextD);
                    const firstN = FATSA_NEIGHBORHOODS.find(
                      (n) => n.district === nextD
                    );
                    if (firstN) setNeighborhood(firstN.name);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                >
                  {DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-5">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Mahalle / Köy Adı ({district})
                </label>
                <select
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
                >
                  {districtNeighborhoods.map((n) => (
                    <option key={n.name} value={n.name}>
                      {n.name} ({n.corridor} · ~{n.avgDistanceKm} km)
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Ada No
                </label>
                <input
                  type="text"
                  value={adaInput}
                  onChange={(e) => setAdaInput(e.target.value)}
                  placeholder="Örn: 101"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Parsel (Çoklu: 1,2)
                </label>
                <input
                  type="text"
                  value={parselInput}
                  onChange={(e) => setParselInput(e.target.value)}
                  placeholder="Örn: 1, 5"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12 items-end">
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Esas No (İsteğe Bağlı)
                </label>
                <input
                  type="text"
                  value={esasInput}
                  onChange={(e) => setEsasInput(e.target.value)}
                  placeholder="Örn: 2026/410 E."
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-5">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Dava / Keşif Türü
                </label>
                <select
                  value={caseTypeInput}
                  onChange={(e) => setCaseTypeInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                >
                  {CASE_TYPES.map((ct) => (
                    <option key={ct} value={ct}>
                      {ct}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-4">
                <button
                  type="submit"
                  disabled={isAddingItem}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  <span>
                    {isAddingItem
                      ? "TKGM & Konum Hesaplanıyor..."
                      : "+ Rota Havuzuna Ekle"}
                  </span>
                </button>
              </div>
            </div>
          </form>

          {/* Tek Tıkla Hızlı Mahalle Ekleme Çipleri */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="text-[11px] font-bold text-slate-700">
              ⚡ {district} İlçesi Hızlı Mahalle Ekle (Tıkladığınız Mahalle Anında Havuza Eklenir):
            </div>
            <div className="flex flex-wrap items-center gap-1.5 max-h-28 overflow-y-auto">
              {districtNeighborhoods.map((n) => (
                <button
                  key={n.name}
                  type="button"
                  onClick={() => handleQuickAddNeighborhood(n)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-950 transition-colors"
                >
                  <Plus className="h-3 w-3 text-emerald-600" />
                  <span>{n.name.replace(" Mahallesi", "")}</span>
                  <span className="font-mono text-[10px] text-slate-500">
                    ({n.avgDistanceKm}km)
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sağ 5 Sütun: Serbest Metin / Toplu Mahalle & Parsel Listesi Yapıştırma */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
          <div className="border-b border-slate-200 pb-2.5">
            <div className="flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-amber-600" />
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                2. Toplu Mahalle / Parsel Metni Yapıştır
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Her satıra bir mahalle adı, ada/parsel ve varsa esas numarası yazarak topluca çözümleyebilirsiniz
            </p>
          </div>

          <textarea
            rows={5}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`Örnek giriş (Her satıra bir yer):\nIlıca Mahallesi 2058 ada 1 parsel - 2026/145 E.\nİslamdağ Mahallesi 105/3\nBolaman Mahallesi 2830/1\nÇamaş Kocaman Mahallesi 1669/5`}
            className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <label className="font-semibold text-slate-700">
                Günlük Başlangıç:
              </label>
              <input
                type="time"
                value={baseStartTime}
                onChange={(e) => setBaseStartTime(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1 text-xs font-mono font-bold text-slate-900"
              />
              <label className="font-semibold text-slate-700 ml-1">
                Günlük Maks:
              </label>
              <select
                value={maxStopsPerDay}
                onChange={(e) => setMaxStopsPerDay(Number(e.target.value))}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-900"
              >
                <option value={3}>3 Keşif/Gün</option>
                <option value={4}>4 Keşif/Gün</option>
                <option value={5}>5 Keşif/Gün</option>
                <option value={6}>6 Keşif/Gün</option>
              </select>
            </div>

            <button
              type="button"
              disabled={isAddingItem || !bulkText.trim()}
              onClick={handleParseBulkText}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              <span>
                {isAddingItem
                  ? "Çözümleniyor..."
                  : "Metni Çözümle & Havuza Ekle"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* EKLENEN HAVUZ LİSTESİ ÇİPLERİ */}
      {candidates.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-amber-700" />
              <span className="text-xs sm:text-sm font-bold text-slate-900">
                Rota Havuzundaki Mahalle & Parseller ({candidates.length} Adet)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleGenerateAiMultiAdvice}
                disabled={isGeneratingAi}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>
                  {isGeneratingAi
                    ? "Yapay Zeka Rota & Gün Planı Hazırlıyor..."
                    : "✨ Yapay Zeka Detaylı Gün & Rota Yorumu Oluştur"}
                </span>
              </button>

              {recommendedClusters.length > 0 && (
                <button
                  type="button"
                  onClick={handleSaveAllClustersToInspections}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                >
                  <CalendarIcon className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Tüm Önerilen Günleri Ajandaya Kaydet</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {candidates.map((c, idx) => (
              <div
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs shadow-2xs"
              >
                <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
                  #{idx + 1}
                </span>
                <span className="font-bold text-emerald-900">
                  [{c.district}]
                </span>
                <span className="font-semibold text-slate-900">
                  {c.neighborhood.replace(" Mahallesi", "")}
                </span>
                {c.adaNo && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-900">
                    📐 {c.adaNo}/{c.parselNo || "1"}
                  </span>
                )}
                {c.yuzolcumuM2 && (
                  <span className="font-mono text-[10px] text-slate-500">
                    ({formatAreaM2(c.yuzolcumuM2)} m²)
                  </span>
                )}
                <span className="font-mono text-[11px] font-semibold text-emerald-700">
                  · {c.distanceKm} km
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCandidates((prev) => prev.filter((x) => x.id !== c.id))
                  }
                  className="ml-1 text-slate-400 hover:text-rose-600"
                  title="Havuzdan çıkar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BÖLÜM 2: YAPAY ZEKA GENEL DEĞERLENDİRME RAPORU */}
      {aiSummaryText && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-4 sm:p-5 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-emerald-950">
              <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                Yapay Zeka Çoklu Mahalle / Parsel Rota ve Gün Tavsiyesi Raporu
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAiSummaryText(null)}
              className="text-xs font-semibold text-emerald-800 hover:underline"
            >
              Gizle
            </button>
          </div>
          <div className="whitespace-pre-line rounded-lg border border-emerald-200 bg-white p-3.5 text-xs leading-relaxed text-slate-800">
            {aiSummaryText}
          </div>
        </div>
      )}

      {/* BÖLÜM 3: GÜNLERE GÖRE ÖNERİLEN ROTA KARTLARI VE HARİTA ÖNİZLEMESİ */}
      {recommendedClusters.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-2.5">
          <Compass className="mx-auto h-8 w-8 text-emerald-600" />
          <h3 className="text-sm sm:text-base font-bold text-slate-900">
            Rota ve Gün Tavsiyesi İçin Yukarıdan Mahalle veya Parsel Ekleyin
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Yukarıdaki listeden birden fazla mahalle seçebilir, ada/parsel numarası girebilir veya sağdaki kutuya toplu mahalle/parsel listesi yapıştırabilirsiniz.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
          {/* Sol 7 Sütun: Günlere Göre Gruplanmış Rota Kartları */}
          <div className="lg:col-span-7 space-y-4">
            {recommendedClusters.map((cluster, cIdx) => {
              const isSelectedOnMap =
                activeCluster?.clusterId === cluster.clusterId;
              const isAlreadySaved = addedClusterIds.has(cluster.clusterId);

              return (
                <div
                  key={cluster.clusterId}
                  className={`overflow-hidden rounded-xl border bg-white transition-all ${
                    isSelectedOnMap
                      ? "border-emerald-600 ring-2 ring-emerald-500/20"
                      : "border-slate-200"
                  }`}
                >
                  {/* Kart Başlığı */}
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-4 py-3 text-white">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-emerald-500 px-2 py-0.5 font-mono text-xs font-bold text-slate-950">
                        {cIdx + 1}. GÜN GRUBU
                      </span>
                      <span className="text-xs sm:text-sm font-bold">
                        {cluster.formattedDate}
                      </span>
                      {cluster.isMergedWithExistingDay ? (
                        <span className="rounded bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-slate-950">
                          🔗 Mevcut Keşif Gününüzle Birleştirildi
                        </span>
                      ) : (
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                          ✨ Yeni Önerilen Keşif Günü
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-emerald-400 font-bold">
                        ~{cluster.optimizedRoundTripKm} km
                      </span>
                      {cluster.savedKm > 0 && (
                        <span className="rounded bg-emerald-950 border border-emerald-500/40 px-1.5 py-0.5 text-[10px] text-emerald-300">
                          +{cluster.savedKm} km Tasarruf
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 space-y-3.5">
                    {/* Koridor ve Yapay Zeka Gerekçesi */}
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950 space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <Route className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                        <span>
                          Güzergah Koridoru: {cluster.corridorTitle} (
                          {cluster.districts.join(", ")})
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-700 leading-relaxed">
                        {cluster.aiDayAdvice}
                      </p>
                    </div>

                    {/* Eğer mevcut günle birleştiyse o gündeki mevcut dosyaları göster */}
                    {cluster.existingDayRecords.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-xs space-y-1">
                        <div className="font-bold text-amber-950 text-[11px]">
                          📌 Bu Günde Zaten Kayıtlı Olan Keşifleriniz:
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {cluster.existingDayRecords.map((er, idx) => (
                            <span
                              key={er.id}
                              className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-800"
                            >
                              <span className="font-mono font-bold text-amber-800">
                                {idx + 1}. Durak {er.time}
                              </span>
                              <span>· [{er.district}] {er.neighborhood}</span>
                              <span className="font-mono text-slate-500">
                                ({er.esasNo})
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sıralı Durak Listesi (Adliye Çıkışı -> Duraklar -> Dönüş) */}
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        Önerilen Ziyaret Sırası ve Saat Planı (Çıkış: Fatsa Adliyesi)
                      </div>

                      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/60">
                        {cluster.orderedStops.map((stop) => (
                          <div
                            key={stop.id}
                            className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-xs"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                                {stop.stopOrder}. Durak · {stop.recommendedTime}
                              </span>
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                                {stop.district}
                              </span>
                              <span className="font-bold text-slate-900">
                                {stop.neighborhood}
                              </span>
                              {stop.adaNo && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-900">
                                  📐 {stop.adaNo} Ada / {stop.parselNo || "1"}{" "}
                                  Parsel
                                </span>
                              )}
                              <span className="font-mono text-[11px] text-slate-500">
                                ({stop.esasNo})
                              </span>
                            </div>

                            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-700">
                              <span>Adliye: {stop.distanceKm} km</span>
                              <span className="text-emerald-700 font-semibold">
                                (~{stop.durationMin} dk)
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Aksiyon Butonları */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedClusterIdForMap(cluster.clusterId)
                          }
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                            isSelectedOnMap
                              ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Haritada Bu Rotayı Göster</span>
                        </button>

                        <a
                          href={cluster.googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Navigation className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Google Haritalar&rsquo;da Aç</span>
                        </a>
                      </div>

                      <button
                        type="button"
                        disabled={isAlreadySaved}
                        onClick={() => handleSaveClusterToInspections(cluster)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${
                          isAlreadySaved
                            ? "bg-emerald-100 text-emerald-900 cursor-default"
                            : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs"
                        }`}
                      >
                        {isAlreadySaved ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                            <span>Ajandaya Kaydedildi</span>
                          </>
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5" />
                            <span>
                              {formatDateTR(cluster.recommendedDate)} Gününe
                              Kaydet ({cluster.orderedStops.length} Dosya)
                            </span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sağ 5 Sütun: Seçili Günün Canlı Rota ve Parsel Haritası */}
          <div className="lg:col-span-5 sticky top-20 space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                    {activeCluster
                      ? `${activeCluster.formattedDate} Önerilen Rota Haritası`
                      : "Çoklu Mahalle & Parsel Rota Haritası"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {activeCluster
                      ? `${activeCluster.corridorTitle} · Gidiş-Dönüş ~${activeCluster.optimizedRoundTripKm} km`
                      : "Seçili gündeki duraklar ve parsel sınırları"}
                  </p>
                </div>
                {activeCluster && (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 font-mono text-xs font-bold text-emerald-800">
                    <Clock className="h-3.5 w-3.5" />
                    ~{activeCluster.totalDurationMin} dk
                  </span>
                )}
              </div>

              <InteractiveMap
                mode="overview"
                selectedLat={
                  activeCluster?.orderedStops[0]?.lat || FATSA_COURTHOUSE.lat
                }
                selectedLng={
                  activeCluster?.orderedStops[0]?.lng || FATSA_COURTHOUSE.lng
                }
                selectedLabel={
                  activeCluster?.corridorTitle || "Fatsa Adliyesi Merkez"
                }
                inspections={mapPreviewRecords}
                filterDate={activeCluster?.recommendedDate || null}
                dailyRouteGeometry={clusterRouteGeometry}
                heightClass="h-[380px] sm:h-[460px]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
