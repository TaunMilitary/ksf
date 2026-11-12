import React, { useMemo, useState } from "react";
import {
  BarChart3,
  Calendar as CalendarIcon,
  CheckCircle2,
  Compass,
  FileSpreadsheet,
  Layers,
  MapPin,
  Navigation,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import { CourtDistrict, InspectionRecord } from "../types";
import {
  computeUniqueParcelAreaSum,
  formatAdaParselLabel,
  formatAreaM2,
  formatDateTR,
} from "../services/geoService";

interface StatisticsDashboardViewProps {
  inspections: InspectionRecord[];
  onOpenExcelModalForMonth?: (yearMonth: string) => void;
  onSelectInspectionToEdit?: (record: InspectionRecord) => void;
}

interface BucketMetrics {
  key: string; // YYYY-MM (monthly) or YYYY-MM-DD (daily)
  label: string; // Örn: "Kasım 2026" veya "12 Kas Per"
  shortLabel: string; // Örn: "Kas '26" veya "12 Kas"
  totalFiles: number;
  completedFiles: number;
  plannedFiles: number;
  postponedFiles: number;
  uniqueParcelCount: number;
  totalParcelAndUnitItems: number;
  independentUnitCount: number;
  totalAreaM2: number;
  oneWayKm: number;
  roundTripRouteKm: number;
  totalDurationMin: number;
  activeDaysCount: number;
  records: InspectionRecord[];
}

const TURKISH_MONTH_NAMES = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

const TURKISH_SHORT_MONTH_NAMES = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
];

/**
 * Bir keşif kaydındaki benzersiz fiziki parsel sayısını, toplam parsel/bağımsız bölüm satır sayısını
 * ve bağımsız bölüm adedini hesaplar.
 */
function extractRecordParcelMetrics(rec: InspectionRecord): {
  uniqueParcels: number;
  totalItems: number;
  independentUnits: number;
  areaM2: number;
} {
  if (rec.subjectType === "arac" || rec.subjectType === "adres") {
    const hasBb = Boolean(rec.bagimsizBolumNo?.trim());
    return {
      uniqueParcels: 0,
      totalItems: 1,
      independentUnits: hasBb ? 1 : 0,
      areaM2: 0,
    };
  }

  if (rec.parcels && rec.parcels.length > 0) {
    const uniquePhysicalKeys = new Set<string>();
    let bbCount = 0;
    for (const p of rec.parcels) {
      const k = `${(p.neighborhood || rec.neighborhood || "")
        .trim()
        .toLocaleLowerCase("tr-TR")}__${(p.adaNo || "0").trim()}__${(
        p.parselNo || ""
      ).trim()}`;
      uniquePhysicalKeys.add(k);
      if (p.bagimsizBolumNo && p.bagimsizBolumNo.trim()) {
        bbCount++;
      }
    }
    const areaSum = computeUniqueParcelAreaSum(rec.parcels);
    return {
      uniqueParcels: uniquePhysicalKeys.size,
      totalItems: rec.parcels.length,
      independentUnits: bbCount,
      areaM2: areaSum > 0 ? areaSum : Number(rec.yuzolcumuM2) || 0,
    };
  }

  if (rec.adaNo || rec.parselNo) {
    return {
      uniqueParcels: 1,
      totalItems: 1,
      independentUnits: rec.bagimsizBolumNo?.trim() ? 1 : 0,
      areaM2: Number(rec.yuzolcumuM2) || 0,
    };
  }

  return {
    uniqueParcels: 1,
    totalItems: 1,
    independentUnits: rec.bagimsizBolumNo?.trim() ? 1 : 0,
    areaM2: Number(rec.yuzolcumuM2) || 0,
  };
}

/**
 * Aynı günde çıkılan keşifler için hem tek yön toplam km'yi hem de tahmini günlük güzergah (gidiş-dönüş) km'sini hesaplar.
 */
function calculateBucketMetrics(
  key: string,
  label: string,
  shortLabel: string,
  records: InspectionRecord[]
): BucketMetrics {
  let completedFiles = 0;
  let plannedFiles = 0;
  let postponedFiles = 0;
  let uniqueParcelCount = 0;
  let totalParcelAndUnitItems = 0;
  let independentUnitCount = 0;
  let totalAreaM2 = 0;
  let oneWayKm = 0;
  let totalDurationMin = 0;

  const byDateMap = new Map<string, InspectionRecord[]>();

  for (const r of records) {
    const st = r.status || "planlandi";
    if (st === "yapildi") completedFiles++;
    else if (st === "ertelendi") postponedFiles++;
    else plannedFiles++;

    const pm = extractRecordParcelMetrics(r);
    uniqueParcelCount += pm.uniqueParcels;
    totalParcelAndUnitItems += pm.totalItems;
    independentUnitCount += pm.independentUnits;
    totalAreaM2 += pm.areaM2;

    const dist = Number(r.distanceKm) || 0;
    const dur = Number(r.durationMin) || 0;
    oneWayKm += dist;
    totalDurationMin += dur;

    const dayList = byDateMap.get(r.date) || [];
    dayList.push(r);
    byDateMap.set(r.date, dayList);
  }

  // Günlük güzergah (Adliye çıkış -> duraklar -> Adliye dönüş) tahmini km hesabı:
  // Aynı günde birden fazla keşif varsa en uzak nokta gidiş-dönüş (2x maxDist) + ara durak geçişleri (diğerlerinin %35'i)
  let roundTripRouteKm = 0;
  for (const [, dayRecs] of byDateMap.entries()) {
    const dists = dayRecs
      .map((d) => Number(d.distanceKm) || 0)
      .sort((a, b) => b - a);
    if (dists.length === 1) {
      roundTripRouteKm += dists[0] * 2;
    } else if (dists.length > 1) {
      const maxD = dists[0];
      const restSum = dists.slice(1).reduce((s, v) => s + v, 0);
      roundTripRouteKm += maxD * 2 + restSum * 0.45;
    }
  }

  return {
    key,
    label,
    shortLabel,
    totalFiles: records.length,
    completedFiles,
    plannedFiles,
    postponedFiles,
    uniqueParcelCount,
    totalParcelAndUnitItems,
    independentUnitCount,
    totalAreaM2: Number(totalAreaM2.toFixed(2)),
    oneWayKm: Number(oneWayKm.toFixed(1)),
    roundTripRouteKm: Number(roundTripRouteKm.toFixed(1)),
    totalDurationMin: Math.round(totalDurationMin),
    activeDaysCount: byDateMap.size,
    records,
  };
}

export const StatisticsDashboardView: React.FC<StatisticsDashboardViewProps> = ({
  inspections,
  onOpenExcelModalForMonth,
  onSelectInspectionToEdit,
}) => {
  // Görünüm modu: Aylık İstatistik vs Günlük İstatistik
  const [granularity, setGranularity] = useState<"monthly" | "daily">("monthly");
  // Durum filtresi: Tümü | Sadece Yapılanlar | Sadece Planlananlar
  const [statusScope, setStatusScope] = useState<"all" | "yapildi" | "planlandi">(
    "all"
  );
  // İlçe filtresi
  const [districtFilter, setDistrictFilter] = useState<"Tümü" | CourtDistrict>(
    "Tümü"
  );

  // Aktif (iptal edilmemiş) keşif kayıtları
  const activeRecords = useMemo(() => {
    return inspections
      .filter((r) => r.status !== "iptal_edildi")
      .filter((r) => {
        if (districtFilter !== "Tümü" && r.district !== districtFilter) {
          return false;
        }
        if (statusScope === "yapildi") {
          return r.status === "yapildi";
        }
        if (statusScope === "planlandi") {
          return (r.status || "planlandi") === "planlandi";
        }
        return true;
      })
      .sort((a, b) => {
        const c = a.date.localeCompare(b.date);
        return c !== 0 ? c : a.time.localeCompare(b.time);
      });
  }, [inspections, districtFilter, statusScope]);

  // Mevcut tüm yıl-ay (YYYY-MM) listesi
  const availableYearMonths = useMemo(() => {
    const s = new Set<string>();
    for (const r of inspections) {
      if (r.status !== "iptal_edildi" && r.date && r.date.length >= 7) {
        s.add(r.date.slice(0, 7));
      }
    }
    const arr = Array.from(s).sort();
    if (arr.length === 0) {
      arr.push(new Date().toISOString().slice(0, 7));
    }
    return arr;
  }, [inspections]);

  // Mevcut yıllar
  const availableYears = useMemo(() => {
    const s = new Set<string>();
    for (const ym of availableYearMonths) {
      s.add(ym.slice(0, 4));
    }
    return Array.from(s).sort();
  }, [availableYearMonths]);

  const [selectedYear, setSelectedYear] = useState<string>(() => {
    return availableYears[availableYears.length - 1] || "2026";
  });

  const [selectedYearMonth, setSelectedYearMonth] = useState<string>(() => {
    // En çok kaydı olan veya son ayı varsayılan seç
    return availableYearMonths[availableYearMonths.length - 1] || "2026-11";
  });

  // Seçili bar / bucket detayı
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(
    null
  );

  // ============================================================================
  // 1. AYLIK İSTATİSTİK VERİLERİ (YILIN 12 AYI VEYA KAYITLI AYLAR)
  // ============================================================================
  const [showAllTwelveMonths, setShowAllTwelveMonths] =
    useState<boolean>(false);

  const monthlyBuckets = useMemo<BucketMetrics[]>(() => {
    const yearRecords =
      selectedYear === "ALL"
        ? activeRecords
        : activeRecords.filter((r) => r.date.startsWith(selectedYear));

    const map = new Map<string, InspectionRecord[]>();
    if (showAllTwelveMonths && selectedYear !== "ALL") {
      for (let m = 1; m <= 12; m++) {
        const ym = `${selectedYear}-${String(m).padStart(2, "0")}`;
        map.set(ym, []);
      }
    }

    for (const r of yearRecords) {
      const ym = r.date.slice(0, 7);
      const list = map.get(ym) || [];
      list.push(r);
      map.set(ym, list);
    }

    const sortedKeys = Array.from(map.keys()).sort();
    return sortedKeys.map((ym) => {
      const [yStr, mStr] = ym.split("-");
      const mIdx = Math.max(0, Math.min(11, Number(mStr) - 1));
      const label = `${TURKISH_MONTH_NAMES[mIdx]} ${yStr}`;
      const shortLabel = `${TURKISH_SHORT_MONTH_NAMES[mIdx]} '${yStr.slice(2)}`;
      return calculateBucketMetrics(ym, label, shortLabel, map.get(ym) || []);
    });
  }, [activeRecords, selectedYear, showAllTwelveMonths]);

  // ============================================================================
  // 2. GÜNLÜK İSTATİSTİK VERİLERİ (SEÇİLİ AYDAKİ GÜNLER VEYA TÜM KEŞİF GÜNLERİ)
  // ============================================================================
  const [dailyShowEmptyDays, setDailyShowEmptyDays] = useState<boolean>(false);

  const dailyBuckets = useMemo<BucketMetrics[]>(() => {
    const monthRecs =
      selectedYearMonth === "ALL"
        ? activeRecords
        : activeRecords.filter((r) => r.date.startsWith(selectedYearMonth));

    const map = new Map<string, InspectionRecord[]>();

    if (dailyShowEmptyDays && selectedYearMonth !== "ALL") {
      const [yNum, mNum] = selectedYearMonth.split("-").map(Number);
      const daysInMonth = new Date(yNum, mNum, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${selectedYearMonth}-${String(d).padStart(2, "0")}`;
        map.set(dateStr, []);
      }
    }

    for (const r of monthRecs) {
      const list = map.get(r.date) || [];
      list.push(r);
      map.set(r.date, list);
    }

    const sortedDates = Array.from(map.keys()).sort();
    return sortedDates.map((dStr) => {
      const [, mStr, dayStr] = dStr.split("-");
      const mIdx = Math.max(0, Math.min(11, Number(mStr) - 1));
      const dateObj = new Date(`${dStr}T12:00:00`);
      const dayNameShort = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString("tr-TR", { weekday: "short" })
        : "";
      const label = `${Number(dayStr)} ${TURKISH_MONTH_NAMES[mIdx]} (${dayNameShort})`;
      const shortLabel = `${Number(dayStr)} ${TURKISH_SHORT_MONTH_NAMES[mIdx]}`;
      return calculateBucketMetrics(
        dStr,
        label,
        shortLabel,
        map.get(dStr) || []
      );
    });
  }, [activeRecords, selectedYearMonth, dailyShowEmptyDays]);

  // Şu an aktif grafikte gösterilen veri dizisi (Aylık veya Günlük)
  const currentChartBuckets =
    granularity === "monthly" ? monthlyBuckets : dailyBuckets;

  // Genel Toplam Özet Metrikleri (Seçili görünüme göre)
  const summaryTotals = useMemo(() => {
    const allRecsInView = currentChartBuckets.flatMap((b) => b.records);
    return calculateBucketMetrics(
      "TOTAL",
      "Toplam",
      "Toplam",
      allRecsInView
    );
  }, [currentChartBuckets]);

  // Seçili bar veya varsayılan son dolu bar
  const focusedBucket = useMemo<BucketMetrics | null>(() => {
    if (selectedBucketKey) {
      const found = currentChartBuckets.find(
        (b) => b.key === selectedBucketKey
      );
      if (found) return found;
    }
    const nonEmpty = currentChartBuckets.filter((b) => b.totalFiles > 0);
    return nonEmpty[nonEmpty.length - 1] || currentChartBuckets[0] || null;
  }, [currentChartBuckets, selectedBucketKey]);

  // ============================================================================
  // 3. İLÇE, DAVA TÜRÜ VE MAHKEME HEYETİ DAĞILIM ANALİZLERİ
  // ============================================================================
  const districtBreakdown = useMemo(() => {
    const districts: CourtDistrict[] = ["Fatsa", "Çamaş", "Çatalpınar"];
    const sourceRecs = summaryTotals.records;
    return districts.map((dist) => {
      const dRecs = sourceRecs.filter((r) => r.district === dist);
      const metrics = calculateBucketMetrics(dist, dist, dist, dRecs);
      return {
        district: dist,
        ...metrics,
        sharePct:
          sourceRecs.length > 0
            ? Math.round((dRecs.length / sourceRecs.length) * 100)
            : 0,
      };
    });
  }, [summaryTotals.records]);

  const caseTypeBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { count: number; completed: number; parcels: number; km: number }
    >();
    for (const r of summaryTotals.records) {
      const ct = r.caseType || "Diğer";
      const prev = map.get(ct) || {
        count: 0,
        completed: 0,
        parcels: 0,
        km: 0,
      };
      const pm = extractRecordParcelMetrics(r);
      prev.count += 1;
      if (r.status === "yapildi") prev.completed += 1;
      prev.parcels += pm.uniqueParcels;
      prev.km = Number((prev.km + (Number(r.distanceKm) || 0)).toFixed(1));
      map.set(ct, prev);
    }
    return Array.from(map.entries())
      .map(([caseType, stats]) => ({
        caseType,
        ...stats,
      }))
      .sort((a, b) => b.count - a.count);
  }, [summaryTotals.records]);

  const personnelBreakdown = useMemo(() => {
    const staffMap = new Map<
      string,
      { role: string; name: string; files: number; km: number; parcels: number }
    >();

    for (const r of summaryTotals.records) {
      const pm = extractRecordParcelMetrics(r);
      const km = Number(r.distanceKm) || 0;
      const entries: { role: string; name?: string }[] = [
        { role: "Hakim", name: r.judgeName },
        { role: "Zabıt Katibi", name: r.clerkName },
        { role: "Mübaşir", name: r.bailiffName },
      ];
      for (const ent of entries) {
        const cleanName = ent.name?.trim();
        if (!cleanName) continue;
        const key = `${ent.role}__${cleanName}`;
        const cur = staffMap.get(key) || {
          role: ent.role,
          name: cleanName,
          files: 0,
          km: 0,
          parcels: 0,
        };
        cur.files += 1;
        cur.km = Number((cur.km + km).toFixed(1));
        cur.parcels += pm.uniqueParcels;
        staffMap.set(key, cur);
      }
    }

    return Array.from(staffMap.values()).sort((a, b) => b.files - a.files);
  }, [summaryTotals.records]);

  // Grafik ölçekleme tavan değerleri
  const maxFilesInBucket = useMemo(() => {
    return Math.max(1, ...currentChartBuckets.map((b) => b.totalFiles));
  }, [currentChartBuckets]);

  const maxParcelsInBucket = useMemo(() => {
    return Math.max(
      1,
      ...currentChartBuckets.map((b) =>
        Math.max(b.uniqueParcelCount, b.totalParcelAndUnitItems)
      )
    );
  }, [currentChartBuckets]);

  const maxKmInBucket = useMemo(() => {
    return Math.max(
      1,
      ...currentChartBuckets.map((b) =>
        Math.max(b.roundTripRouteKm, b.oneWayKm)
      )
    );
  }, [currentChartBuckets]);

  const completionPct =
    summaryTotals.totalFiles > 0
      ? Math.round(
          (summaryTotals.completedFiles / summaryTotals.totalFiles) * 100
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* ====================================================================
          1. ÜST KONTROL VE FİLTRE PANELİ (AYLIK / GÜNLÜK GEÇİŞİ, YIL, AY, İLÇE)
         ==================================================================== */}
      <div className="app-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-md bg-[#246B73]/12 px-2.5 py-0.5 text-[11px] font-bold text-[#246B73]">
              <BarChart3 className="h-3.5 w-3.5" />
              <span>T.C. FATSA SULH HUKUK MAHKEMESİ · ANALİTİK KEŞİF RAPORLAMA PANELİ</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
              Aylık ve Günlük Keşif, Parsel & Kilometre İstatistik Grafikleri
            </h1>
            <p className="text-xs text-slate-500">
              Yapılan ve planlanan keşif dosyalarını, incelenen parsel ve bağımsız bölüm sayılarını, yüzölçümlerini ve kat edilen kilometre yükünü aylık veya günlük grafiklerle inceleyin.
            </p>
          </div>

          {/* Aylık / Günlük Görünüm Anahtarı */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setGranularity("monthly");
                  setSelectedBucketKey(null);
                }}
                className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                  granularity === "monthly"
                    ? "bg-[#246B73] text-white shadow-xs"
                    : "text-slate-700 hover:text-slate-900"
                }`}
              >
                📅 Aylık İstatistik Grafiği
              </button>
              <button
                type="button"
                onClick={() => {
                  setGranularity("daily");
                  setSelectedBucketKey(null);
                }}
                className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                  granularity === "daily"
                    ? "bg-[#246B73] text-white shadow-xs"
                    : "text-slate-700 hover:text-slate-900"
                }`}
              >
                📊 Günlük İstatistik Grafiği
              </button>
            </div>

            {onOpenExcelModalForMonth && (
              <button
                type="button"
                onClick={() =>
                  onOpenExcelModalForMonth(
                    selectedYearMonth !== "ALL"
                      ? selectedYearMonth
                      : availableYearMonths[availableYearMonths.length - 1] ||
                          "2026-11"
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#16845B] px-3.5 py-2 text-xs font-bold text-white hover:opacity-95 whitespace-nowrap shadow-xs"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>Aylık Excel Raporu Al</span>
              </button>
            )}
          </div>
        </div>

        {/* Alt Filtre Satırı */}
        <div className="pt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Aylık Modda Yıl Seçici / Günlük Modda Ay Seçici */}
            {granularity === "monthly" ? (
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                  Yıl Seçimi:
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                    setSelectedBucketKey(null);
                  }}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-900 focus:border-[#246B73] focus:outline-none"
                >
                  <option value="ALL">Tüm Yıllar</option>
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y} Yılı
                    </option>
                  ))}
                </select>
                {selectedYear !== "ALL" && (
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 select-none">
                    <input
                      type="checkbox"
                      checked={showAllTwelveMonths}
                      onChange={(e) => setShowAllTwelveMonths(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600"
                    />
                    <span>12 Ayın Tümünü Göster</span>
                  </label>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                  İncelenen Ay:
                </label>
                <select
                  value={selectedYearMonth}
                  onChange={(e) => {
                    setSelectedYearMonth(e.target.value);
                    setSelectedBucketKey(null);
                  }}
                  className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                >
                  <option value="ALL">
                    Tüm Keşif Günleri ({activeRecords.length} Dosya)
                  </option>
                  {availableYearMonths.map((ym) => {
                    const [y, m] = ym.split("-");
                    const mName =
                      TURKISH_MONTH_NAMES[
                        Math.max(0, Math.min(11, Number(m) - 1))
                      ];
                    const cnt = activeRecords.filter((r) =>
                      r.date.startsWith(ym)
                    ).length;
                    return (
                      <option key={ym} value={ym}>
                        {mName} {y} ({cnt} Dosya)
                      </option>
                    );
                  })}
                </select>
                {selectedYearMonth !== "ALL" && (
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 select-none">
                    <input
                      type="checkbox"
                      checked={dailyShowEmptyDays}
                      onChange={(e) => setDailyShowEmptyDays(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600"
                    />
                    <span>Keşif Olmayan Günleri de Göster</span>
                  </label>
                )}
              </div>
            )}

            {/* Keşif Durumu Filtresi */}
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(
                [
                  { id: "all", label: "Tüm Keşifler" },
                  { id: "yapildi", label: "✓ Sadece Yapılanlar" },
                  { id: "planlandi", label: "Planlananlar" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStatusScope(item.id)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                    statusScope === item.id
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* İlçe Seçici */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(["Tümü", "Fatsa", "Çamaş", "Çatalpınar"] as const).map((dist) => (
              <button
                key={dist}
                type="button"
                onClick={() => setDistrictFilter(dist)}
                className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  districtFilter === dist
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {dist === "Tümü" ? "Tüm İlçeler" : dist}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ====================================================================
          2. 4 SÜTUNLU ANA KPI ÖZET KARTLARI (YAPILAN KEŞİF, PARSEL SAYISI, KİLOMETRE, KEŞİF GÜNÜ)
         ==================================================================== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Yapılan & Toplam Keşif Sayısı */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>YAPILAN / TOPLAM KEŞİF</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-2xl sm:text-3xl font-bold text-emerald-700">
              {summaryTotals.completedFiles}
            </span>
            <span className="text-sm font-semibold text-slate-400">
              / {summaryTotals.totalFiles} Dosya
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-600 font-mono tabular-nums">
            <span>İcra Oranı: %{completionPct}</span>
            <span>
              Planlanan: {summaryTotals.plannedFiles} · Ertelenen:{" "}
              {summaryTotals.postponedFiles}
            </span>
          </div>
        </div>

        {/* KPI 2: İncelenen Parsel & Bağımsız Bölüm Sayısı */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>PARSEL & BAĞIMSIZ BÖLÜM</span>
            <Layers className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-2xl sm:text-3xl font-bold text-amber-700">
              {summaryTotals.uniqueParcelCount}
            </span>
            <span className="text-sm font-semibold text-slate-500">
              Parsel
            </span>
            {summaryTotals.independentUnitCount > 0 && (
              <span className="text-xs font-bold text-indigo-700">
                (+{summaryTotals.independentUnitCount} B.Bölüm)
              </span>
            )}
          </div>
          <div className="text-xs text-slate-600 font-mono tabular-nums">
            Toplam Taşınmaz Kalemi:{" "}
            <strong className="text-slate-900">
              {summaryTotals.totalParcelAndUnitItems}
            </strong>{" "}
            Adet
          </div>
          <div className="text-[11px] text-slate-500 font-mono tabular-nums">
            Toplam Yüzölçümü:{" "}
            <strong className="text-emerald-800">
              {formatAreaM2(summaryTotals.totalAreaM2)} m²
            </strong>
          </div>
        </div>

        {/* KPI 3: Kat Edilen Kilometre (Gidiş-Dönüş & Tek Yön) */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>TOPLAM KİLOMETRE & YOL</span>
            <Navigation className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-2xl sm:text-3xl font-bold text-blue-700">
              {summaryTotals.roundTripRouteKm}
            </span>
            <span className="text-sm font-semibold text-slate-500">
              km (Gidiş-Dönüş)
            </span>
          </div>
          <div className="text-xs text-slate-600 font-mono tabular-nums">
            Adliye Çıkışlı Tek Yön Toplam:{" "}
            <strong className="text-slate-900">
              {summaryTotals.oneWayKm} km
            </strong>
          </div>
          <div className="text-[11px] text-slate-500 font-mono tabular-nums">
            Toplam Sürüş Süresi: ~{Math.floor(summaryTotals.totalDurationMin / 60)}{" "}
            sa {summaryTotals.totalDurationMin % 60} dk (
            {summaryTotals.totalDurationMin} dk)
          </div>
        </div>

        {/* KPI 4: Keşif Günü & Günlük Yoğunluk Ortalaması */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>AKTİF KEŞİF GÜNÜ & ORTALAMA</span>
            <CalendarIcon className="h-4 w-4 text-purple-600" />
          </div>
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900">
              {summaryTotals.activeDaysCount}
            </span>
            <span className="text-sm font-semibold text-slate-500">
              Keşif Günü
            </span>
          </div>
          <div className="text-xs text-slate-600 font-mono tabular-nums">
            Gün Başına Ortalama:{" "}
            <strong className="text-slate-900">
              {summaryTotals.activeDaysCount > 0
                ? (
                    summaryTotals.totalFiles / summaryTotals.activeDaysCount
                  ).toFixed(1)
                : "0"}{" "}
              Dosya
            </strong>{" "}
            ·{" "}
            <strong className="text-amber-800">
              {summaryTotals.activeDaysCount > 0
                ? (
                    summaryTotals.uniqueParcelCount /
                    summaryTotals.activeDaysCount
                  ).toFixed(1)
                : "0"}{" "}
              Parsel
            </strong>
          </div>
          <div className="text-[11px] text-slate-500 font-mono tabular-nums">
            Günlük Ort. Güzergah:{" "}
            <strong className="text-blue-800">
              {summaryTotals.activeDaysCount > 0
                ? (
                    summaryTotals.roundTripRouteKm /
                    summaryTotals.activeDaysCount
                  ).toFixed(1)
                : "0"}{" "}
              km / gün
            </strong>
          </div>
        </div>
      </div>

      {/* ====================================================================
          3. GRAFİK 1: AYLIK / GÜNLÜK KEŞİF DOSYASI GRAFİĞİ (YAPILAN vs PLANLANAN vs ERTELENEN)
         ==================================================================== */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              1. {granularity === "monthly" ? "Aylık" : "Günlük"} Yapılan ve Planlanan Keşif Sayısı Grafiği
            </h2>
            <p className="text-xs text-slate-500">
              Sütunların üzerine tıklayarak ilgili {granularity === "monthly" ? "ayın" : "günün"} dosya ve parsel dökümünü aşağıda inceleyebilirsiniz.
              {granularity === "monthly" &&
                " (Bir aya çift tıklayarak o ayın günlük grafiğine geçebilirsiniz)"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
              <span className="h-3 w-3 rounded-xs bg-emerald-600 inline-block" />
              Yapılan Keşif ({summaryTotals.completedFiles})
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-blue-800">
              <span className="h-3 w-3 rounded-xs bg-blue-500 inline-block" />
              Planlanan ({summaryTotals.plannedFiles})
            </span>
            {summaryTotals.postponedFiles > 0 && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-amber-800">
                <span className="h-3 w-3 rounded-xs bg-amber-500 inline-block" />
                Ertelenen ({summaryTotals.postponedFiles})
              </span>
            )}
          </div>
        </div>

        {currentChartBuckets.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            Seçilen filtreye uygun keşif verisi bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div
              className="min-w-[640px]"
              style={{
                width:
                  currentChartBuckets.length > 12
                    ? `${currentChartBuckets.length * 58}px`
                    : "100%",
              }}
            >
              {/* Sütun Grafiği Alanı */}
              <div className="grid grid-flow-col auto-cols-fr gap-2 sm:gap-3 items-end h-56 pt-8 px-2 border-b border-slate-200 bg-slate-50/50 rounded-t-lg">
                {currentChartBuckets.map((b) => {
                  const isSelected = focusedBucket?.key === b.key;
                  const totalHeightPct =
                    maxFilesInBucket > 0
                      ? Math.max(
                          b.totalFiles > 0 ? 8 : 0,
                          Math.round((b.totalFiles / maxFilesInBucket) * 100)
                        )
                      : 0;
                  const completedRatio =
                    b.totalFiles > 0
                      ? (b.completedFiles / b.totalFiles) * 100
                      : 0;
                  const plannedRatio =
                    b.totalFiles > 0
                      ? (b.plannedFiles / b.totalFiles) * 100
                      : 0;
                  const postponedRatio =
                    b.totalFiles > 0
                      ? (b.postponedFiles / b.totalFiles) * 100
                      : 0;

                  return (
                    <div
                      key={b.key}
                      onClick={() => setSelectedBucketKey(b.key)}
                      onDoubleClick={() => {
                        if (granularity === "monthly" && b.key.length === 7) {
                          setSelectedYearMonth(b.key);
                          setGranularity("daily");
                          setSelectedBucketKey(null);
                        }
                      }}
                      className={`group relative flex flex-col items-center justify-end h-full cursor-pointer rounded-t-lg px-1 transition-colors ${
                        isSelected
                          ? "bg-emerald-50/80 ring-1 ring-emerald-500/40"
                          : "hover:bg-slate-100/80"
                      }`}
                      title={`${b.label}: Toplam ${b.totalFiles} Dosya (${b.completedFiles} Yapıldı, ${b.plannedFiles} Planlandı) · ${b.uniqueParcelCount} Parsel · ${b.roundTripRouteKm} km`}
                    >
                      {/* Sütun Üstü Sayı Etiketi */}
                      <div className="mb-1.5 text-center font-mono tabular-nums leading-tight">
                        <div
                          className={`text-xs font-bold ${
                            isSelected ? "text-emerald-900" : "text-slate-800"
                          }`}
                        >
                          {b.totalFiles}
                        </div>
                        {b.completedFiles > 0 && (
                          <div className="text-[10px] font-bold text-emerald-700">
                            ✓{b.completedFiles}
                          </div>
                        )}
                      </div>

                      {/* Yığınlı Sütun (Stacked Bar) */}
                      <div
                        className="w-full max-w-[44px] rounded-t-md overflow-hidden flex flex-col-reverse shadow-2xs transition-all"
                        style={{ height: `${totalHeightPct}%` }}
                      >
                        {b.completedFiles > 0 && (
                          <div
                            style={{ height: `${completedRatio}%` }}
                            className="w-full bg-emerald-600 transition-all"
                          />
                        )}
                        {b.plannedFiles > 0 && (
                          <div
                            style={{ height: `${plannedRatio}%` }}
                            className="w-full bg-blue-500 transition-all"
                          />
                        )}
                        {b.postponedFiles > 0 && (
                          <div
                            style={{ height: `${postponedRatio}%` }}
                            className="w-full bg-amber-500 transition-all"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* X Ekseni Etiketleri */}
              <div className="grid grid-flow-col auto-cols-fr gap-2 sm:gap-3 pt-2 px-2">
                {currentChartBuckets.map((b) => {
                  const isSelected = focusedBucket?.key === b.key;
                  return (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setSelectedBucketKey(b.key)}
                      className={`text-center font-mono text-[11px] truncate py-1 rounded transition-colors ${
                        isSelected
                          ? "bg-slate-900 text-white font-bold"
                          : "text-slate-600 hover:text-slate-900 font-medium"
                      }`}
                    >
                      {b.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ====================================================================
          4. İKİLİ GRAFİK SATIRI:
             GRAFİK 2: PARSEL & BAĞIMSIZ BÖLÜM SAYISI GRAFİĞİ
             GRAFİK 3: KİLOMETRE (KM) & GÜZERGAH MESAFE GRAFİĞİ
         ==================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* GRAFİK 2: PARSEL VE BAĞIMSIZ BÖLÜM SAYISI GRAFİĞİ */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                2. {granularity === "monthly" ? "Aylık" : "Günlük"} Parsel & Bağımsız Bölüm Grafiği
              </h2>
              <p className="text-xs text-slate-500">
                Keşiflerde incelenen fiziki parsel sayısı ve bağımsız bölüm adetleri
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-amber-800">
                <span className="h-3 w-3 rounded-xs bg-amber-500 inline-block" />
                Parsel ({summaryTotals.uniqueParcelCount})
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-indigo-800">
                <span className="h-3 w-3 rounded-xs bg-indigo-600 inline-block" />
                Bağımsız Bölüm ({summaryTotals.independentUnitCount})
              </span>
            </div>
          </div>

          <div className="overflow-x-auto pb-2">
            <div
              className="min-w-[460px]"
              style={{
                width:
                  currentChartBuckets.length > 10
                    ? `${currentChartBuckets.length * 52}px`
                    : "100%",
              }}
            >
              <div className="grid grid-flow-col auto-cols-fr gap-2 items-end h-48 pt-6 px-2 border-b border-slate-200 bg-amber-50/20 rounded-t-lg">
                {currentChartBuckets.map((b) => {
                  const isSelected = focusedBucket?.key === b.key;
                  const parcelHeightPct =
                    maxParcelsInBucket > 0
                      ? Math.max(
                          b.uniqueParcelCount > 0 ? 8 : 0,
                          Math.round(
                            (b.uniqueParcelCount / maxParcelsInBucket) * 100
                          )
                        )
                      : 0;
                  const bbHeightPct =
                    maxParcelsInBucket > 0
                      ? Math.max(
                          b.independentUnitCount > 0 ? 8 : 0,
                          Math.round(
                            (b.independentUnitCount / maxParcelsInBucket) * 100
                          )
                        )
                      : 0;

                  return (
                    <div
                      key={b.key}
                      onClick={() => setSelectedBucketKey(b.key)}
                      className={`flex flex-col items-center justify-end h-full cursor-pointer rounded-t-lg px-1 transition-colors ${
                        isSelected
                          ? "bg-amber-100/60 ring-1 ring-amber-500/40"
                          : "hover:bg-slate-100/70"
                      }`}
                      title={`${b.label}: ${b.uniqueParcelCount} Parsel · ${b.independentUnitCount} Bağımsız Bölüm · Toplam Alan: ${formatAreaM2(b.totalAreaM2)} m²`}
                    >
                      <div className="mb-1 text-center font-mono tabular-nums text-[11px] font-bold text-amber-900">
                        {b.uniqueParcelCount}P
                        {b.independentUnitCount > 0
                          ? `+${b.independentUnitCount}BB`
                          : ""}
                      </div>
                      <div className="w-full max-w-[38px] flex items-end justify-center gap-1 h-full">
                        <div
                          className="flex-1 bg-amber-500 rounded-t-sm transition-all"
                          style={{ height: `${parcelHeightPct}%` }}
                        />
                        {b.independentUnitCount > 0 && (
                          <div
                            className="flex-1 bg-indigo-600 rounded-t-sm transition-all"
                            style={{ height: `${bbHeightPct}%` }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-flow-col auto-cols-fr gap-2 pt-2 px-2">
                {currentChartBuckets.map((b) => (
                  <div
                    key={b.key}
                    onClick={() => setSelectedBucketKey(b.key)}
                    className="text-center font-mono text-[10px] text-slate-600 truncate cursor-pointer"
                  >
                    {b.shortLabel}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* GRAFİK 3: KAT EDİLEN KİLOMETRE (KM) GRAFİĞİ */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                3. {granularity === "monthly" ? "Aylık" : "Günlük"} Kat Edilen Kilometre (km) Grafiği
              </h2>
              <p className="text-xs text-slate-500">
                Fatsa Adliyesi merkezli gidiş-dönüş güzergah kilometresi ve tek yön toplam mesafe
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-blue-800">
                <span className="h-3 w-3 rounded-xs bg-blue-600 inline-block" />
                Gidiş-Dönüş ({summaryTotals.roundTripRouteKm} km)
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-cyan-800">
                <span className="h-3 w-3 rounded-xs bg-cyan-400 inline-block" />
                Tek Yön ({summaryTotals.oneWayKm} km)
              </span>
            </div>
          </div>

          <div className="overflow-x-auto pb-2">
            <div
              className="min-w-[460px]"
              style={{
                width:
                  currentChartBuckets.length > 10
                    ? `${currentChartBuckets.length * 52}px`
                    : "100%",
              }}
            >
              <div className="grid grid-flow-col auto-cols-fr gap-2 items-end h-48 pt-6 px-2 border-b border-slate-200 bg-blue-50/20 rounded-t-lg">
                {currentChartBuckets.map((b) => {
                  const isSelected = focusedBucket?.key === b.key;
                  const rtHeightPct =
                    maxKmInBucket > 0
                      ? Math.max(
                          b.roundTripRouteKm > 0 ? 8 : 0,
                          Math.round((b.roundTripRouteKm / maxKmInBucket) * 100)
                        )
                      : 0;
                  const owHeightPct =
                    maxKmInBucket > 0
                      ? Math.max(
                          b.oneWayKm > 0 ? 6 : 0,
                          Math.round((b.oneWayKm / maxKmInBucket) * 100)
                        )
                      : 0;

                  return (
                    <div
                      key={b.key}
                      onClick={() => setSelectedBucketKey(b.key)}
                      className={`flex flex-col items-center justify-end h-full cursor-pointer rounded-t-lg px-1 transition-colors ${
                        isSelected
                          ? "bg-blue-100/60 ring-1 ring-blue-500/40"
                          : "hover:bg-slate-100/70"
                      }`}
                      title={`${b.label}: Gidiş-Dönüş ~${b.roundTripRouteKm} km · Tek Yön ${b.oneWayKm} km · Sürüş Süresi: ~${b.totalDurationMin} dk`}
                    >
                      <div className="mb-1 text-center font-mono tabular-nums text-[10px] font-bold text-blue-900">
                        {b.roundTripRouteKm}
                        <span className="text-[9px] font-normal">km</span>
                      </div>
                      <div className="w-full max-w-[38px] flex items-end justify-center gap-1 h-full">
                        <div
                          className="flex-1 bg-blue-600 rounded-t-sm transition-all"
                          style={{ height: `${rtHeightPct}%` }}
                        />
                        <div
                          className="flex-1 bg-cyan-400 rounded-t-sm transition-all"
                          style={{ height: `${owHeightPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-flow-col auto-cols-fr gap-2 pt-2 px-2">
                {currentChartBuckets.map((b) => (
                  <div
                    key={b.key}
                    onClick={() => setSelectedBucketKey(b.key)}
                    className="text-center font-mono text-[10px] text-slate-600 truncate cursor-pointer"
                  >
                    {b.shortLabel}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ====================================================================
          5. SEÇİLEN DÖNEMİN (AY VEYA GÜN) DETAYLI DOSYA & PARSEL İNCELEME KARTI
         ==================================================================== */}
      {focusedBucket && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-emerald-700">
                SEÇİLİ DÖNEM DETAY ANALİZİ
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {focusedBucket.label} Dönemi Keşif & Parsel Dökümü (
                {focusedBucket.totalFiles} Dosya ·{" "}
                {focusedBucket.uniqueParcelCount} Parsel ·{" "}
                {focusedBucket.roundTripRouteKm} km)
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums">
              <span className="text-emerald-800 font-bold">
                Yapılan: {focusedBucket.completedFiles}
              </span>
              <span>·</span>
              <span className="text-blue-800 font-bold">
                Planlanan: {focusedBucket.plannedFiles}
              </span>
              <span>·</span>
              <span className="text-amber-800 font-bold">
                Parsel: {focusedBucket.uniqueParcelCount}
                {focusedBucket.independentUnitCount > 0
                  ? ` (+${focusedBucket.independentUnitCount} B.Bölüm)`
                  : ""}
              </span>
              <span>·</span>
              <span className="text-slate-800 font-bold">
                Yüzölçümü: {formatAreaM2(focusedBucket.totalAreaM2)} m²
              </span>
              {granularity === "monthly" && focusedBucket.key.length === 7 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedYearMonth(focusedBucket.key);
                    setGranularity("daily");
                    setSelectedBucketKey(null);
                  }}
                  className="ml-2 rounded-lg bg-slate-900 px-3 py-1.5 font-sans text-xs font-bold text-white hover:bg-slate-800"
                >
                  Bu Ayın Günlük Grafiğine Geç &rarr;
                </button>
              )}
            </div>
          </div>

          {focusedBucket.records.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              Bu dönemde kayıtlı keşif dosyası bulunmuyor.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                    <th className="py-2 px-2.5 font-bold">Tarih & Saat</th>
                    <th className="py-2 px-2.5 font-bold">Esas No</th>
                    <th className="py-2 px-2.5 font-bold">İlçe / Mahalle</th>
                    <th className="py-2 px-2.5 font-bold">
                      Parseller & Bağımsız Bölümler
                    </th>
                    <th className="py-2 px-2.5 font-bold">Dava Türü</th>
                    <th className="py-2 px-2.5 font-bold text-right">
                      Yüzölçümü
                    </th>
                    <th className="py-2 px-2.5 font-bold text-right">Mesafe</th>
                    <th className="py-2 px-2.5 font-bold">Durum & Heyet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {focusedBucket.records.map((rec) => {
                    const pm = extractRecordParcelMetrics(rec);
                    const adaParselStr = formatAdaParselLabel(rec);
                    return (
                      <tr
                        key={rec.id}
                        onClick={() =>
                          onSelectInspectionToEdit &&
                          onSelectInspectionToEdit(rec)
                        }
                        className="hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="py-2 px-2.5 text-slate-700 whitespace-nowrap">
                          {formatDateTR(rec.date)} · {rec.time}
                        </td>
                        <td className="py-2 px-2.5 font-bold text-slate-900 whitespace-nowrap">
                          {rec.esasNo}
                        </td>
                        <td className="py-2 px-2.5 font-sans text-slate-800">
                          [{rec.district}] {rec.neighborhood}
                        </td>
                        <td className="py-2 px-2.5 font-sans text-slate-800">
                          {adaParselStr ||
                            rec.addressDetail ||
                            rec.vehicleInfo?.plateNo ||
                            "-"}
                        </td>
                        <td className="py-2 px-2.5 font-sans text-slate-700">
                          {rec.caseType}
                        </td>
                        <td className="py-2 px-2.5 text-right text-emerald-800 font-semibold whitespace-nowrap">
                          {pm.areaM2 > 0 ? `${formatAreaM2(pm.areaM2)} m²` : "-"}
                        </td>
                        <td className="py-2 px-2.5 text-right text-blue-800 font-bold whitespace-nowrap">
                          {rec.distanceKm} km
                        </td>
                        <td className="py-2 px-2.5 font-sans whitespace-nowrap">
                          <span
                            className={`font-bold ${
                              rec.status === "yapildi"
                                ? "text-emerald-700"
                                : rec.status === "ertelendi"
                                ? "text-amber-700"
                                : "text-blue-700"
                            }`}
                          >
                            {rec.status === "yapildi"
                              ? "✓ Yapıldı"
                              : rec.status === "ertelendi"
                              ? "Ertelendi"
                              : "Planlandı"}
                          </span>
                          {rec.judgeName && (
                            <span className="ml-1.5 text-[11px] text-slate-500">
                              ({rec.judgeName}
                              {rec.clerkName ? ` · ${rec.clerkName}` : ""})
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          6. İLÇE DAĞILIMI, DAVA TÜRLERİ VE MAHKEME HEYETİ KATILIM GRAFİKLERİ
         ==================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Panel A: İlçe Bazlı Keşif, Parsel & Kilometre Dağılımı */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <MapPin className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">
              İlçelere Göre Keşif, Parsel ve Kilometre Yükü
            </h3>
          </div>
          <div className="space-y-3.5">
            {districtBreakdown.map((d) => (
              <div key={d.district} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900">{d.district}</span>
                  <span className="font-mono tabular-nums text-slate-600">
                    <strong>{d.totalFiles}</strong> Dosya (✓{d.completedFiles}) ·{" "}
                    <strong>{d.uniqueParcelCount}</strong> Parsel ·{" "}
                    <strong>{d.roundTripRouteKm}</strong> km (%{d.sharePct})
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all"
                    style={{ width: `${Math.max(d.totalFiles > 0 ? 4 : 0, d.sharePct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel B: Dava Türlerine Göre Keşif Dağılımı */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Compass className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Dava Türlerine Göre Keşif & Parsel Dağılımı
            </h3>
          </div>
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {caseTypeBreakdown.length === 0 ? (
              <div className="text-xs text-slate-500 py-4 text-center">
                Kayıt bulunamadı.
              </div>
            ) : (
              caseTypeBreakdown.map((ct) => {
                const pct =
                  summaryTotals.totalFiles > 0
                    ? Math.round((ct.count / summaryTotals.totalFiles) * 100)
                    : 0;
                return (
                  <div key={ct.caseType} className="space-y-1">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-semibold text-slate-800 truncate">
                        {ct.caseType}
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-slate-600 shrink-0">
                        {ct.count} Dosya · {ct.parcels} Parsel · {ct.km} km
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Panel C: Keşfe Katılan Mahkeme Personeli İstatistiği */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <UserCheck className="h-4 w-4 text-purple-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Keşfe Katılan Personel Görev & Kilometre Özeti
            </h3>
          </div>
          {personnelBreakdown.length === 0 ? (
            <div className="text-xs text-slate-500 py-6 text-center">
              Keşif kartlarında &ldquo;Yapıldı&rdquo; butonuna tıklayarak veya Keşif Zaptı menüsünden katılan Hakim, Katip ve Mübaşir bilgilerini kaydettiğinizde personel istatistikleri burada listelenir.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {personnelBreakdown.map((st) => (
                <div
                  key={`${st.role}-${st.name}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">{st.name}</div>
                    <div className="text-[11px] text-slate-500">{st.role}</div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className="font-bold text-emerald-800">
                      {st.files} Keşif · {st.parcels} Parsel
                    </div>
                    <div className="text-[11px] text-blue-800">
                      Tek Yön: {st.km} km
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ====================================================================
          7. AYLIK / GÜNLÜK TÜM DÖNEMLERİN DETAYLI İSTATİSTİK CETVELİ (TABLO)
         ==================================================================== */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-slate-800" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              {granularity === "monthly" ? "Aylık" : "Günlük"} İstatistik Özet Cetveli
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Tablodaki bir satıra tıklayarak o dönemin dosyalarını yukarıda görüntüleyebilirsiniz.
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-900 text-white">
                <th className="py-2.5 px-3 font-bold">
                  {granularity === "monthly" ? "Ay / Dönem" : "Keşif Tarihi"}
                </th>
                <th className="py-2.5 px-3 font-bold text-right">
                  Keşif Günü
                </th>
                <th className="py-2.5 px-3 font-bold text-right">
                  Toplam Dosya
                </th>
                <th className="py-2.5 px-3 font-bold text-right">
                  Yapılan Keşif
                </th>
                <th className="py-2.5 px-3 font-bold text-right">
                  Planlanan
                </th>
                <th className="py-2.5 px-3 font-bold text-right">
                  Parsel Sayısı
                </th>
                <th className="py-2.5 px-3 font-bold text-right">
                  Bağımsız Bölüm
                </th>
                <th className="py-2.5 px-3 font-bold text-right">
                  Toplam Yüzölçümü
                </th>
                <th className="py-2.5 px-3 font-bold text-right">
                  Tek Yön (km)
                </th>
                <th className="py-2.5 px-3 font-bold text-right">
                  Gidiş-Dönüş (km)
                </th>
                <th className="py-2.5 px-3 font-bold text-right">
                  Sürüş Süresi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
              {currentChartBuckets
                .filter((b) => b.totalFiles > 0)
                .map((b) => {
                  const isFocused = focusedBucket?.key === b.key;
                  return (
                    <tr
                      key={b.key}
                      onClick={() => setSelectedBucketKey(b.key)}
                      className={`cursor-pointer transition-colors ${
                        isFocused
                          ? "bg-emerald-50/90 font-bold"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="py-2 px-3 font-sans font-bold text-slate-900">
                        {b.label}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-700">
                        {b.activeDaysCount} Gün
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">
                        {b.totalFiles}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-emerald-700">
                        {b.completedFiles}
                      </td>
                      <td className="py-2 px-3 text-right text-blue-700">
                        {b.plannedFiles}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-amber-800">
                        {b.uniqueParcelCount}
                      </td>
                      <td className="py-2 px-3 text-right text-indigo-800">
                        {b.independentUnitCount > 0
                          ? b.independentUnitCount
                          : "-"}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-800">
                        {b.totalAreaM2 > 0
                          ? `${formatAreaM2(b.totalAreaM2)} m²`
                          : "-"}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-700">
                        {b.oneWayKm} km
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-blue-800">
                        {b.roundTripRouteKm} km
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600">
                        ~{b.totalDurationMin} dk
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-900 bg-slate-100 font-mono tabular-nums font-bold text-slate-900">
                <td className="py-2.5 px-3 font-sans">GENEL TOPLAM</td>
                <td className="py-2.5 px-3 text-right">
                  {summaryTotals.activeDaysCount} Gün
                </td>
                <td className="py-2.5 px-3 text-right">
                  {summaryTotals.totalFiles}
                </td>
                <td className="py-2.5 px-3 text-right text-emerald-800">
                  {summaryTotals.completedFiles}
                </td>
                <td className="py-2.5 px-3 text-right text-blue-800">
                  {summaryTotals.plannedFiles}
                </td>
                <td className="py-2.5 px-3 text-right text-amber-800">
                  {summaryTotals.uniqueParcelCount}
                </td>
                <td className="py-2.5 px-3 text-right text-indigo-800">
                  {summaryTotals.independentUnitCount}
                </td>
                <td className="py-2.5 px-3 text-right">
                  {formatAreaM2(summaryTotals.totalAreaM2)} m²
                </td>
                <td className="py-2.5 px-3 text-right">
                  {summaryTotals.oneWayKm} km
                </td>
                <td className="py-2.5 px-3 text-right text-blue-800">
                  {summaryTotals.roundTripRouteKm} km
                </td>
                <td className="py-2.5 px-3 text-right">
                  ~{summaryTotals.totalDurationMin} dk
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
