import React, { useState, useMemo } from "react";
import {
  FileSpreadsheet,
  FileText,
  MapPin,
  Pencil,
  Send,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  ActiveTab,
  InspectionRecord,
  RegisteredExpert,
} from "../types";
import {
  formatAdaParselLabel,
  formatAddressLabel,
  formatDateTR,
  formatVehicleLabel,
} from "../services/geoService";
import { STATUS_LABELS } from "../services/pdfService";

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  inspections: InspectionRecord[];
  registeredExperts: RegisteredExpert[];
  onEditInspection: (rec: InspectionRecord) => void;
  onPrepareMinutesForRecord: (recId: string) => void;
  onOpenParcelOnMap: (rec: InspectionRecord) => void;
  onOpenExcelModal: () => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

interface AssistantTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  matchedRecords?: InspectionRecord[];
  suggestedAction?: {
    label: string;
    onClick: () => void;
  };
}

const EXAMPLE_COMMANDS = [
  "Bugünkü keşiflerimi göster",
  "Yarınki keşiflerimi listele",
  "Bu haftaki tamamlanmamış keşifleri bul",
  "Zapt bekleyen keşifleri listele",
  "Yakın konumdaki keşifleri listele",
  "Aylık keşif raporu özeti",
  "Bilirkişi görevlerini listele",
];

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
  isOpen,
  onClose,
  inspections,
  registeredExperts,
  onEditInspection,
  onPrepareMinutesForRecord,
  onOpenParcelOnMap,
  onOpenExcelModal,
  onNavigateTab,
}) => {
  const [inputQuery, setInputQuery] = useState("");
  const [turns, setTurns] = useState<AssistantTurn[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      text: "Merhaba! Fatsa 2. Sulh Hukuk Mahkemesi Keşif Saha Asistanıyım. Yalnızca veritabanınızdaki gerçek keşif ve bilirkişi kayıtlarına dayanarak sorularınızı yanıtlarım. Aşağıdaki hazır komutlardan birini seçebilir veya doğal Türkçe ile soru sorabilirsiniz.",
    },
  ]);

  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const tomorrowIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  if (!isOpen) return null;

  const evaluateNaturalQuery = (rawCommand: string): AssistantTurn => {
    const q = rawCommand.trim().toLocaleLowerCase("tr-TR");

    // 1. Bugünkü keşifler
    if (q.includes("bugün")) {
      const list = inspections
        .filter((r) => r.date === todayIso && r.status !== "iptal_edildi")
        .sort((a, b) => a.time.localeCompare(b.time));
      return {
        id: `ans-${Date.now()}`,
        role: "assistant",
        text:
          list.length > 0
            ? `Bugün (${formatDateTR(todayIso)}) için veritabanında toplam ${list.length} adet aktif keşif kaydı bulundu:`
            : `Bugün (${formatDateTR(todayIso)}) için veritabanında kayıtlı keşif bulunmamaktadır.`,
        matchedRecords: list,
      };
    }

    // 2. Yarınki keşifler
    if (q.includes("yarın")) {
      const list = inspections
        .filter((r) => r.date === tomorrowIso && r.status !== "iptal_edildi")
        .sort((a, b) => a.time.localeCompare(b.time));
      return {
        id: `ans-${Date.now()}`,
        role: "assistant",
        text:
          list.length > 0
            ? `Yarın (${formatDateTR(tomorrowIso)}) için veritabanında toplam ${list.length} adet planlanmış keşif kaydı bulundu:`
            : `Yarın (${formatDateTR(tomorrowIso)}) için veritabanında kayıtlı keşif bulunmamaktadır.`,
        matchedRecords: list,
      };
    }

    // 3. Bu haftaki / tamamlanmamış keşifler
    if (
      q.includes("tamamlanmamış") ||
      q.includes("bekleyen") ||
      q.includes("bu hafta")
    ) {
      const list = inspections
        .filter((r) => {
          const st = r.status || "planlandi";
          return st !== "yapildi" && st !== "iptal_edildi";
        })
        .sort((a, b) => a.date.localeCompare(b.date));
      return {
        id: `ans-${Date.now()}`,
        role: "assistant",
        text:
          list.length > 0
            ? `Veritabanında henüz tamamlanmamış (planlanan, hazırlıkta veya ertelenen) toplam ${list.length} adet keşif dosyası bulunmaktadır:`
            : "Veritabanında tamamlanmamış bekleyen keşif kaydı bulunmamaktadır.",
        matchedRecords: list.slice(0, 10),
      };
    }

    // 4. Zapt taslağı / zapt bekleyenler
    if (q.includes("zapt") || q.includes("zabıt")) {
      const list = inspections.filter(
        (r) =>
          r.status !== "iptal_edildi" &&
          (r.status === "zapt_bekliyor" ||
            r.status === "yapildi" ||
            r.status === "planlandi")
      );
      return {
        id: `ans-${Date.now()}`,
        role: "assistant",
        text: `Keşif zaptı hazırlanabilecek ${list.length} adet dosya bulundu. İstediğiniz dosyanın yanındaki "Zapt Hazırla" butonuna tıklayarak resmi şablonda Word (.doc) zapt taslağını açabilirsiniz (nihai belge kullanıcı onayı ile indirilir):`,
        matchedRecords: list.slice(0, 8),
        suggestedAction: {
          label: "Keşif Zaptı Hazırlama Modülünü Aç",
          onClick: () => {
            onNavigateTab("kesif_zapti");
            onClose();
          },
        },
      };
    }

    // 5. Bilirkişi görevleri
    if (q.includes("bilirkişi") || q.includes("heyet")) {
      const lines: string[] = [];
      lines.push(
        `Sistemde kayıtlı ${registeredExperts.length} bilirkişi bulunmaktadır:`
      );
      registeredExperts.forEach((exp) => {
        const assignedCount = inspections.filter(
          (r) =>
            r.assignedExpertIds?.includes(exp.id) ||
            (r.experts || "")
              .toLocaleLowerCase("tr-TR")
              .includes(exp.fullName.toLocaleLowerCase("tr-TR")) ||
            (r.experts || "")
              .toLocaleLowerCase("tr-TR")
              .includes(exp.title.toLocaleLowerCase("tr-TR"))
        ).length;
        lines.push(
          `• ${exp.fullName} (${exp.title} · Sicil: ${exp.sicilNo}) — İlişkili Dosya: ${assignedCount}`
        );
      });
      return {
        id: `ans-${Date.now()}`,
        role: "assistant",
        text: lines.join("\n"),
        suggestedAction: {
          label: "Bilirkişi Yönetimi Ekranını Aç",
          onClick: () => {
            onNavigateTab("bilirkisiler");
            onClose();
          },
        },
      };
    }

    // 6. Aylık keşif raporu
    if (q.includes("aylık") || q.includes("rapor") || q.includes("istatistik")) {
      const ym = todayIso.slice(0, 7);
      const monthRecs = inspections.filter(
        (r) => r.date.startsWith(ym) && r.status !== "iptal_edildi"
      );
      const doneRecs = monthRecs.filter((r) => r.status === "yapildi");
      const totalKm = Number(
        monthRecs.reduce((acc, r) => acc + (r.distanceKm || 0), 0).toFixed(1)
      );
      return {
        id: `ans-${Date.now()}`,
        role: "assistant",
        text: `${ym} dönemi gerçek veritabanı özeti:\n• Toplam Keşif: ${monthRecs.length} dosya\n• Tamamlanan (Yapılan): ${doneRecs.length} dosya\n• Toplam Tek Yön Mesafe: ${totalKm} km`,
        matchedRecords: monthRecs.slice(0, 6),
        suggestedAction: {
          label: "Aylık Excel Raporu Penceresini Aç",
          onClick: () => {
            onClose();
            onOpenExcelModal();
          },
        },
      };
    }

    // 7. Yakın konumdaki keşifler
    if (q.includes("yakın") || q.includes("güzergah") || q.includes("rota")) {
      const byMah = new Map<string, InspectionRecord[]>();
      inspections
        .filter((r) => r.status !== "iptal_edildi")
        .forEach((r) => {
          const k = `${r.district} - ${r.neighborhood}`;
          byMah.set(k, [...(byMah.get(k) || []), r]);
        });
      const clusters = Array.from(byMah.entries()).filter(
        ([, arr]) => arr.length >= 2
      );
      if (clusters.length === 0) {
        return {
          id: `ans-${Date.now()}`,
          role: "assistant",
          text: "Veritabanında aynı mahallede birden fazla aktif keşif bulunan küme tespit edilmedi.",
        };
      }
      const flat = clusters.flatMap(([, arr]) => arr).slice(0, 8);
      return {
        id: `ans-${Date.now()}`,
        role: "assistant",
        text: `Aynı mahallede bulunan ${clusters.length} mahalle grubu tespit edildi (${clusters
          .map(([k, arr]) => `${k}: ${arr.length} dosya`)
          .join(", ")}):`,
        matchedRecords: flat,
      };
    }

    // 8. Mahalle, Esas No, Ada/Parsel veya Genel Arama
    const cleanToken = q
      .replace(/mahallesi'ndeki|mahallesindeki|keşifleri|getir|göster|ara|bul|listele/g, "")
      .trim();

    const matched = inspections.filter((r) => {
      const hay = [
        r.esasNo,
        r.district,
        r.neighborhood,
        r.adaNo,
        r.parselNo,
        r.addressDetail,
        r.partyName,
        r.caseType,
        r.experts,
        r.notes,
        r.judgeName,
        r.clerkName,
        ...(r.parcels || []).map(
          (p) => `${p.neighborhood || ""} ${p.adaNo}/${p.parselNo}`
        ),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR");
      return cleanToken ? hay.includes(cleanToken) : true;
    });

    return {
      id: `ans-${Date.now()}`,
      role: "assistant",
      text:
        matched.length > 0
          ? `"${rawCommand}" sorgunuzla eşleşen ${matched.length} adet gerçek keşif kaydı bulundu:`
          : `"${rawCommand}" sorgunuzla eşleşen herhangi bir keşif kaydı veritabanında bulunamadı.`,
      matchedRecords: matched.slice(0, 10),
    };
  };

  const handleSendCommand = (cmdText?: string) => {
    const textToUse = (cmdText ?? inputQuery).trim();
    if (!textToUse) return;
    const userTurn: AssistantTurn = {
      id: `u-${Date.now()}`,
      role: "user",
      text: textToUse,
    };
    const botTurn = evaluateNaturalQuery(textToUse);
    setTurns((prev) => [...prev, userTurn, botTurn]);
    if (!cmdText) setInputQuery("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-3 sm:p-4 backdrop-blur-xs">
      <div className="flex h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
        {/* Başlık */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#1B2733] px-5 py-3.5 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-5 w-5 text-[#63B5B0] shrink-0" />
            <div>
              <h2 className="text-sm sm:text-base font-bold">
                Yapay Zekâ Destekli Keşif & Saha Asistanı
              </h2>
              <p className="text-[11px] text-slate-300">
                Gerçek veritabanı kayıtlarına dayalı doğal Türkçe sorgu ve işlem yardımcısı
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Hızlı Örnek Komutlar */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-slate-50 px-4 py-2.5 shrink-0">
          {EXAMPLE_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => handleSendCommand(cmd)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-[#246B73] hover:text-[#246B73] whitespace-nowrap shrink-0"
            >
              {cmd}
            </button>
          ))}
        </div>

        {/* Konuşma Geçmişi */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {turns.map((t) => (
            <div
              key={t.id}
              className={`flex flex-col ${
                t.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[92%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                  t.role === "user"
                    ? "bg-[#246B73] text-white font-semibold"
                    : "border border-slate-200 bg-slate-50 text-slate-900"
                }`}
              >
                {t.text}

                {t.matchedRecords && t.matchedRecords.length > 0 && (
                  <div className="mt-2.5 space-y-2">
                    {t.matchedRecords.map((rec) => {
                      const parcelStr =
                        formatAdaParselLabel(rec) ||
                        formatAddressLabel(rec) ||
                        formatVehicleLabel(rec);
                      const st = rec.status || "planlandi";
                      return (
                        <div
                          key={rec.id}
                          className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 space-y-1.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="font-mono font-bold text-slate-900">
                              {rec.esasNo} · [{rec.district}] {rec.neighborhood}
                            </span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                              {STATUS_LABELS[st] || st}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 font-mono">
                            Tarih: {formatDateTR(rec.date)} {rec.time}
                            {parcelStr ? ` · ${parcelStr}` : ""} ·{" "}
                            {rec.distanceKm} km
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onEditInspection(rec);
                              }}
                              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-800"
                            >
                              <Pencil className="h-2.5 w-2.5" />
                              <span>Detay / Düzenle</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onPrepareMinutesForRecord(rec.id);
                              }}
                              className="inline-flex items-center gap-1 rounded bg-purple-600 px-2 py-0.5 text-[10px] font-bold text-white"
                            >
                              <FileText className="h-2.5 w-2.5" />
                              <span>Zapt Hazırla</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenParcelOnMap(rec);
                              }}
                              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                            >
                              <MapPin className="h-2.5 w-2.5" />
                              <span>Harita</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {t.suggestedAction && (
                  <div className="mt-2.5 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={t.suggestedAction.onClick}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#246B73] px-3 py-1.5 text-xs font-bold text-white"
                    >
                      <span>{t.suggestedAction.label} &rarr;</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Komut Giriş Kutusu */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendCommand();
          }}
          className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 p-3.5 shrink-0"
        >
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="Örn: Ilıca Mahallesi'ndeki keşifleri getir veya 2026/145 esas ara..."
            className="flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 focus:border-[#246B73] focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#246B73] px-4 py-2.5 text-xs font-bold text-white"
          >
            <Send className="h-4 w-4" />
            <span>Sor</span>
          </button>
        </form>
      </div>
    </div>
  );
};
