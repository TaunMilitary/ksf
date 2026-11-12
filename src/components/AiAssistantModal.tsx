import React, { useState, useMemo } from "react";
import {
  Sparkles,
  Search,
  X,
  Calendar,
  MapPin,
  FileText,
  Navigation,
  Users,
  CheckCircle2,
  Clock,
  ArrowRight,
  Route,
  BarChart3,
} from "lucide-react";
import { InspectionRecord, RegisteredExpert } from "../types";

function formatDateTR(isoDate: string): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}.${m}.${y}`;
}

function formatLongDateTR(isoDate: string): string {
  if (!isoDate) return "";
  const months = [
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
  const days = [
    "Pazar",
    "Pazartesi",
    "Salı",
    "Çarşamba",
    "Perşembe",
    "Cuma",
    "Cumartesi",
  ];
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(y, m - 1, d);
  return `${d} ${months[m - 1] || ""} ${y} ${days[dt.getDay()] || ""}`;
}

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  inspections: InspectionRecord[];
  registeredExperts: RegisteredExpert[];
  onEditInspection?: (rec: InspectionRecord) => void;
  onSelectInspectionToEdit?: (rec: InspectionRecord) => void;
  onPrepareMinutesForRecord: (recId: string) => void;
  onOpenParcelOnMap: (rec: InspectionRecord) => void;
  onOpenExcelModal?: () => void;
  onNavigateTab?: (tab: any) => void;
}

interface AssistantAnswer {
  id: string;
  query: string;
  summaryTitle: string;
  explanation: string;
  matchedRecords: InspectionRecord[];
  statsBadges?: { label: string; value: string }[];
  timestamp: string;
}

const SUGGESTED_QUERIES = [
  "Bugünkü keşifler ne kadar sürer?",
  "Bugünkü keşifler",
  "En yakın keşif günü ne kadar sürer ve kaçta biter?",
  "Toplam kaç km yol gideceğiz?",
  "Bu hafta hangi günler müsait?",
  "Kadir Sağlam hangi keşiflere katıldı?",
  "Zaptı hazırlanmamış dosyalar",
  "Ortaklığın giderilmesi dosyaları",
  "Çamaş ilçesindeki keşifler",
  "Aynı mahalledeki yakın keşifleri göster",
];

function computeInspectionDurationBreakdown(records: InspectionRecord[]) {
  if (records.length === 0) {
    return {
      fileCount: 0,
      parcelCount: 0,
      oneWayMaxKm: 0,
      roundTripKm: 0,
      roadMinutes: 0,
      fieldMinutes: 0,
      totalMinutes: 0,
      formattedTotalDuration: "0 dk",
      startTime: "13:00",
      estimatedReturnTime: "13:00",
    };
  }

  const sortedByTime = [...records].sort((a, b) =>
    a.time.localeCompare(b.time)
  );
  const startTime = sortedByTime[0]?.time || "13:00";

  // Calculate total parcels / independent units
  const parcelCount = records.reduce(
    (acc, r) => acc + (r.parcels && r.parcels.length > 0 ? r.parcels.length : 1),
    0
  );

  // Calculate realistic road travel:
  // Max distance from courthouse * 2 (round-trip) + inter-stop hops (~3.5 km per additional stop)
  const maxOneWayKm = Math.max(...records.map((r) => r.distanceKm || 0), 0);
  const maxOneWayMin = Math.max(...records.map((r) => r.durationMin || 0), 0);
  const uniqueNeighborhoods = new Set(records.map((r) => r.neighborhood)).size;
  const interStopKm =
    records.length > 1
      ? (records.length - 1) * 2.4 + Math.max(0, uniqueNeighborhoods - 1) * 3.8
      : 0;
  const roundTripKm = Number((maxOneWayKm * 2 + interStopKm).toFixed(1));

  // Road time: round-trip to farthest + 8 min per additional stop transfer
  const roadMinutes = Math.round(
    maxOneWayMin * 2 + Math.max(0, records.length - 1) * 8
  );

  // On-site inspection time: ~25 min per file + 8 min per extra parcel/unit in that file
  const fieldMinutes = records.reduce((acc, r) => {
    const pCount = r.parcels && r.parcels.length > 0 ? r.parcels.length : 1;
    return acc + 25 + Math.max(0, pCount - 1) * 8;
  }, 0);

  const totalMinutes = roadMinutes + fieldMinutes;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const formattedTotalDuration =
    hours > 0
      ? mins > 0
        ? `${hours} saat ${mins} dakika`
        : `${hours} saat`
      : `${mins} dakika`;

  // Estimate return clock time based on first inspection time (or departure 25 min before first stop)
  const [startH, startM] = startTime.split(":").map((n) => Number(n) || 0);
  const departureTotalMin = Math.max(
    8 * 60,
    startH * 60 + startM - Math.min(maxOneWayMin, 35)
  );
  const returnTotalMin = departureTotalMin + totalMinutes;
  const retH = Math.floor(returnTotalMin / 60) % 24;
  const retM = returnTotalMin % 60;
  const estimatedReturnTime = `${String(retH).padStart(2, "0")}:${String(
    retM
  ).padStart(2, "0")}`;

  return {
    fileCount: records.length,
    parcelCount,
    oneWayMaxKm: Number(maxOneWayKm.toFixed(1)),
    roundTripKm,
    roadMinutes,
    fieldMinutes,
    totalMinutes,
    formattedTotalDuration,
    startTime,
    estimatedReturnTime,
  };
}

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
  isOpen,
  onClose,
  inspections,
  registeredExperts,
  onEditInspection,
  onSelectInspectionToEdit,
  onPrepareMinutesForRecord,
  onOpenParcelOnMap,
}) => {
  const [queryInput, setQueryInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [history, setHistory] = useState<AssistantAnswer[]>([]);

  const todayIso = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  if (!isOpen) return null;

  const evaluateNaturalQuery = (rawQuery: string): AssistantAnswer => {
    const q = rawQuery.trim().toLocaleLowerCase("tr-TR");
    const activeInspections = inspections.filter(
      (r) => r.status !== "iptal_edildi"
    );

    // Helper: Find target date mentioned in query ("bugün", "yarın", specific date, or next scheduled inspection day)
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowIso = `${tomorrowDate.getFullYear()}-${String(
      tomorrowDate.getMonth() + 1
    ).padStart(2, "0")}-${String(tomorrowDate.getDate()).padStart(2, "0")}`;

    const upcomingSortedDates = Array.from(
      new Set(
        activeInspections
          .filter((r) => r.date >= todayIso)
          .map((r) => r.date)
      )
    ).sort();

    const allSortedDates = Array.from(
      new Set(activeInspections.map((r) => r.date))
    ).sort();

    const nextScheduledDate =
      upcomingSortedDates[0] ||
      allSortedDates[allSortedDates.length - 1] ||
      todayIso;

    // Detect if the user is asking about duration / time / how long / when it finishes
    const isDurationQuestion =
      q.includes("ne kadar sürer") ||
      q.includes("kaç saat") ||
      q.includes("kaç dk") ||
      q.includes("kaç dakika") ||
      q.includes("sürer") ||
      q.includes("süre") ||
      q.includes("kaçta biter") ||
      q.includes("ne zaman biter") ||
      q.includes("tahmini süre") ||
      q.includes("vakit") ||
      q.includes("zaman alır");

    // 1. DURATION / TIME ESTIMATION QUERIES (e.g., "bugünkü keşifler ne kadar sürer", "keşifler kaç saat sürer", "kaçta biter")
    if (isDurationQuestion) {
      const asksToday = q.includes("bugün");
      const asksTomorrow = q.includes("yarın");

      // Check if user mentioned a specific date or neighborhood or district
      const mentionedDistrict =
        q.includes("fatsa")
          ? "Fatsa"
          : q.includes("çamaş") || q.includes("camas")
          ? "Çamaş"
          : q.includes("çatalpınar") || q.includes("catalpinar")
          ? "Çatalpınar"
          : null;

      if (asksToday) {
        const todayList = activeInspections.filter((r) => r.date === todayIso);
        if (todayList.length > 0) {
          const calc = computeInspectionDurationBreakdown(todayList);
          return {
            id: `ans-${Date.now()}`,
            query: rawQuery,
            summaryTitle: `Bugünkü Keşif Süresi Analizi (${formatDateTR(todayIso)})`,
            explanation: `Bugün (${formatDateTR(todayIso)}) programda yer alan ${calc.fileCount} keşif dosyası (${calc.parcelCount} parsel/bağımsız bölüm) için Fatsa Adliyesi çıkış ve dönüşlü toplam tahmini süre **${calc.formattedTotalDuration}** (${calc.totalMinutes} dk) olarak hesaplanmıştır. Bunun **~${calc.roadMinutes} dakikası** (${calc.roundTripKm} km gidiş-dönüş + duraklar arası geçiş) karayolu ulaşımı, **~${calc.fieldMinutes} dakikası** ise sahada mahkeme heyeti ve bilirkişi inceleme süresidir. İlk keşif saati ${calc.startTime} baz alındığında Adliyeye tahmini dönüş saati **~${calc.estimatedReturnTime}** civarıdır.`,
            matchedRecords: todayList,
            statsBadges: [
              { label: "Toplam Süre", value: calc.formattedTotalDuration },
              { label: "Yol Süresi", value: `~${calc.roadMinutes} dk (${calc.roundTripKm} km)` },
              { label: "Saha İnceleme", value: `~${calc.fieldMinutes} dk (${calc.parcelCount} Parsel)` },
              { label: "Tahmini Dönüş", value: `~${calc.estimatedReturnTime}` },
            ],
            timestamp: new Date().toLocaleTimeString("tr-TR", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          };
        } else {
          // Today has 0 inspections -> Give clear answer for today AND automatically calculate the nearest scheduled inspection day so the user gets immediate value!
          const nextDayList = activeInspections.filter(
            (r) => r.date === nextScheduledDate
          );
          const nextCalc = computeInspectionDurationBreakdown(nextDayList);
          return {
            id: `ans-${Date.now()}`,
            query: rawQuery,
            summaryTitle: `Bugün (${formatDateTR(todayIso)}) Keşif Yok · En Yakın Keşif Günü Süre Analizi (${formatDateTR(nextScheduledDate)})`,
            explanation: `Bugün (${formatDateTR(todayIso)}) için takvimde kayıtlı keşif bulunmamaktadır (0 dk). Ancak sıradaki en yakın keşif günü olan **${formatLongDateTR(nextScheduledDate)}** tarihindeki **${nextCalc.fileCount} dosya (${nextCalc.parcelCount} parsel)** için toplam tahmini süre **${nextCalc.formattedTotalDuration}** olarak hesaplanmıştır (~${nextCalc.roadMinutes} dk karayolu ulaşımı / ${nextCalc.roundTripKm} km + ~${nextCalc.fieldMinutes} dk saha incelemesi; tahmini Adliyeye dönüş: **${nextCalc.estimatedReturnTime}**).`,
            matchedRecords: nextDayList,
            statsBadges: [
              { label: "Bugün", value: "0 Dosya (0 dk)" },
              {
                label: `${formatDateTR(nextScheduledDate)} Toplam Süre`,
                value: nextCalc.formattedTotalDuration,
              },
              {
                label: "Yol + Saha",
                value: `${nextCalc.roadMinutes} dk Yol + ${nextCalc.fieldMinutes} dk Saha`,
              },
              {
                label: "Tahmini Bitiş",
                value: `~${nextCalc.estimatedReturnTime}`,
              },
            ],
            timestamp: new Date().toLocaleTimeString("tr-TR", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          };
        }
      }

      if (asksTomorrow) {
        const tomorrowList = activeInspections.filter(
          (r) => r.date === tomorrowIso
        );
        if (tomorrowList.length > 0) {
          const calc = computeInspectionDurationBreakdown(tomorrowList);
          return {
            id: `ans-${Date.now()}`,
            query: rawQuery,
            summaryTitle: `Yarınki Keşif Süresi Analizi (${formatDateTR(tomorrowIso)})`,
            explanation: `Yarın (${formatDateTR(tomorrowIso)}) yapılacak ${calc.fileCount} keşif dosyası (${calc.parcelCount} parsel) toplam **${calc.formattedTotalDuration}** sürecektir (~${calc.roadMinutes} dk yol / ${calc.roundTripKm} km + ~${calc.fieldMinutes} dk saha incelemesi). Tahmini Adliyeye dönüş saati **~${calc.estimatedReturnTime}** olarak hesaplanmıştır.`,
            matchedRecords: tomorrowList,
            statsBadges: [
              { label: "Toplam Süre", value: calc.formattedTotalDuration },
              { label: "Gidiş-Dönüş Yol", value: `${calc.roundTripKm} km (~${calc.roadMinutes} dk)` },
              { label: "Tahmini Dönüş", value: `~${calc.estimatedReturnTime}` },
            ],
            timestamp: new Date().toLocaleTimeString("tr-TR", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          };
        }
      }

      if (mentionedDistrict) {
        const distList = activeInspections.filter(
          (r) => r.district === mentionedDistrict
        );
        const calc = computeInspectionDurationBreakdown(distList);
        return {
          id: `ans-${Date.now()}`,
          query: rawQuery,
          summaryTitle: `${mentionedDistrict} İlçesi Keşifleri Süre & Mesafe Analizi`,
          explanation: `${mentionedDistrict} ilçesindeki ${calc.fileCount} keşif dosyasının (${calc.parcelCount} parsel) tamamı için toplam saha inceleme süresi **~${calc.fieldMinutes} dakika**, Adliye gidiş-dönüş ve duraklar arası yol süresi **~${calc.roadMinutes} dakika** olup toplam mesai süresi **${calc.formattedTotalDuration}** olarak hesaplanmıştır.`,
          matchedRecords: distList,
          statsBadges: [
            { label: "İlçe", value: mentionedDistrict },
            { label: "Toplam Süre", value: calc.formattedTotalDuration },
            { label: "Dosya / Parsel", value: `${calc.fileCount} Dosya / ${calc.parcelCount} Parsel` },
          ],
          timestamp: new Date().toLocaleTimeString("tr-TR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
      }

      // General duration question ("keşifler ne kadar sürer", "en yakın keşif günü ne kadar sürer")
      const nextDayList = activeInspections.filter(
        (r) => r.date === nextScheduledDate
      );
      const nextCalc = computeInspectionDurationBreakdown(nextDayList);
      const totalAllFieldMin = activeInspections.reduce((acc, r) => {
        const pCount = r.parcels && r.parcels.length > 0 ? r.parcels.length : 1;
        return acc + 25 + Math.max(0, pCount - 1) * 8;
      }, 0);
      const totalAllRoadMin = activeInspections.reduce(
        (acc, r) => acc + (r.durationMin || 0) * 2,
        0
      );
      const totalAllHours = ((totalAllFieldMin + totalAllRoadMin) / 60).toFixed(1);

      return {
        id: `ans-${Date.now()}`,
        query: rawQuery,
        summaryTitle: `Keşif Süresi & Saha Mesai Analizi (${formatDateTR(nextScheduledDate)})`,
        explanation: `En yakın keşif programı olan **${formatLongDateTR(nextScheduledDate)}** günündeki **${nextCalc.fileCount} dosya (${nextCalc.parcelCount} parsel)** için Adliye çıkış-dönüş dahil toplam süre **${nextCalc.formattedTotalDuration}** (~${nextCalc.roadMinutes} dk yol / ${nextCalc.roundTripKm} km + ~${nextCalc.fieldMinutes} dk saha incelemesi; tahmini dönüş: **${nextCalc.estimatedReturnTime}**). Sistemdeki tüm ${activeInspections.length} aktif dosyanın toplam tahmini saha+yol mesaisi ise **~${totalAllHours} saat**tir.`,
        matchedRecords: nextDayList.length > 0 ? nextDayList : activeInspections.slice(0, 6),
        statsBadges: [
          {
            label: `${formatDateTR(nextScheduledDate)} Süresi`,
            value: nextCalc.formattedTotalDuration,
          },
          {
            label: "Yol + Saha",
            value: `${nextCalc.roadMinutes} dk Yol + ${nextCalc.fieldMinutes} dk Saha`,
          },
          { label: "Tahmini Dönüş", value: `~${nextCalc.estimatedReturnTime}` },
          { label: "Tüm Dosyalar Toplamı", value: `~${totalAllHours} Saat` },
        ],
        timestamp: new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    }

    // 2. DISTANCE / KILOMETER / FARTHEST / CLOSEST QUERIES ("kaç km", "mesafe", "en uzak", "en yakın")
    if (
      q.includes("kaç km") ||
      q.includes("kilometre") ||
      q.includes("mesafe") ||
      q.includes("en uzak") ||
      q.includes("toplam yol") ||
      q.includes("kaç kilometre")
    ) {
      const totalOneWayKm = activeInspections.reduce(
        (acc, r) => acc + (r.distanceKm || 0),
        0
      );
      const totalRoundTripKm = Number((totalOneWayKm * 2).toFixed(1));
      const sortedByDist = [...activeInspections].sort(
        (a, b) => (b.distanceKm || 0) - (a.distanceKm || 0)
      );
      const farthest = sortedByDist[0];
      const closest = sortedByDist[sortedByDist.length - 1];

      return {
        id: `ans-${Date.now()}`,
        query: rawQuery,
        summaryTitle: `Keşif Mesafe & Kilometre Analizi`,
        explanation: `Sistemdeki ${activeInspections.length} aktif keşif dosyasının Fatsa Adliyesi'ne tek yön toplam uzaklığı **${totalOneWayKm.toFixed(1)} km**, gidiş-dönüş toplamı ise **~${totalRoundTripKm} km**'dir.${
          farthest
            ? ` En uzak keşif noktası **${farthest.distanceKm} km (~${farthest.durationMin} dk)** ile **[${farthest.district}] ${farthest.neighborhood} (${farthest.esasNo})** dosyasıdır.`
            : ""
        }${
          closest
            ? ` Adliyeye en yakın keşif ise **${closest.distanceKm} km (~${closest.durationMin} dk)** ile **${closest.neighborhood} (${closest.esasNo})** dosyasıdır.`
            : ""
        }`,
        matchedRecords: sortedByDist.slice(0, 6),
        statsBadges: [
          { label: "Gidiş-Dönüş Toplam", value: `~${totalRoundTripKm} km` },
          {
            label: "En Uzak Nokta",
            value: farthest ? `${farthest.distanceKm} km (${farthest.neighborhood.replace(" Mahallesi", "")})` : "-",
          },
          {
            label: "En Yakın Nokta",
            value: closest ? `${closest.distanceKm} km (${closest.neighborhood.replace(" Mahallesi", "")})` : "-",
          },
        ],
        timestamp: new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    }

    // 3. Bugünkü keşifler (Today's inspections general)
    if (q.includes("bugün")) {
      const list = inspections.filter((r) => r.date === todayIso);
      const calc = computeInspectionDurationBreakdown(list);
      const nextDayList = activeInspections.filter(
        (r) => r.date === nextScheduledDate
      );
      return {
        id: `ans-${Date.now()}`,
        query: rawQuery,
        summaryTitle: `Bugünkü Keşif Programı (${formatDateTR(todayIso)})`,
        explanation:
          list.length > 0
            ? `Bugün (${formatDateTR(todayIso)}) için kayıtlı ${list.length} keşif dosyası bulundu. Toplam tahmini süre **${calc.formattedTotalDuration}** (~${calc.roadMinutes} dk yol / ${calc.roundTripKm} km + ~${calc.fieldMinutes} dk saha incelemesi; tahmini dönüş: ${calc.estimatedReturnTime}).`
            : `Bugün (${formatDateTR(todayIso)}) için takvimde kayıtlı keşif bulunmuyor. En yakın keşif günü olan **${formatDateTR(nextScheduledDate)}** tarihindeki ${nextDayList.length} dosyayı aşağıda inceleyebilirsiniz.`,
        matchedRecords: list.length > 0 ? list : nextDayList,
        statsBadges:
          list.length > 0
            ? [
                { label: "Dosya Sayısı", value: `${list.length} Dosya` },
                { label: "Tahmini Süre", value: calc.formattedTotalDuration },
                { label: "Gidiş-Dönüş", value: `~${calc.roundTripKm} km` },
              ]
            : [
                { label: "Bugün", value: "0 Dosya" },
                {
                  label: "En Yakın Gün",
                  value: `${formatDateTR(nextScheduledDate)} (${nextDayList.length} Dosya)`,
                },
              ],
        timestamp: new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    }

    // 4. Yarınki keşifler
    if (q.includes("yarın")) {
      const list = inspections.filter((r) => r.date === tomorrowIso);
      const calc = computeInspectionDurationBreakdown(list);
      return {
        id: `ans-${Date.now()}`,
        query: rawQuery,
        summaryTitle: `Yarınki Keşif Programı (${formatDateTR(tomorrowIso)})`,
        explanation:
          list.length > 0
            ? `Yarın (${formatDateTR(tomorrowIso)}) için planlanmış ${list.length} keşif dosyası mevcut. Toplam tahmini süre **${calc.formattedTotalDuration}** (~${calc.roundTripKm} km).`
            : `Yarın (${formatDateTR(tomorrowIso)}) için planlanmış herhangi bir keşif bulunmuyor.`,
        matchedRecords: list,
        statsBadges: [
          { label: "Tarih", value: formatDateTR(tomorrowIso) },
          { label: "Dosya Sayısı", value: `${list.length} Dosya` },
          ...(list.length > 0
            ? [{ label: "Tahmini Süre", value: calc.formattedTotalDuration }]
            : []),
        ],
        timestamp: new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    }

    // 5. AVAILABLE DAYS / BUSIEST DAYS / SCHEDULE ("müsait", "boş gün", "yoğun", "hangi gün")
    if (
      q.includes("müsait") ||
      q.includes("boş gün") ||
      q.includes("yoğun") ||
      q.includes("hangi gün") ||
      q.includes("takvim") ||
      q.includes("bu hafta") ||
      q.includes("gelecek hafta")
    ) {
      const dateCounts: Record<string, InspectionRecord[]> = {};
      activeInspections.forEach((r) => {
        if (!dateCounts[r.date]) dateCounts[r.date] = [];
        dateCounts[r.date].push(r);
      });
      const busyDays = Object.entries(dateCounts).sort(([a], [b]) =>
        a.localeCompare(b)
      );

      // Find next 5 weekdays that have 0 inspections
      const freeWeekdays: string[] = [];
      const cursor = new Date();
      for (let i = 1; i <= 21 && freeWeekdays.length < 4; i++) {
        cursor.setDate(cursor.getDate() + 1);
        const dow = cursor.getDay();
        if (dow === 0 || dow === 6) continue;
        const iso = `${cursor.getFullYear()}-${String(
          cursor.getMonth() + 1
        ).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        if (!dateCounts[iso]) {
          freeWeekdays.push(formatDateTR(iso));
        }
      }

      const summaryList = busyDays
        .slice(0, 4)
        .map(([d, recs]) => `${formatDateTR(d)} (${recs.length} dosya)`)
        .join(", ");

      return {
        id: `ans-${Date.now()}`,
        query: rawQuery,
        summaryTitle: `Takvim Yoğunluğu & Müsait Keşif Günleri`,
        explanation: `Sistemde toplam **${busyDays.length} farklı günde** planlanmış keşif bulunmaktadır (${summaryList || "Kayıt yok"}). Yeni keşif planlamak için önümüzdeki en uygun **boş hafta içi günler**: **${freeWeekdays.join(", ")}**. Mevcut keşiflerle aynı koridorda birleştirme yapmak isterseniz aşağıdaki planlı günleri tercih edebilirsiniz.`,
        matchedRecords: activeInspections.slice(0, 8),
        statsBadges: [
          { label: "Dolu Gün Sayısı", value: `${busyDays.length} Gün` },
          { label: "Önerilen Boş Gün", value: freeWeekdays[0] || "Hafta İçi" },
          { label: "Toplam Aktif Dosya", value: `${activeInspections.length} Dosya` },
        ],
        timestamp: new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    }

    // 6. COURT STAFF / JUDGE / CLERK / BAILIFF QUERIES ("hakim", "katip", "mübaşir", "kadir", "mehmet", "mahsuni", "ebru", "personel", "heyet")
    if (
      q.includes("hakim") ||
      q.includes("katip") ||
      q.includes("mübaşir") ||
      q.includes("kadir") ||
      q.includes("mehmet") ||
      q.includes("mahsuni") ||
      q.includes("ebru") ||
      q.includes("personel") ||
      q.includes("kim katıldı")
    ) {
      const staffFilterName = q.includes("kadir")
        ? "kadir"
        : q.includes("mehmet")
        ? "mehmet"
        : q.includes("mahsuni")
        ? "mahsuni"
        : q.includes("ebru")
        ? "ebru"
        : null;

      const list = inspections.filter((r) => {
        const staffHay = `${r.judgeName || ""} ${r.clerkName || ""} ${
          r.bailiffName || ""
        } ${r.createdBy || ""}`.toLocaleLowerCase("tr-TR");
        if (staffFilterName) return staffHay.includes(staffFilterName);
        return Boolean(r.judgeName || r.clerkName || r.bailiffName || r.status === "yapildi");
      });

      return {
        id: `ans-${Date.now()}`,
        query: rawQuery,
        summaryTitle: `Mahkeme Heyeti (Hakim / Katip / Mübaşir) Katılım Analizi`,
        explanation:
          list.length > 0
            ? `Sorguladığınız mahkeme personeli / heyet kriterine uygun **${list.length} keşif dosyası** bulundu. Keşfe katılan Hakim, Zabıt Katibi ve Mübaşir bilgileri aşağıda listelenmiştir.`
            : `Henüz tamamlanmış veya bu personel adıyla kaydedilmiş keşif heyeti kaydı bulunamadı. Keşif kartlarındaki **"Yapıldı"** butonuna tıklayarak Hakim (Kadir SAĞLAM), Katip (Mehmet AKIN / Mahsuni BAŞBAYDAR) ve Mübaşir (Ebru YILMAZ) seçimi yapabilirsiniz.`,
        matchedRecords: list.length > 0 ? list : inspections.slice(0, 5),
        statsBadges: [
          { label: "Eşleşen Dosya", value: `${list.length} Dosya` },
          {
            label: "Tamamlanan Keşif",
            value: `${inspections.filter((r) => r.status === "yapildi").length} Dosya`,
          },
        ],
        timestamp: new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    }

    // 7. Zaptı hazırlanmamış / zapt bekleyen dosyalar
    if (
      q.includes("zapt") ||
      q.includes("tutanak") ||
      q.includes("hazırlanmamış") ||
      q.includes("bekleyen")
    ) {
      const list = inspections.filter(
        (r) =>
          r.status === "zapt_bekliyor" ||
          (r.status === "yapildi" && !r.judgeName) ||
          r.status === "planlandi"
      );
      return {
        id: `ans-${Date.now()}`,
        query: rawQuery,
        summaryTitle: "Keşif Zaptı Hazırlanacak / Bekleyen Dosyalar",
        explanation: `Sistemde zaptı hazırlanabilecek veya bekleyen ${list.length} keşif dosyası listelendi. Herhangi bir dosyanın yanındaki "Zapt Hazırla" butonuyla Word (.doc) çıktısını anında alabilirsiniz.`,
        matchedRecords: list,
        statsBadges: [
          { label: "Eşleşen Dosya", value: `${list.length} Dosya` },
          {
            label: "Zapt Bekliyor",
            value: `${inspections.filter((x) => x.status === "zapt_bekliyor").length} Dosya`,
          },
        ],
        timestamp: new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    }

    // 8. Aynı mahalledeki / yakın keşif önerileri
    if (
      q.includes("aynı mahalle") ||
      q.includes("yakın") ||
      q.includes("birleştir") ||
      q.includes("komşu")
    ) {
      const byNeigh: Record<string, InspectionRecord[]> = {};
      inspections.forEach((r) => {
        if (r.status === "iptal_edildi") return;
        const key = `${r.district} - ${r.neighborhood}`;
        if (!byNeigh[key]) byNeigh[key] = [];
        byNeigh[key].push(r);
      });
      const clusters = Object.values(byNeigh).filter((arr) => arr.length >= 2);
      const flat = clusters.flat();

      return {
        id: `ans-${Date.now()}`,
        query: rawQuery,
        summaryTitle: "Aynı Mahallede / Yakın Konumdaki Keşif Kümeleri",
        explanation:
          flat.length > 0
            ? `${clusters.length} farklı mahallede birden fazla keşif dosyası (toplam ${flat.length} dosya) tespit edildi. Bu dosyaları aynı güne birleştirerek ulaşım süresinden ve araç kilometresinden tasarruf sağlayabilirsiniz.`
            : "Şu anda aynı mahallede birden fazla bekleyen keşif kümesi bulunamadı.",
        matchedRecords: flat,
        statsBadges: [
          { label: "Ortak Mahalle Kümesi", value: `${clusters.length} Mahalle` },
          { label: "Toplam Dosya", value: `${flat.length} Dosya` },
        ],
        timestamp: new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    }

    // 9. Bilirkişi araması
    if (q.includes("bilirkişi") || q.includes("uzman") || q.includes("heyet")) {
      const matchedExp = registeredExperts.filter(
        (ex) =>
          q.includes(ex.fullName.toLocaleLowerCase("tr-TR")) ||
          q.includes(ex.title.toLocaleLowerCase("tr-TR"))
      );
      const list = inspections.filter((r) => {
        const expText = (r.experts || "").toLocaleLowerCase("tr-TR");
        if (matchedExp.length > 0) {
          return matchedExp.some(
            (me) =>
              expText.includes(me.fullName.toLocaleLowerCase("tr-TR")) ||
              expText.includes(me.title.toLocaleLowerCase("tr-TR").split(" ")[0])
          );
        }
        return (
          (q.includes("fen") && expText.includes("fen")) ||
          (q.includes("ziraat") && expText.includes("ziraat")) ||
          (q.includes("inşaat") && expText.includes("inşaat")) ||
          (q.includes("makine") && expText.includes("makine")) ||
          Boolean(r.experts)
        );
      });

      return {
        id: `ans-${Date.now()}`,
        query: rawQuery,
        summaryTitle: `Bilirkişi & Heyet Sorgu Sonucu (${list.length} Dosya)`,
        explanation: `Sistemde kayıtlı ${registeredExperts.length} mahkeme bilirkişisi ve sorgunuzla eşleşen ${list.length} keşif dosyası bulundu.`,
        matchedRecords: list,
        statsBadges: [
          { label: "Eşleşen Keşif", value: `${list.length} Dosya` },
          {
            label: "Kayıtlı Bilirkişi",
            value: `${registeredExperts.length} Uzman`,
          },
        ],
        timestamp: new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    }

    // 10. İlçe bazlı sorgular (Fatsa, Çamaş, Çatalpınar)
    if (
      q.includes("çamaş") ||
      q.includes("camas") ||
      q.includes("çatalpınar") ||
      q.includes("catalpinar") ||
      q.includes("fatsa")
    ) {
      const targetDist =
        q.includes("çamaş") || q.includes("camas")
          ? "Çamaş"
          : q.includes("çatalpınar") || q.includes("catalpinar")
          ? "Çatalpınar"
          : "Fatsa";
      const list = inspections.filter((r) => r.district === targetDist);
      const calc = computeInspectionDurationBreakdown(list);
      return {
        id: `ans-${Date.now()}`,
        query: rawQuery,
        summaryTitle: `${targetDist} İlçesi Keşif Kayıtları (${list.length} Dosya)`,
        explanation: `${targetDist} ilçesine ait toplam ${list.length} keşif dosyası bulundu. Bu dosyaların toplam tahmini saha+yol süresi **${calc.formattedTotalDuration}**, gidiş-dönüş mesafesi **~${calc.roundTripKm} km**'dir.`,
        matchedRecords: list,
        statsBadges: [
          { label: "İlçe", value: targetDist },
          { label: "Dosya Sayısı", value: `${list.length} Dosya` },
          { label: "Tahmini Süre", value: calc.formattedTotalDuration },
        ],
        timestamp: new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    }

    // 11. Tamamlanan / Ertelenen / Planlanan durum sorguları
    if (
      q.includes("yapılan") ||
      q.includes("tamamlanan") ||
      q.includes("ertelenen")
    ) {
      const isPostponed = q.includes("ertelenen");
      const list = inspections.filter((r) =>
        isPostponed ? r.status === "ertelendi" : r.status === "yapildi"
      );
      return {
        id: `ans-${Date.now()}`,
        query: rawQuery,
        summaryTitle: isPostponed
          ? `Ertelenen Keşif Dosyaları (${list.length})`
          : `Tamamlanan (Yapıldı) Keşif Dosyaları (${list.length})`,
        explanation: `Sorgunuza uygun ${list.length} keşif kaydı aşağıda listelenmiştir.`,
        matchedRecords: list,
        timestamp: new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    }

    // 12. Kaç parsel / metrekare / bağımsız bölüm / istatistik özeti
    if (
      q.includes("kaç parsel") ||
      q.includes("metrekare") ||
      q.includes("m2") ||
      q.includes("bağımsız bölüm") ||
      q.includes("istatistik") ||
      q.includes("özet") ||
      q.includes("kaç dosya") ||
      q.includes("kaç keşif")
    ) {
      const totalParcels = activeInspections.reduce(
        (acc, r) =>
          acc + (r.parcels && r.parcels.length > 0 ? r.parcels.length : 1),
        0
      );
      const totalArea = activeInspections.reduce(
        (acc, r) => acc + (r.yuzolcumuM2 || 0),
        0
      );
      const completedCount = inspections.filter(
        (r) => r.status === "yapildi"
      ).length;
      const calcAll = computeInspectionDurationBreakdown(activeInspections);

      return {
        id: `ans-${Date.now()}`,
        query: rawQuery,
        summaryTitle: `Genel Keşif, Parsel & Süre Özeti`,
        explanation: `Sistemde toplam **${inspections.length} keşif dosyası** (${completedCount} tamamlanan, ${activeInspections.length - completedCount} bekleyen/planlanan), **${totalParcels} parsel/bağımsız bölüm** ve **${totalArea.toLocaleString("tr-TR")} m²** taşınmaz alanı kayıtlıdır. En yakın keşif günü **${formatDateTR(nextScheduledDate)}** olup tüm aktif keşiflerin toplam tahmini süresi **${calcAll.formattedTotalDuration}** olarak hesaplanmıştır.`,
        matchedRecords: activeInspections.slice(0, 8),
        statsBadges: [
          { label: "Toplam Dosya", value: `${inspections.length} Dosya` },
          { label: "Toplam Parsel", value: `${totalParcels} Parsel` },
          { label: "Toplam Yüzölçümü", value: `${totalArea.toLocaleString("tr-TR")} m²` },
        ],
        timestamp: new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    }

    // 13. Smart Multi-Keyword Token Search (Esas No, Mahalle, Ada/Parsel, Dava Türü, Notlar) + Helpful Fallback
    const stopWords = new Set([
      "mahallesi",
      "mahallesindeki",
      "mahallesi'ndeki",
      "keşifleri",
      "keşifler",
      "keşif",
      "dosyaları",
      "dosyalar",
      "dosya",
      "getir",
      "göster",
      "ara",
      "bul",
      "listele",
      "nedir",
      "neler",
      "nelerdir",
      "var",
      "mı",
      "mi",
      "mu",
      "mü",
      "hakkında",
      "bilgi",
      "ver",
      "bana",
      "lütfen",
      "acaba",
      "kaç",
      "ne",
      "kadar",
      "olan",
      "ilgili",
    ]);

    const tokens = q
      .replace(/[?'",.!;:]/g, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !stopWords.has(t));

    const matched =
      tokens.length > 0
        ? inspections.filter((r) => {
            const hay = `${r.esasNo} ${r.district} ${r.neighborhood} ${
              r.caseType
            } ${r.adaNo || ""} ${r.parselNo || ""} ${r.addressDetail || ""} ${
              r.partyName || ""
            } ${r.experts || ""} ${r.notes || ""} ${r.judgeName || ""} ${
              r.clerkName || ""
            } ${r.bailiffName || ""}`.toLocaleLowerCase("tr-TR");
            return tokens.some((tk) => hay.includes(tk));
          })
        : [];

    if (matched.length > 0) {
      const calc = computeInspectionDurationBreakdown(matched);
      return {
        id: `ans-${Date.now()}`,
        query: rawQuery,
        summaryTitle: `"${rawQuery}" Sorgusu İçin ${matched.length} Dosya Bulundu`,
        explanation: `Sorgunuzdaki anahtar kelimelerle eşleşen **${matched.length} keşif dosyası** (${calc.parcelCount} parsel) bulundu. Bu dosyaların toplam tahmini saha ve yol süresi **${calc.formattedTotalDuration}** (~${calc.roundTripKm} km gidiş-dönüş) olarak hesaplanmıştır.`,
        matchedRecords: matched,
        statsBadges: [
          { label: "Bulunan Dosya", value: `${matched.length} Dosya` },
          { label: "Tahmini Süre", value: calc.formattedTotalDuration },
          { label: "Gidiş-Dönüş", value: `~${calc.roundTripKm} km` },
        ],
        timestamp: new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    }

    // Never return a dead-end "not found" error! Provide a smart summary of the schedule & duration for the nearest inspection day.
    const nextDayList = activeInspections.filter(
      (r) => r.date === nextScheduledDate
    );
    const nextCalc = computeInspectionDurationBreakdown(nextDayList);

    return {
      id: `ans-${Date.now()}`,
      query: rawQuery,
      summaryTitle: `Keşif Planlama & Süre Özeti (${formatDateTR(nextScheduledDate)})`,
      explanation: `Sorgunuz için sistemdeki güncel keşif programı incelendi: Bugün (${formatDateTR(todayIso)}) ${
        activeInspections.filter((r) => r.date === todayIso).length
      } dosya bulunmakta olup, en yakın keşif günü olan **${formatLongDateTR(
        nextScheduledDate
      )}** tarihinde **${nextCalc.fileCount} keşif dosyası (${
        nextCalc.parcelCount
      } parsel)** planlanmıştır. Bu programın toplam süresi **${
        nextCalc.formattedTotalDuration
      }** (~${nextCalc.roadMinutes} dk yol / ${nextCalc.roundTripKm} km + ~${
        nextCalc.fieldMinutes
      } dk saha incelemesi; tahmini Adliyeye dönüş: **${
        nextCalc.estimatedReturnTime
      }**) olarak hesaplanmıştır.`,
      matchedRecords:
        nextDayList.length > 0 ? nextDayList : activeInspections.slice(0, 6),
      statsBadges: [
        { label: "Toplam Kayıt", value: `${inspections.length} Dosya` },
        {
          label: `${formatDateTR(nextScheduledDate)} Süresi`,
          value: nextCalc.formattedTotalDuration,
        },
        { label: "Tahmini Dönüş", value: `~${nextCalc.estimatedReturnTime}` },
      ],
      timestamp: new Date().toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  };

  const handleRunQuery = async (customText?: string) => {
    const text = (customText ?? queryInput).trim();
    if (!text) return;

    setIsThinking(true);
    const localAns = evaluateNaturalQuery(text);
    setHistory((prev) => [localAns, ...prev]);
    if (!customText) setQueryInput("");

    // Also try server-side conversational Gemini enrichment if available
    try {
      const inspectionsSummary = inspections.slice(0, 25).map((r) => ({
        esasNo: r.esasNo,
        date: r.date,
        time: r.time,
        district: r.district,
        neighborhood: r.neighborhood,
        caseType: r.caseType,
        adaParsel: `${r.adaNo || "0"}/${r.parselNo || ""}`,
        parcelCount: r.parcels?.length || 1,
        distanceKm: r.distanceKm,
        durationMin: r.durationMin,
        status: r.status || "planlandi",
        judge: r.judgeName,
        clerk: r.clerkName,
        bailiff: r.bailiffName,
      }));
      const expertsSummary = registeredExperts.map((e) => ({
        title: e.title,
        fullName: e.fullName,
      }));

      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: text,
          todayIso,
          inspectionsSummary,
          expertsSummary,
          localAnswer: localAns.explanation,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.answer && data.source === "gemini") {
          setHistory((prev) =>
            prev.map((item) =>
              item.id === localAns.id
                ? { ...item, explanation: data.answer }
                : item
            )
          );
        }
      }
    } catch {
      // Local deterministic answer is already rendered seamlessly
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-5 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#1B2733] px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#246B73] text-white shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold tracking-tight">
                  Akıllı Keşif & Saha Asistanı
                </h2>
                <span className="rounded-md bg-[#246B73]/40 border border-[#63B5B0]/40 px-2 py-0.5 text-[10px] font-bold text-[#63B5B0]">
                  Süre · Mesafe · Doğal Dil Sorgu
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                &ldquo;Bugünkü keşifler ne kadar sürer?&rdquo;, &ldquo;Kaçta biter?&rdquo;, &ldquo;Toplam kaç km?&rdquo; gibi spontane sorular sorabilirsiniz
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800/80 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search Input & Quick Prompts */}
        <div className="border-b border-slate-200 bg-slate-50 p-4 space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRunQuery();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Örn: Bugünkü keşifler ne kadar sürer? / Kaçta biter? / Toplam kaç km yol gideceğiz?..."
                className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#246B73] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isThinking || !queryInput.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#246B73] px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-xs hover:opacity-95 disabled:opacity-50 whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4" />
              <span>{isThinking ? "Hesaplanıyor..." : "Sor / Analiz Et"}</span>
            </button>
          </form>

          {/* Quick Suggestion Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 mr-1">
              Örnek Sorular:
            </span>
            {SUGGESTED_QUERIES.map((sq) => (
              <button
                key={sq}
                type="button"
                onClick={() => handleRunQuery(sq)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-[#246B73] hover:text-[#246B73] transition-colors"
              >
                {sq}
              </button>
            ))}
          </div>
        </div>

        {/* Results Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#246B73]/10 text-[#246B73]">
                <Clock className="h-6 w-6" />
              </div>
              <div className="max-w-lg mx-auto space-y-1">
                <h3 className="text-sm font-bold text-slate-900">
                  Süre, Mesafe, Güzergâh ve Dosya Sorularınızı Doğal Dilde Sorun
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Asistan; Adliye gidiş-dönüş yol süresini, her dosyadaki parsel sayısına göre sahada geçecek inceleme süresini, tahmini dönüş saatini, boş takvim günlerini ve personel/bilirkişi kayıtlarını gerçek veritabanından hesaplar.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    handleRunQuery("Bugünkü keşifler ne kadar sürer?")
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#246B73] px-3.5 py-2 text-xs font-bold text-white"
                >
                  <Clock className="h-3.5 w-3.5" />
                  <span>Bugünkü Keşifler Ne Kadar Sürer?</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleRunQuery(
                      "En yakın keşif günü ne kadar sürer ve kaçta biter?"
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <Route className="h-3.5 w-3.5 text-[#246B73]" />
                  <span>En Yakın Keşif Günü Süresi</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleRunQuery("Toplam kaç km yol gideceğiz?")
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <BarChart3 className="h-3.5 w-3.5 text-[#397FA5]" />
                  <span>Toplam Kaç KM Yol Gideceğiz?</span>
                </button>
              </div>
            </div>
          ) : (
            history.map((ans) => (
              <div
                key={ans.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-[#246B73]/10 px-2 py-0.5 text-[11px] font-bold text-[#246B73]">
                      Sorgu: &ldquo;{ans.query}&rdquo;
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {ans.timestamp}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-slate-900">
                    {ans.summaryTitle}
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                  {ans.explanation.split("**").map((part, idx) =>
                    idx % 2 === 1 ? (
                      <strong key={idx} className="font-bold text-slate-900">
                        {part}
                      </strong>
                    ) : (
                      <span key={idx}>{part}</span>
                    )
                  )}
                </p>

                {ans.statsBadges && ans.statsBadges.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-1">
                    {ans.statsBadges.map((b, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <div className="text-[10px] font-bold uppercase text-slate-400">
                          {b.label}
                        </div>
                        <div className="text-xs sm:text-sm font-bold font-mono text-[#246B73] mt-0.5">
                          {b.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {ans.matchedRecords.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="text-[11px] font-bold uppercase text-slate-400">
                      İlgili Keşif Dosyaları ({ans.matchedRecords.length})
                    </div>
                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/50 max-h-64 overflow-y-auto">
                      {ans.matchedRecords.slice(0, 12).map((rec) => (
                        <div
                          key={rec.id}
                          className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between hover:bg-white transition-colors"
                        >
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="font-mono font-bold text-slate-900">
                                {rec.esasNo}
                              </span>
                              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-800">
                                {rec.district}
                              </span>
                              <span className="font-semibold text-slate-800">
                                {rec.neighborhood}
                              </span>
                              {rec.parselNo && (
                                <span className="font-mono text-[11px] font-bold text-amber-800">
                                  ({rec.adaNo || "0"}/{rec.parselNo})
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                              <span className="inline-flex items-center gap-1 font-mono">
                                <Calendar className="h-3 w-3 text-[#246B73]" />
                                {formatDateTR(rec.date)} · {rec.time}
                              </span>
                              <span>·</span>
                              <span>{rec.caseType}</span>
                              <span>·</span>
                              <span className="font-mono font-semibold text-[#246B73]">
                                {rec.distanceKm} km (~{rec.durationMin} dk yol)
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                onOpenParcelOnMap(rec);
                                onClose();
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-[#246B73] hover:text-[#246B73]"
                            >
                              <MapPin className="h-3 w-3" />
                              <span>Harita</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onPrepareMinutesForRecord(rec.id);
                                onClose();
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#246B73] px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-95"
                            >
                              <FileText className="h-3 w-3" />
                              <span>Zapt</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (onEditInspection) {
                                  onEditInspection(rec);
                                } else if (onSelectInspectionToEdit) {
                                  onSelectInspectionToEdit(rec);
                                }
                                onClose();
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              <span>Düzenle</span>
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
