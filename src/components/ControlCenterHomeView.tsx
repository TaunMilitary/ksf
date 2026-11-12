import React, { useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  Eye,
  EyeOff,
  FileDown,
  FileSpreadsheet,
  FileText,
  Layers,
  MapPin,
  Mic,
  Navigation,
  Pencil,
  Plus,
  Route,
  Sparkles,
  Users,
  Wifi,
  WifiOff,
  AlertTriangle,
  BarChart3,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  ActiveTab,
  CourtDistrict,
  InspectionRecord,
  RegisteredExpert,
  WeatherForecast,
} from "../types";
import {
  formatAdaParselLabel,
  formatAddressLabel,
  formatAreaM2,
  formatDateTR,
  formatLongDateTR,
  formatVehicleLabel,
} from "../services/geoService";
import { STATUS_LABELS } from "../services/pdfService";
import { renderWeatherIcon } from "./CalendarView";

interface ControlCenterHomeViewProps {
  inspections: InspectionRecord[];
  registeredExperts: RegisteredExpert[];
  weatherMap: Record<string, WeatherForecast>;
  selectedDistrict: CourtDistrict | "Tümü";
  onChangeDistrict: (d: CourtDistrict | "Tümü") => void;
  onNavigateTab: (tab: ActiveTab) => void;
  onOpenNewInspection: () => void;
  onEditInspection: (rec: InspectionRecord) => void;
  onPrepareMinutesForRecord: (recId: string) => void;
  onOpenMediaModalForRecord: (rec: InspectionRecord) => void;
  onOpenAiAssistant: () => void;
  onOpenPdfModal: () => void;
  onOpenExcelModal: () => void;
  onOpenParcelOnMap: (rec: InspectionRecord) => void;
  onCompleteInspection: (rec: InspectionRecord) => void;
  hiddenWidgets: string[];
  onToggleWidgetVisibility: (widgetId: string) => void;
}

const DEFAULT_WIDGET_ORDER = [
  { id: "quick_actions", title: "Hızlı İşlem Merkezi" },
  { id: "today_upcoming", title: "Bugünkü & Yaklaşan Keşif Programı" },
  { id: "incomplete_minutes", title: "Tamamlanmamış İşlemler & Zapt Bekleyenler" },
  { id: "nearby_clusters", title: "Aynı Mahalle / Yakın Konum Keşif Önerileri" },
  { id: "recent_added", title: "Son Eklenen Keşif Kayıtları" },
];

export const ControlCenterHomeView: React.FC<ControlCenterHomeViewProps> = ({
  inspections,
  registeredExperts,
  weatherMap,
  selectedDistrict,
  onChangeDistrict,
  onNavigateTab,
  onOpenNewInspection,
  onEditInspection,
  onPrepareMinutesForRecord,
  onOpenMediaModalForRecord,
  onOpenAiAssistant,
  onOpenPdfModal,
  onOpenExcelModal,
  onOpenParcelOnMap,
  onCompleteInspection,
  hiddenWidgets,
  onToggleWidgetVisibility,
}) => {
  const [showCustomizePanel, setShowCustomizePanel] = useState(false);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(() =>
    DEFAULT_WIDGET_ORDER.map((w) => w.id)
  );
  const isOnline =
    typeof navigator !== "undefined" ? navigator.onLine : true;

  const todayIso = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const filteredRecords = useMemo(() => {
    if (selectedDistrict === "Tümü") return inspections;
    return inspections.filter((r) => r.district === selectedDistrict);
  }, [inspections, selectedDistrict]);

  // Gerçek veritabanından hesaplanan özet istatistikler
  const metrics = useMemo(() => {
    const todayRecords = filteredRecords
      .filter((r) => r.date === todayIso && r.status !== "iptal_edildi")
      .sort((a, b) => a.time.localeCompare(b.time));

    const completedRecords = filteredRecords.filter(
      (r) => r.status === "yapildi"
    );

    const pendingRecords = filteredRecords.filter((r) => {
      const st = r.status || "planlandi";
      return (
        st === "planlandi" ||
        st === "hazirlik" ||
        st === "yola_cikildi" ||
        st === "kesif_basladi"
      );
    });

    const postponedRecords = filteredRecords.filter(
      (r) => r.status === "ertelendi"
    );

    // Zapt bekleyenler: durumu zapt_bekliyor olanlar veya yapildi/planlandi olup henüz customMinutesText / assignedExpertIds tamamlanmamış olanlar
    const pendingMinutesRecords = filteredRecords.filter((r) => {
      if (r.status === "iptal_edildi") return false;
      if (r.status === "zapt_bekliyor") return true;
      if (
        r.status === "yapildi" &&
        !r.minutesPreparedAt &&
        !r.customMinutesText
      ) {
        return true;
      }
      return false;
    });

    const upcomingRecords = filteredRecords
      .filter(
        (r) =>
          r.date >= todayIso &&
          r.status !== "iptal_edildi" &&
          r.status !== "yapildi"
      )
      .sort((a, b) => {
        const d = a.date.localeCompare(b.date);
        return d !== 0 ? d : a.time.localeCompare(b.time);
      });

    const recentRecords = [...filteredRecords]
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 5);

    // Aynı mahallede veya 3 km yarıçapta farklı günlerde planlanmış yakın keşif önerileri
    const activePlanned = filteredRecords.filter(
      (r) =>
        (r.status || "planlandi") !== "yapildi" &&
        r.status !== "iptal_edildi"
    );
    const byNeighborhood = new Map<string, InspectionRecord[]>();
    for (const rec of activePlanned) {
      const key = `${rec.district}::${rec.neighborhood}`;
      const arr = byNeighborhood.get(key) || [];
      arr.push(rec);
      byNeighborhood.set(key, arr);
    }
    const nearbyGroups = Array.from(byNeighborhood.entries())
      .filter(([, list]) => list.length >= 2)
      .map(([key, list]) => {
        const [district, neighborhood] = key.split("::");
        const uniqueDays = Array.from(new Set(list.map((r) => r.date))).sort();
        return {
          district,
          neighborhood,
          count: list.length,
          uniqueDays,
          records: list,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    return {
      todayRecords,
      completedCount: completedRecords.length,
      pendingCount: pendingRecords.length,
      postponedCount: postponedRecords.length,
      pendingMinutesRecords,
      upcomingRecords,
      recentRecords,
      nearbyGroups,
    };
  }, [filteredRecords, todayIso]);

  const todayWeather = useMemo(() => {
    const firstToday = metrics.todayRecords[0];
    if (firstToday && weatherMap[firstToday.id]) return weatherMap[firstToday.id];
    const firstUpcoming = metrics.upcomingRecords[0];
    if (firstUpcoming && weatherMap[firstUpcoming.id])
      return weatherMap[firstUpcoming.id];
    return null;
  }, [metrics.todayRecords, metrics.upcomingRecords, weatherMap]);

  const moveWidget = (id: string, dir: -1 | 1) => {
    setWidgetOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[target];
      copy[target] = temp;
      return copy;
    });
  };

  return (
    <div className="space-y-5">
      {/* ÜST DURUM VE KONTROL MERKEZİ BAŞLIĞI */}
      <div className="app-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[#246B73]/12 px-2.5 py-0.5 text-[11px] font-bold text-[#246B73]">
                <Compass className="h-3.5 w-3.5" />
                <span>SAHA & İŞ KONTROL MERKEZİ</span>
              </span>
              <span className="font-mono text-xs font-semibold text-slate-500">
                {formatLongDateTR(todayIso)}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                  isOnline
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}
              >
                {isOnline ? (
                  <>
                    <Wifi className="h-3 w-3" />
                    <span>Çevrimiçi · Yerel + Bulut Hazır</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3 w-3" />
                    <span>Çevrimdışı Saha Modu (Kayıtlar Korunuyor)</span>
                  </>
                )}
              </span>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">
              Fatsa 2. Sulh Hukuk Mahkemesi — Günlük Keşif ve Saha Yönetim Paneli
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Hava Durumu Özeti */}
            {todayWeather && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
                {renderWeatherIcon(todayWeather.condition, "h-4 w-4")}
                <div>
                  <div className="font-bold text-slate-900 tabular-nums">
                    {todayWeather.tempMax}° / {todayWeather.tempMin}°C ·{" "}
                    {todayWeather.label}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Yağış İhtimali: %{todayWeather.precipitationProb}
                  </div>
                </div>
              </div>
            )}

            {/* İlçe Seçimi */}
            <select
              value={selectedDistrict}
              onChange={(e) =>
                onChangeDistrict(e.target.value as CourtDistrict | "Tümü")
              }
              aria-label="Kontrol Merkezi İlçe Filtresi"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-[#246B73] focus:outline-none"
            >
              <option value="Tümü">Tüm İlçeler ({inspections.length})</option>
              <option value="Fatsa">
                Fatsa ({inspections.filter((r) => r.district === "Fatsa").length})
              </option>
              <option value="Çamaş">
                Çamaş ({inspections.filter((r) => r.district === "Çamaş").length})
              </option>
              <option value="Çatalpınar">
                Çatalpınar (
                {inspections.filter((r) => r.district === "Çatalpınar").length})
              </option>
            </select>

            <button
              type="button"
              onClick={() => setShowCustomizePanel((p) => !p)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              title="Ana sayfa kartlarını gizle/göster veya sırala"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Kartları Düzenle</span>
            </button>
          </div>
        </div>

        {/* Kart Görünürlük ve Sıralama Paneli */}
        {showCustomizePanel && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span>Ana Sayfa Bölümlerini Gizle / Göster veya Sırala</span>
              <button
                type="button"
                onClick={() => setShowCustomizePanel(false)}
                className="text-slate-500 hover:text-slate-900"
              >
                Kapat
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {widgetOrder.map((wId, idx) => {
                const meta = DEFAULT_WIDGET_ORDER.find((w) => w.id === wId);
                if (!meta) return null;
                const isHidden = hiddenWidgets.includes(wId);
                return (
                  <div
                    key={wId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleWidgetVisibility(wId)}
                      className="flex items-center gap-2 font-semibold text-slate-800 text-left"
                    >
                      {isHidden ? (
                        <EyeOff className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      ) : (
                        <Eye className="h-3.5 w-3.5 text-[#246B73] shrink-0" />
                      )}
                      <span className={isHidden ? "line-through text-slate-400" : ""}>
                        {meta.title}
                      </span>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveWidget(wId, -1)}
                        className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                        title="Yukarı Taşı"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === widgetOrder.length - 1}
                        onClick={() => moveWidget(wId, 1)}
                        className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                        title="Aşağı Taşı"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 5 ÖZET İSTATİSTİK KARTI (GERÇEK VERİTABANINDAN HESAPLANIR) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <button
          type="button"
          onClick={() => onNavigateTab("ajanda")}
          className="app-card p-3.5 text-left transition-all hover:border-[#246B73]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Bugünkü Keşif
            </span>
            <Calendar className="h-4 w-4 text-[#246B73]" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {metrics.todayRecords.length}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {formatDateTR(todayIso)} günü programı
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab("istatistikler")}
          className="app-card p-3.5 text-left transition-all hover:border-[#16845B]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Tamamlanan
            </span>
            <CheckCircle2 className="h-4 w-4 text-[#16845B]" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#16845B] tabular-nums">
            {metrics.completedCount}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            İcra edilen keşif dosyası
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab("ajanda")}
          className="app-card p-3.5 text-left transition-all hover:border-[#397FA5]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Bekleyen Keşif
            </span>
            <Clock className="h-4 w-4 text-[#397FA5]" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#397FA5] tabular-nums">
            {metrics.pendingCount}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Planlanan / hazırlıkta
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab("ajanda")}
          className="app-card p-3.5 text-left transition-all hover:border-[#D69A35]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Ertelenen
            </span>
            <AlertTriangle className="h-4 w-4 text-[#D69A35]" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#D69A35] tabular-nums">
            {metrics.postponedCount}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Yeni gün bekleyen dosya
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab("kesif_zapti")}
          className="app-card col-span-2 sm:col-span-1 p-3.5 text-left transition-all hover:border-purple-500"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Hazırlanacak Zapt
            </span>
            <FileText className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-purple-700 tabular-nums">
            {metrics.pendingMinutesRecords.length}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Word (.doc) zapt bekleyen
          </div>
        </button>
      </div>

      {/* SIRALANABİLİR VE GİZLENEBİLİR BÖLÜMLER */}
      {widgetOrder.map((wId) => {
        if (hiddenWidgets.includes(wId)) return null;

        if (wId === "quick_actions") {
          return (
            <div key={wId} className="app-card p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                  Hızlı İşlem Alanı (Minimum Dokunuşla Erişim)
                </h2>
                <span className="text-[11px] text-slate-500">
                  En sık kullanılan saha ve kalem işlemleri
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
                <button
                  type="button"
                  onClick={onOpenNewInspection}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-[#246B73]/30 bg-[#246B73] p-3 text-left text-white shadow-xs hover:bg-[#1D575E] transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-xs font-bold">+ Yeni Keşif</span>
                  <span className="text-[10px] opacity-85">
                    Parsel, Adres, Araç
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab("kesif_zapti")}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-purple-300 bg-purple-50 p-3 text-left text-purple-950 hover:bg-purple-100 transition-colors"
                >
                  <FileText className="h-4 w-4 text-purple-700" />
                  <span className="text-xs font-bold">Zapt Hazırla</span>
                  <span className="text-[10px] text-slate-600">
                    Word (.doc) Şablon
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab("harita")}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-slate-900 hover:border-[#246B73] transition-colors"
                >
                  <Layers className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-bold">TKGM & Harita</span>
                  <span className="text-[10px] text-slate-500">
                    Ada/Parsel Sınırı
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab("bilirkisiler")}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-slate-900 hover:border-[#246B73] transition-colors"
                >
                  <Users className="h-4 w-4 text-[#246B73]" />
                  <span className="text-xs font-bold">
                    Bilirkişiler ({registeredExperts.length})
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Heyet & Sicil Rehberi
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onOpenAiAssistant}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left text-emerald-950 hover:bg-emerald-100 transition-colors"
                >
                  <Sparkles className="h-4 w-4 text-emerald-700" />
                  <span className="text-xs font-bold">YZ Saha Asistanı</span>
                  <span className="text-[10px] text-slate-600">
                    Doğal Türkçe Komut
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab("ai_rota")}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-slate-900 hover:border-[#246B73] transition-colors"
                >
                  <Route className="h-4 w-4 text-[#397FA5]" />
                  <span className="text-xs font-bold">Akıllı Güzergâh</span>
                  <span className="text-[10px] text-slate-500">
                    Çoklu Mahalle Planı
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onOpenExcelModal}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-slate-900 hover:border-[#16845B] transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4 text-[#16845B]" />
                  <span className="text-xs font-bold">Aylık Excel</span>
                  <span className="text-[10px] text-slate-500">
                    Personel & Dosya
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onOpenPdfModal}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-slate-900 hover:border-[#246B73] transition-colors"
                >
                  <FileDown className="h-4 w-4 text-[#246B73]" />
                  <span className="text-xs font-bold">PDF Programı</span>
                  <span className="text-[10px] text-slate-500">
                    Günlük / Haftalık
                  </span>
                </button>
              </div>
            </div>
          );
        }

        if (wId === "today_upcoming") {
          return (
            <div
              key={wId}
              className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start"
            >
              {/* Bugünkü Keşif Programı */}
              <div className="lg:col-span-6 app-card p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div>
                    <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                      Bugünkü Keşif Programı ({formatDateTR(todayIso)})
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Bugün icra edilecek dosyalar ve saha aksiyonları
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateTab("ajanda")}
                    className="text-xs font-semibold text-[#246B73] hover:underline"
                  >
                    Tüm Ajanda &rarr;
                  </button>
                </div>

                {metrics.todayRecords.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center space-y-2">
                    <p className="text-xs font-semibold text-slate-700">
                      Bugün ({formatDateTR(todayIso)}) için kayıtlı keşif bulunmuyor.
                    </p>
                    <button
                      type="button"
                      onClick={onOpenNewInspection}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#246B73] px-3 py-1.5 text-xs font-bold text-white"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Yeni Keşif Planla</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {metrics.todayRecords.map((rec, idx) => {
                      const parcelStr =
                        formatAdaParselLabel(rec) ||
                        formatAddressLabel(rec) ||
                        formatVehicleLabel(rec);
                      return (
                        <div
                          key={rec.id}
                          className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="rounded bg-[#246B73] px-2 py-0.5 font-mono text-[11px] font-bold text-white tabular-nums">
                                {idx + 1}. Durak · {rec.time}
                              </span>
                              <span className="font-mono font-bold text-slate-900 tabular-nums">
                                {rec.esasNo}
                              </span>
                              <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                {rec.district}
                              </span>
                            </div>
                            <span className="font-mono text-[11px] font-semibold text-slate-600 tabular-nums">
                              {rec.distanceKm} km (~{rec.durationMin} dk)
                            </span>
                          </div>
                          <div className="text-xs font-bold text-slate-900">
                            {rec.neighborhood}
                            {parcelStr && (
                              <span className="ml-1.5 font-mono font-semibold text-amber-800">
                                · {parcelStr}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => onCompleteInspection(rec)}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#16845B] px-2.5 py-1 text-[11px] font-bold text-white"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Yapıldı İşaretle</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenMediaModalForRecord(rec)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800"
                            >
                              <Mic className="h-3 w-3 text-[#246B73]" />
                              <span>Sesli Not & Foto</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onPrepareMinutesForRecord(rec.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-purple-300 bg-purple-50 px-2.5 py-1 text-[11px] font-bold text-purple-900"
                            >
                              <FileText className="h-3 w-3" />
                              <span>Zapt</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenParcelOnMap(rec)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                            >
                              <MapPin className="h-3 w-3" />
                              <span>Harita</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Yaklaşan Keşifler */}
              <div className="lg:col-span-6 app-card p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div>
                    <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                      Yaklaşan Keşifler ({metrics.upcomingRecords.length} Dosya)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      İleri tarihli planlanmış keşif dosyaları
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateTab("takvim")}
                    className="text-xs font-semibold text-[#246B73] hover:underline"
                  >
                    Takvim Görünümü &rarr;
                  </button>
                </div>

                {metrics.upcomingRecords.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-500">
                    Yaklaşan planlı keşif kaydı bulunmuyor.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {metrics.upcomingRecords.slice(0, 5).map((rec) => {
                      const parcelStr =
                        formatAdaParselLabel(rec) ||
                        formatAddressLabel(rec) ||
                        formatVehicleLabel(rec);
                      return (
                        <div
                          key={rec.id}
                          className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:flex-row sm:items-center"
                        >
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="font-mono font-bold text-[#246B73] tabular-nums">
                                {formatDateTR(rec.date)} · {rec.time}
                              </span>
                              <span className="font-mono font-bold text-slate-900 tabular-nums">
                                {rec.esasNo}
                              </span>
                              <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800">
                                {rec.district}
                              </span>
                            </div>
                            <div className="text-xs font-semibold text-slate-800">
                              {rec.neighborhood}
                              {parcelStr ? ` · ${parcelStr}` : ""}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {rec.caseType} · {rec.distanceKm} km
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => onOpenMediaModalForRecord(rec)}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                              title="Sesli Not ve Fotoğraf Ekle"
                            >
                              Not/Foto
                            </button>
                            <button
                              type="button"
                              onClick={() => onEditInspection(rec)}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800"
                            >
                              Düzenle
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        }

        if (wId === "incomplete_minutes") {
          return (
            <div key={wId} className="app-card p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div>
                  <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                    Tamamlanmamış İşlemler & Hazırlanacak Keşif Zaptları
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Keşfi icra edilmiş veya zapt bekliyor durumundaki dosyalar ile ertelenen kayıtlar
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab("kesif_zapti")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Zapt Hazırlama Ekranını Aç</span>
                </button>
              </div>

              {metrics.pendingMinutesRecords.length === 0 &&
              metrics.postponedCount === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                  ✓ Bekleyen keşif zaptı veya ertelenmiş dosya bulunmuyor.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {metrics.pendingMinutesRecords.slice(0, 6).map((rec) => (
                    <div
                      key={rec.id}
                      className="rounded-xl border border-purple-200 bg-purple-50/50 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-slate-900 tabular-nums">
                          {rec.esasNo}
                        </span>
                        <span className="rounded bg-purple-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          Zapt Hazırlanacak
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-800">
                        [{rec.district}] {rec.neighborhood}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Keşif Tarihi: {formatDateTR(rec.date)} · {rec.time}
                      </div>
                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => onPrepareMinutesForRecord(rec.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-2.5 py-1 text-[11px] font-bold text-white"
                        >
                          <FileText className="h-3 w-3" />
                          <span>Word Zapt Hazırla</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditInspection(rec)}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                        >
                          Düzenle
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }

        if (wId === "nearby_clusters") {
          return (
            <div key={wId} className="app-card p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div>
                  <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                    Yakındaki Keşif Önerileri & Aynı Mahalle Grupları
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Gerçek mahalle ve koordinat verilerine göre birleştirilebilecek aktif keşif dosyaları
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab("ai_rota")}
                  className="text-xs font-semibold text-[#246B73] hover:underline"
                >
                  Çoklu Rota Planlayıcı &rarr;
                </button>
              </div>

              {metrics.nearbyGroups.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                  Şu an aynı mahallede farklı günlere dağılmış bekleyen keşif kümesi bulunmuyor.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {metrics.nearbyGroups.map((grp) => (
                    <div
                      key={`${grp.district}-${grp.neighborhood}`}
                      className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">
                          [{grp.district}] {grp.neighborhood}
                        </span>
                        <span className="rounded-md bg-[#246B73]/15 px-2 py-0.5 font-mono text-[11px] font-bold text-[#246B73]">
                          {grp.count} Dosya
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600">
                        Dosyalar:{" "}
                        <span className="font-mono font-semibold text-slate-900">
                          {grp.records.map((r) => r.esasNo).join(", ")}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Planlanan Günler:{" "}
                        {grp.uniqueDays.map((d) => formatDateTR(d)).join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }

        if (wId === "recent_added") {
          return (
            <div key={wId} className="app-card p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <div>
                  <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                    Son Eklenen Keşifler
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Sisteme en son kaydedilen keşif dosyaları
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab("istatistikler")}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#246B73] hover:underline"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span>Tüm İstatistikler</span>
                </button>
              </div>

              {metrics.recentRecords.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                  Henüz keşif kaydı bulunmuyor.
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {metrics.recentRecords.map((rec) => {
                    const st = rec.status || "planlandi";
                    const parcelLabel =
                      formatAdaParselLabel(rec) ||
                      formatAddressLabel(rec) ||
                      formatVehicleLabel(rec);
                    return (
                      <div
                        key={rec.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 tabular-nums">
                            {rec.esasNo}
                          </span>
                          <span className="font-semibold text-slate-800">
                            [{rec.district}] {rec.neighborhood}
                          </span>
                          {parcelLabel && (
                            <span className="font-mono text-[11px] text-amber-800">
                              ({parcelLabel}
                              {rec.yuzolcumuM2
                                ? ` · ${formatAreaM2(rec.yuzolcumuM2)} m²`
                                : ""}
                              )
                            </span>
                          )}
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                            {STATUS_LABELS[st] || st}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {formatDateTR(rec.date)} {rec.time}
                          </span>
                          <button
                            type="button"
                            onClick={() => onEditInspection(rec)}
                            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:border-[#246B73]"
                          >
                            <Pencil className="h-3 w-3 inline mr-1" />
                            Düzenle
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};
