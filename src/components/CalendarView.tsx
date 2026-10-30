import React, { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Navigation,
  FileText,
  Trash2,
  Share2,
  Pencil,
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudLightning,
  Snowflake,
} from "lucide-react";
import {
  InspectionRecord,
  InspectionStatus,
  WeatherForecast,
} from "../types";
import { getCaseTypeVisualMeta } from "../data/fatsaData";
import {
  formatAdaParselLabel,
  formatAddressLabel,
  formatAreaM2,
  formatDateTR,
  formatLongDateTR,
  formatVehicleLabel,
} from "../services/geoService";
import { STATUS_LABELS } from "../services/pdfService";

interface CalendarViewProps {
  inspections: InspectionRecord[];
  weatherMap: Record<string, WeatherForecast>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onAddForDate: (date: string) => void;
  onOpenOnMap: (date: string) => void;
  onShareDailyRoute?: (date: string) => void;
  onEditRecord?: (record: InspectionRecord) => void;
  onUpdateStatus: (id: string, status: InspectionStatus) => void;
  onDeleteRecord: (id: string) => void;
}

const MONTH_NAMES_TR = [
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

const DAY_HEADERS_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export function renderWeatherIcon(
  condition?: WeatherForecast["condition"],
  className = "h-4 w-4"
) {
  switch (condition) {
    case "sunny":
      return <Sun className={`${className} text-amber-500`} />;
    case "partly_cloudy":
      return <CloudSun className={`${className} text-amber-600`} />;
    case "cloudy":
      return <Cloud className={`${className} text-slate-500`} />;
    case "rainy":
      return <CloudRain className={`${className} text-sky-600`} />;
    case "stormy":
      return <CloudLightning className={`${className} text-indigo-600`} />;
    case "snowy":
      return <Snowflake className={`${className} text-cyan-600`} />;
    default:
      return <CloudSun className={`${className} text-amber-600`} />;
  }
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  inspections,
  weatherMap,
  selectedDate,
  onSelectDate,
  onAddForDate,
  onOpenOnMap,
  onShareDailyRoute,
  onEditRecord,
  onUpdateStatus,
  onDeleteRecord,
}) => {
  const initialDate = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState(initialDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(initialDate.getMonth());

  // Group inspections by YYYY-MM-DD
  const groupedByDate = useMemo(() => {
    const map = new Map<string, InspectionRecord[]>();
    for (const rec of inspections) {
      const list = map.get(rec.date) || [];
      list.push(rec);
      map.set(rec.date, list);
    }
    for (const [k, list] of map.entries()) {
      map.set(
        k,
        list.sort((a, b) => a.time.localeCompare(b.time))
      );
    }
    return map;
  }, [inspections]);

  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

    // Convert Sunday=0..Saturday=6 into Monday=0..Sunday=6
    const startWeekday = (firstDayOfMonth.getDay() + 6) % 7;

    const cells: {
      day: number | null;
      dateStr: string | null;
      records: InspectionRecord[];
    }[] = [];

    for (let i = 0; i < startWeekday; i++) {
      cells.push({ day: null, dateStr: null, records: [] });
    }

    for (let d = 1; d <= totalDays; d++) {
      const mm = String(currentMonth + 1).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      const dateStr = `${currentYear}-${mm}-${dd}`;
      cells.push({
        day: d,
        dateStr,
        records: groupedByDate.get(dateStr) || [],
      });
    }

    return cells;
  }, [currentYear, currentMonth, groupedByDate]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const activeDayRecords = selectedDate
    ? groupedByDate.get(selectedDate) || []
    : [];

  const activeDayTotalKm = useMemo(() => {
    const activeOnly = activeDayRecords.filter(
      (r) => r.status !== "iptal_edildi"
    );
    if (activeOnly.length === 0) return 0;
    const maxDist = Math.max(...activeOnly.map((r) => r.distanceKm));
    const extraStopsKm =
      activeOnly.length > 1 ? (activeOnly.length - 1) * 4.5 : 0;
    return Number((maxDist * 2 + extraStopsKm).toFixed(1));
  }, [activeDayRecords]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left 8 Columns: Monthly Calendar Grid */}
      <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {MONTH_NAMES_TR[currentMonth]} {currentYear} Keşif Takvimi
            </h2>
            <p className="text-xs text-slate-500">
              Günlerin üzerine tıklayarak o günün keşif dosyalarını, hava durumunu ve güzergah paylaşımını inceleyin
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevMonth}
              className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
              aria-label="Önceki Ay"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                const now = new Date();
                setCurrentYear(now.getFullYear());
                setCurrentMonth(now.getMonth());
                onSelectDate(todayStr);
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Bugün
            </button>
            <button
              onClick={handleNextMonth}
              className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
              aria-label="Sonraki Ay"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Weekday Headers */}
        <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-slate-500">
          {DAY_HEADERS_TR.map((dayName) => (
            <div key={dayName} className="py-1.5">
              {dayName}
            </div>
          ))}
        </div>

        {/* Calendar Cells */}
        <div className="mt-1 grid grid-cols-7 gap-1.5">
          {calendarDays.map((cell, idx) => {
            if (!cell.day || !cell.dateStr) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="min-h-[92px] rounded-lg bg-slate-50/60"
                />
              );
            }

            const isSelected = selectedDate === cell.dateStr;
            const isToday = todayStr === cell.dateStr;
            const count = cell.records.length;
            const firstWeather =
              count > 0 ? weatherMap[cell.records[0].id] : undefined;

            return (
              <button
                key={cell.dateStr}
                onClick={() => onSelectDate(cell.dateStr!)}
                className={`group flex min-h-[92px] flex-col justify-between rounded-lg border p-2 text-left transition-all ${
                  isSelected
                    ? "border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-500/20"
                    : count > 0
                    ? "border-slate-200 bg-white hover:border-emerald-400"
                    : "border-slate-100 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold tabular-nums ${
                        isToday
                          ? "bg-slate-900 text-white"
                          : isSelected
                          ? "text-emerald-800 font-bold"
                          : "text-slate-700"
                      }`}
                    >
                      {cell.day}
                    </span>
                    {firstWeather &&
                      renderWeatherIcon(firstWeather.condition, "h-3.5 w-3.5")}
                  </div>
                  {count > 0 && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                        count >= 3
                          ? "bg-amber-100 text-amber-900"
                          : "bg-emerald-100 text-emerald-900"
                      }`}
                    >
                      {count} Keşif
                    </span>
                  )}
                </div>

                {count > 0 ? (
                  <div className="mt-1.5 space-y-1 w-full overflow-hidden">
                    {cell.records.slice(0, 2).map((r) => {
                      const cMeta = getCaseTypeVisualMeta(r.caseType);
                      return (
                        <div
                          key={r.id}
                          className={`truncate text-[11px] font-medium ${
                            r.status === "iptal_edildi"
                              ? "line-through text-slate-400"
                              : r.status === "yapildi"
                              ? "text-emerald-800"
                              : "text-slate-700"
                          }`}
                        >
                          <span title={r.caseType}>
                            {r.subjectType === "arac"
                              ? "🚗"
                              : r.subjectType === "adres"
                              ? "🏠"
                              : cMeta.icon}
                          </span>{" "}
                          <span className="font-mono text-emerald-700">{r.time}</span>{" "}
                          {r.subjectType === "arac" && r.vehicleInfo?.plateNo
                            ? r.vehicleInfo.plateNo
                            : r.neighborhood.replace(" Mahallesi", "")}
                        </div>
                      );
                    })}
                    {count > 2 && (
                      <div className="text-[10px] font-medium text-slate-500">
                        +{count - 2} dosya daha
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-300 opacity-0 transition-opacity group-hover:opacity-100">
                    Seç / Ekle
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right 4 Columns: Selected Day Detail Panel */}
      <div className="lg:col-span-4 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-4">
            <div>
              <div className="text-xs font-medium text-emerald-700">
                SEÇİLİ GÜN DETAYI
              </div>
              <h3 className="mt-0.5 text-base font-bold text-slate-900">
                {selectedDate
                  ? formatLongDateTR(selectedDate)
                  : "Tarih Seçilmedi"}
              </h3>
            </div>
            {selectedDate && (
              <button
                onClick={() => onAddForDate(selectedDate)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                Bu Güne Ekle
              </button>
            )}
          </div>

          {selectedDate && activeDayRecords.length > 0 ? (
            <div className="mt-4 space-y-4">
              {/* Summary Bar */}
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700 border border-slate-200/80">
                <span>
                  Toplam <strong>{activeDayRecords.length} Dosya</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  Tahmini Gidiş-Dönüş: <strong>~{activeDayTotalKm} km</strong>
                </span>
              </div>

              {/* Inspection List */}
              <div className="space-y-3">
                {activeDayRecords.map((rec, idx) => {
                  const wf = weatherMap[rec.id];
                  const status: InspectionStatus = rec.status || "planlandi";
                  const adaParselText = formatAdaParselLabel(rec);
                  const vehicleText = formatVehicleLabel(rec);
                  const addressText = formatAddressLabel(rec);
                  const cMeta = getCaseTypeVisualMeta(rec.caseType);
                  return (
                    <div
                      key={rec.id}
                      className="rounded-lg border border-slate-200 p-3.5 transition-colors hover:border-slate-300"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-900 tabular-nums">
                          {idx + 1}. Durak · Saat {rec.time} · {rec.esasNo}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {onEditRecord && (
                            <button
                              type="button"
                              onClick={() => onEditRecord(rec)}
                              className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900 hover:bg-amber-100"
                              title="Keşif detaylarını düzenle"
                            >
                              <Pencil className="h-3 w-3" />
                              <span>Düzenle</span>
                            </button>
                          )}
                          <button
                            onClick={() => onDeleteRecord(rec.id)}
                            className="text-slate-400 hover:text-red-600 p-0.5"
                            title="Keşfi Sil"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          style={{
                            backgroundColor: cMeta.badgeBg,
                            color: cMeta.badgeText,
                          }}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold"
                        >
                          <span>{cMeta.icon}</span>
                          <span>{rec.caseType}</span>
                        </span>
                        <span className="text-sm font-bold text-slate-900">
                          [{rec.district}] {rec.neighborhood}
                        </span>
                      </div>

                      {rec.experts && (
                        <div className="mt-1 text-[11px] text-slate-600">
                          <span className="font-semibold text-slate-700">Bilirkişi:</span>{" "}
                          {rec.experts}
                        </div>
                      )}

                      {rec.createdBy && (
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          <span className="font-semibold text-slate-700">
                            👤 Keşfi Ekleyen:
                          </span>{" "}
                          {rec.createdBy}
                        </div>
                      )}

                      {vehicleText && (
                        <div className="mt-1.5 rounded border border-indigo-200 bg-indigo-50/90 px-2 py-1 text-[11px] text-indigo-950">
                          <div className="font-mono font-bold">
                            🚗 Plaka: {vehicleText}
                          </div>
                          {rec.vehicleInfo?.damageSummary && (
                            <div className="text-indigo-800 mt-0.5">
                              Hasar/Konu: {rec.vehicleInfo.damageSummary}
                            </div>
                          )}
                          {rec.vehicleInfo?.inspectionPlace && (
                            <div className="text-indigo-700 mt-0.5">
                              Araç Yeri: {rec.vehicleInfo.inspectionPlace}
                            </div>
                          )}
                        </div>
                      )}

                      {adaParselText && (
                        <div className="mt-1.5 rounded border border-amber-200 bg-amber-50/80 px-2 py-1 text-[11px] text-amber-900">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono font-bold">
                              📐 {adaParselText}
                            </span>
                            {rec.yuzolcumuM2 && (
                              <span className="font-mono text-amber-800">
                                · {formatAreaM2(rec.yuzolcumuM2)} m²
                              </span>
                            )}
                            {rec.nitelik && (
                              <span className="text-amber-800">
                                · {rec.nitelik}
                              </span>
                            )}
                          </div>
                          {rec.parcels && rec.parcels.length > 1 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {rec.parcels.map((p, pIdx) => (
                                <span
                                  key={p.id || pIdx}
                                  className="rounded bg-white/90 border border-amber-300 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-950"
                                >
                                  {pIdx + 1}){" "}
                                  {p.neighborhood
                                    ? `${p.neighborhood.replace(/\s+Mahallesi$/i, "")} `
                                    : ""}
                                  {p.adaNo}/{p.parselNo}
                                  {p.bagimsizBolumNo
                                    ? ` [B.Bölüm: ${p.bagimsizBolumNo}]`
                                    : ""}
                                  {p.yuzolcumuM2
                                    ? ` (${formatAreaM2(p.yuzolcumuM2)} m²)`
                                    : ""}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {addressText && (
                        <div className="mt-1.5 rounded border border-teal-200 bg-teal-50/80 px-2 py-1 text-[11px] text-teal-950">
                          <div className="font-bold">
                            🏠 Adres: {rec.addressDetail || "Açık Adres Keşfi"}
                          </div>
                          {(rec.bagimsizBolumNo || rec.nitelik) && (
                            <div className="text-teal-800 mt-0.5 font-medium">
                              {[
                                rec.bagimsizBolumNo
                                  ? `Daire / Bağımsız Bölüm No: ${rec.bagimsizBolumNo}`
                                  : "",
                                rec.nitelik ? `Nitelik: ${rec.nitelik}` : "",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          )}
                        </div>
                      )}

                      {wf && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600">
                          {renderWeatherIcon(wf.condition, "h-3.5 w-3.5")}
                          <span>{wf.label}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {wf.tempMax}° / {wf.tempMin}°C
                          </span>
                        </div>
                      )}

                      <div className="mt-2 flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                        <span className="font-mono text-xs text-emerald-700 tabular-nums font-medium">
                          {rec.distanceKm} km (~{rec.durationMin} dk)
                        </span>
                        <select
                          value={status}
                          onChange={(e) =>
                            onUpdateStatus(
                              rec.id,
                              e.target.value as InspectionStatus
                            )
                          }
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none"
                        >
                          {(
                            Object.keys(STATUS_LABELS) as InspectionStatus[]
                          ).map((stKey) => (
                            <option key={stKey} value={stKey}>
                              {STATUS_LABELS[stKey]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2 pt-1">
                {onShareDailyRoute && (
                  <button
                    type="button"
                    onClick={() => onShareDailyRoute(selectedDate)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                  >
                    <Share2 className="h-4 w-4" />
                    {formatDateTR(selectedDate)} Güzergahını Paylaş (Duraklar & Dosya No)
                  </button>
                )}

                <button
                  onClick={() => onOpenOnMap(selectedDate)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  <Navigation className="h-4 w-4 text-emerald-400" />
                  {formatDateTR(selectedDate)} Güzergahını & Parselleri Haritada Çiz
                </button>
              </div>
            </div>
          ) : (
            <div className="my-12 text-center space-y-3">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <FileText className="h-5 w-5" />
              </div>
              <div className="text-sm font-semibold text-slate-800">
                Bu günde planlanmış keşif bulunmuyor
              </div>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Duruşma sırasında bu tarihe yeni bir keşif günü vermek için aşağıdaki butona tıklayabilirsiniz.
              </p>
              {selectedDate && (
                <button
                  onClick={() => onAddForDate(selectedDate)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Plus className="h-4 w-4" />
                  {formatDateTR(selectedDate)} Tarihine Keşif Planla
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 border-t border-slate-100 pt-3 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Merkez: Fatsa Adliyesi</span>
          <span className="font-mono tabular-nums">41.0287, 37.5008</span>
        </div>
      </div>
    </div>
  );
};
