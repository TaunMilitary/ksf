import { jsPDF } from "jspdf";
import {
  InspectionRecord,
  InspectionStatus,
  PdfExportPeriod,
  WeatherForecast,
} from "../types";
import {
  formatAdaParselLabel,
  formatAddressLabel,
  formatAreaM2,
  formatDateTR,
  formatLongDateTR,
  formatVehicleLabel,
} from "./geoService";

export const STATUS_LABELS: Record<InspectionStatus, string> = {
  planlandi: "Planlandı",
  yapildi: "Keşif Yapıldı",
  ertelendi: "Ertelendi",
  iptal_edildi: "İptal Edildi",
};

/**
 * Verilen periyoda (günlük, haftalık, aylık) ve referans tarihe göre keşif kayıtlarını filtreler
 */
export function filterRecordsByPeriod(
  records: InspectionRecord[],
  period: PdfExportPeriod,
  referenceDate: string // YYYY-MM-DD
): {
  filtered: InspectionRecord[];
  title: string;
  subtitle: string;
} {
  const refParts = referenceDate.split("-").map(Number);
  const refYear = refParts[0] || new Date().getFullYear();
  const refMonth = (refParts[1] || 1) - 1;
  const refDay = refParts[2] || 1;
  const refObj = new Date(refYear, refMonth, refDay);

  const sorted = [...records].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return a.time.localeCompare(b.time);
  });

  if (period === "daily") {
    const filtered = sorted.filter((r) => r.date === referenceDate);
    return {
      filtered,
      title: `GÜNLÜK KEŞİF LİSTESİ (${formatDateTR(referenceDate)})`,
      subtitle: `${formatLongDateTR(referenceDate)} günü icra edilecek/planlanan keşif dosyaları`,
    };
  }

  if (period === "weekly") {
    // Pazartesi başlangıçlı hafta aralığı
    const dayOfWeek = (refObj.getDay() + 6) % 7; // 0 = Pzt ... 6 = Paz
    const monday = new Date(refYear, refMonth, refDay - dayOfWeek);
    const sunday = new Date(
      monday.getFullYear(),
      monday.getMonth(),
      monday.getDate() + 6
    );

    const toIso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;

    const startStr = toIso(monday);
    const endStr = toIso(sunday);

    const filtered = sorted.filter(
      (r) => r.date >= startStr && r.date <= endStr
    );
    return {
      filtered,
      title: `HAFTALIK KEŞİF PLANI (${formatDateTR(startStr)} - ${formatDateTR(
        endStr
      )})`,
      subtitle: `${formatDateTR(startStr)} ile ${formatDateTR(
        endStr
      )} tarihleri arasındaki haftalık keşif programı`,
    };
  }

  // Monthly
  const ymPrefix = `${refYear}-${String(refMonth + 1).padStart(2, "0")}`;
  const monthName = refObj.toLocaleDateString("tr-TR", {
    month: "long",
    year: "numeric",
  });
  const filtered = sorted.filter((r) => r.date.startsWith(ymPrefix));

  return {
    filtered,
    title: `AYLIK KEŞİF RAPORU (${monthName.toLocaleUpperCase("tr-TR")})`,
    subtitle: `${monthName} dönemi tüm mahalle keşifleri, durumları ve mesafe cetveli`,
  };
}

/**
 * Türkçe karakterleri (%100 kusursuz İ, Ş, Ğ, Ü, Ö, Ç desteği ile) yüksek çözünürlüklü
 * A4 Canvas katmanı üzerinden PDF sayfalarına işleyip doğrudan .pdf olarak indirir.
 */
export async function exportInspectionsToPdf(
  records: InspectionRecord[],
  period: PdfExportPeriod,
  referenceDate: string,
  weatherMap: Record<string, WeatherForecast>
): Promise<string> {
  const { filtered, title, subtitle } = filterRecordsByPeriod(
    records,
    period,
    referenceDate
  );

  // A4 Landscape dimensions in mm: 297 x 210
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const rowsPerPage = 7;
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));

  const totalKm = filtered
    .reduce((acc, r) => acc + (r.distanceKm || 0) * 2, 0)
    .toFixed(1);
  const completedCount = filtered.filter((r) => r.status === "yapildi").length;
  const plannedCount = filtered.filter(
    (r) => !r.status || r.status === "planlandi"
  ).length;
  const postponedCount = filtered.filter((r) => r.status === "ertelendi").length;
  const cancelledCount = filtered.filter(
    (r) => r.status === "iptal_edildi"
  ).length;

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) {
      doc.addPage("a4", "landscape");
    }

    const pageRecords = filtered.slice(
      pageIdx * rowsPerPage,
      (pageIdx + 1) * rowsPerPage
    );

    const canvas = document.createElement("canvas");
    // 2x Retina A4 Landscape (2376 x 1680 px)
    canvas.width = 2376;
    canvas.height = 1680;
    const ctx = canvas.getContext("2d")!;

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Top Institutional Header Banner
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(80, 65, canvas.width - 160, 155);

    ctx.fillStyle = "#10b981";
    ctx.fillRect(80, 65, 14, 155);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(
      "T.C. FATSA ADLİYESİ · SULH HUKUK MAHKEMESİ KALEMİ",
      125,
      122
    );

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 24px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(title, 125, 162);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "400 19px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(subtitle, 125, 196);

    // Right side summary in header
    ctx.textAlign = "right";
    ctx.fillStyle = "#10b981";
    ctx.font = "bold 22px 'JetBrains Mono', monospace";
    ctx.fillText(
      `Toplam: ${filtered.length} Dosya | ~${totalKm} KM`,
      canvas.width - 115,
      122
    );
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "500 18px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(
      `Planlı: ${plannedCount} · Yapıldı: ${completedCount} · Ertelendi: ${postponedCount} · İptal: ${cancelledCount}`,
      canvas.width - 115,
      158
    );
    ctx.fillStyle = "#94a3b8";
    ctx.font = "400 16px 'JetBrains Mono', monospace";
    ctx.fillText(
      `Rapor Tarihi: ${new Date().toLocaleDateString("tr-TR")} | Sayfa ${
        pageIdx + 1
      }/${totalPages}`,
      canvas.width - 115,
      194
    );
    ctx.textAlign = "left";

    // Table Columns Configuration
    const colX = [80, 175, 375, 595, 965, 1265, 1515, 1735, 1985];
    const tableTop = 255;
    const headerHeight = 62;

    // Table Header Bar
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(80, tableTop, canvas.width - 160, headerHeight);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.strokeRect(80, tableTop, canvas.width - 160, headerHeight);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 20px 'Plus Jakarta Sans', sans-serif";
    const headers = [
      "Sıra",
      "Tarih / Saat",
      "Esas No",
      "Konum & Parsel / Adres / Araç",
      "Dava / Keşif Türü",
      "Mesafe / Süre",
      "Hava Tahmini",
      "Keşif Durumu",
      "Bilirkişi & Notlar",
    ];
    headers.forEach((h, i) => {
      ctx.fillText(h, colX[i] + 14, tableTop + 39);
    });

    if (pageRecords.length === 0) {
      ctx.fillStyle = "#64748b";
      ctx.font = "500 24px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText(
        "Seçilen tarih aralığında kayıtlı keşif dosyası bulunmamaktadır.",
        120,
        tableTop + 140
      );
    } else {
      const rowHeight = 165;
      pageRecords.forEach((rec, idx) => {
        const y = tableTop + headerHeight + idx * rowHeight;
        const globalIndex = pageIdx * rowsPerPage + idx + 1;

        ctx.fillStyle = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        ctx.fillRect(80, y, canvas.width - 160, rowHeight);

        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(80, y, canvas.width - 160, rowHeight);

        // 1. Sıra
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 22px 'JetBrains Mono', monospace";
        ctx.fillText(`${globalIndex}`, colX[0] + 24, y + 60);

        // 2. Tarih / Saat
        ctx.font = "bold 20px 'JetBrains Mono', monospace";
        ctx.fillText(formatDateTR(rec.date), colX[1] + 14, y + 52);
        ctx.fillStyle = "#059669";
        ctx.font = "bold 20px 'JetBrains Mono', monospace";
        ctx.fillText(`Saat ${rec.time}`, colX[1] + 14, y + 86);

        // 3. Esas No
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 21px 'JetBrains Mono', monospace";
        ctx.fillText(rec.esasNo, colX[2] + 14, y + 58);

        // 4. Mahalle / İlçe / Çoklu Ada-Parsel veya Araç Plaka Bilgisi
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 20px 'Plus Jakarta Sans', sans-serif";
        const districtTag = rec.district ? `[${rec.district}] ` : "";
        ctx.fillText(
          `${districtTag}${rec.neighborhood}`.slice(0, 30),
          colX[3] + 14,
          y + 46
        );

        const vehicleLabel = formatVehicleLabel(rec);
        const adaParselLabel = formatAdaParselLabel(rec);
        const addressLabel = formatAddressLabel(rec);

        if (vehicleLabel) {
          ctx.fillStyle = "#3730a3";
          ctx.font = "bold 17px 'JetBrains Mono', monospace";
          ctx.fillText(
            `Araç: ${vehicleLabel}`.slice(0, 34),
            colX[3] + 14,
            y + 76
          );
          const vSub = [
            rec.vehicleInfo?.damageSummary,
            rec.vehicleInfo?.inspectionPlace || rec.addressDetail,
          ]
            .filter(Boolean)
            .join(" · ");
          if (vSub) {
            ctx.fillStyle = "#475569";
            ctx.font = "400 15px 'Plus Jakarta Sans', sans-serif";
            ctx.fillText(vSub.slice(0, 36), colX[3] + 14, y + 104);
          }
        } else if (adaParselLabel) {
          ctx.fillStyle = "#b45309";
          ctx.font = "bold 16px 'JetBrains Mono', monospace";
          const areaStr = rec.yuzolcumuM2
            ? ` (${formatAreaM2(rec.yuzolcumuM2)} m²)`
            : "";
          ctx.fillText(
            `${adaParselLabel}${areaStr}`.slice(0, 36),
            colX[3] + 14,
            y + 76
          );
          const subLine = [rec.nitelik, rec.addressDetail]
            .filter(Boolean)
            .join(" · ");
          if (subLine) {
            ctx.fillStyle = "#475569";
            ctx.font = "400 15px 'Plus Jakarta Sans', sans-serif";
            ctx.fillText(subLine.slice(0, 36), colX[3] + 14, y + 104);
          }
          if (rec.paftaNo) {
            ctx.fillStyle = "#64748b";
            ctx.font = "400 14px 'JetBrains Mono', monospace";
            ctx.fillText(`Pafta: ${rec.paftaNo}`, colX[3] + 14, y + 130);
          }
        } else if (addressLabel) {
          ctx.fillStyle = "#0f766e";
          ctx.font = "bold 16px 'Plus Jakarta Sans', sans-serif";
          ctx.fillText(
            `Adres: ${(rec.addressDetail || "Açık Adres Keşfi").trim()}`.slice(
              0,
              36
            ),
            colX[3] + 14,
            y + 76
          );
          const addrSub = [
            rec.bagimsizBolumNo
              ? `Daire/B.Bölüm No: ${rec.bagimsizBolumNo}`
              : "",
            rec.nitelik || "",
          ]
            .filter(Boolean)
            .join(" · ");
          if (addrSub) {
            ctx.fillStyle = "#334155";
            ctx.font = "600 15px 'Plus Jakarta Sans', sans-serif";
            ctx.fillText(addrSub.slice(0, 36), colX[3] + 14, y + 104);
          }
        } else {
          if (rec.addressDetail) {
            ctx.fillStyle = "#475569";
            ctx.font = "400 17px 'Plus Jakarta Sans', sans-serif";
            ctx.fillText(
              rec.addressDetail.slice(0, 34),
              colX[3] + 14,
              y + 80
            );
          }
          if (rec.corridor) {
            ctx.fillStyle = "#64748b";
            ctx.font = "400 15px 'Plus Jakarta Sans', sans-serif";
            ctx.fillText(rec.corridor.slice(0, 34), colX[3] + 14, y + 110);
          }
        }

        // 5. Dava / Keşif Türü
        ctx.fillStyle = "#1e293b";
        ctx.font = "600 19px 'Plus Jakarta Sans', sans-serif";
        ctx.fillText(rec.caseType.slice(0, 24), colX[4] + 14, y + 58);

        // 6. Mesafe / Süre
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 20px 'JetBrains Mono', monospace";
        ctx.fillText(`${rec.distanceKm} km`, colX[5] + 14, y + 54);
        ctx.fillStyle = "#64748b";
        ctx.font = "500 17px 'JetBrains Mono', monospace";
        ctx.fillText(`~${rec.durationMin} dk`, colX[5] + 14, y + 84);

        // 7. Hava Tahmini
        const wf = weatherMap[rec.id];
        ctx.fillStyle = "#0f172a";
        ctx.font = "600 18px 'Plus Jakarta Sans', sans-serif";
        ctx.fillText(wf ? wf.label : "Açık / Parçalı", colX[6] + 14, y + 54);
        if (wf) {
          ctx.fillStyle = "#475569";
          ctx.font = "500 17px 'JetBrains Mono', monospace";
          ctx.fillText(
            `${wf.tempMax}°C / ${wf.tempMin}°C (%${wf.precipitationProb} yağış)`,
            colX[6] + 14,
            y + 84
          );
        }

        // 8. Keşif Durumu
        const st: InspectionStatus = rec.status || "planlandi";
        const stLabel = STATUS_LABELS[st];
        const stColor =
          st === "yapildi"
            ? "#059669"
            : st === "iptal_edildi"
            ? "#dc2626"
            : st === "ertelendi"
            ? "#d97706"
            : "#1e293b";
        ctx.fillStyle = stColor;
        ctx.font = "bold 20px 'Plus Jakarta Sans', sans-serif";
        ctx.fillText(stLabel, colX[7] + 14, y + 56);
        if (rec.statusNote) {
          ctx.fillStyle = "#64748b";
          ctx.font = "400 15px 'Plus Jakarta Sans', sans-serif";
          ctx.fillText(rec.statusNote.slice(0, 22), colX[7] + 14, y + 84);
        }

        // 9. Bilirkişi & Notlar & Ekleyen Cihaz
        ctx.fillStyle = "#334155";
        ctx.font = "600 16px 'Plus Jakarta Sans', sans-serif";
        ctx.fillText(
          (rec.experts || "Belirtilmedi").slice(0, 32),
          colX[8] + 14,
          y + 46
        );
        if (rec.notes) {
          ctx.fillStyle = "#64748b";
          ctx.font = "400 15px 'Plus Jakarta Sans', sans-serif";
          ctx.fillText(rec.notes.slice(0, 34), colX[8] + 14, y + 76);
          if (rec.notes.length > 34) {
            ctx.fillText(rec.notes.slice(34, 68), colX[8] + 14, y + 98);
          }
        }
        if (rec.createdBy) {
          ctx.fillStyle = "#059669";
          ctx.font = "600 14px 'Plus Jakarta Sans', sans-serif";
          ctx.fillText(
            `Ekleyen: ${rec.createdBy}`.slice(0, 36),
            colX[8] + 14,
            y + 128
          );
        }
      });
    }

    // Bottom Footer
    ctx.fillStyle = "#64748b";
    ctx.font = "500 17px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(
      "Merkez Başlangıç Noktası: Fatsa Adliyesi (41.0287, 37.5008) · Karayolu Mesafeleri OSRM ve Hava Tahminleri Open-Meteo Üzerinden Hesaplanmıştır.",
      80,
      canvas.height - 55
    );

    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    doc.addImage(imgData, "JPEG", 0, 0, 297, 210);
  }

  const fileName = `Fatsa_Adliyesi_${
    period === "daily"
      ? "Gunluk"
      : period === "weekly"
      ? "Haftalik"
      : "Aylik"
  }_Kesif_Raporu_${referenceDate}.pdf`;

  doc.save(fileName);
  return fileName;
}
