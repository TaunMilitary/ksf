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
  hazirlik: "Hazırlık Aşamasında",
  yola_cikildi: "Yola Çıkıldı",
  kesif_basladi: "Keşif Başladı",
  yapildi: "Tamamlandı (Yapıldı)",
  zapt_bekliyor: "Zapt Bekliyor",
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

        // 8. Keşif Durumu & Katılan Mahkeme Heyeti (Hakim / Katip / Mübaşir)
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
        ctx.fillText(stLabel, colX[7] + 14, y + 50);

        const staffLines: string[] = [];
        if (rec.judgeName) staffLines.push(`Hakim: ${rec.judgeName}`);
        if (rec.clerkName) staffLines.push(`Katip: ${rec.clerkName}`);
        if (rec.bailiffName) staffLines.push(`Mübaşir: ${rec.bailiffName}`);

        if (staffLines.length > 0) {
          ctx.fillStyle = "#065f46";
          ctx.font = "600 13.5px 'Plus Jakarta Sans', sans-serif";
          staffLines.forEach((sLine, sIdx) => {
            ctx.fillText(
              sLine.slice(0, 26),
              colX[7] + 14,
              y + 76 + sIdx * 22
            );
          });
        } else if (rec.statusNote) {
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

function escapeExcelHtml(str: string | undefined | null): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Seçilen ay için yapılan keşiflerin Excel (.xls) rapor çıktısını oluşturur.
 * Tabloda: Sıra No, Dosya Numarası (Esas No), Keşif Tarihi, Keşfe Katılan Hakim,
 * Keşfe Katılan Katip, Keşfe Katılan Mübaşir, Keşfe Katılan Personeller (Toplu) ve yardımcı detaylar yer alır.
 */
export function exportMonthlyCompletedInspectionsToExcel(
  records: InspectionRecord[],
  yearMonth: string, // Örn: "2026-05"
  onlyCompleted: boolean = true
): { fileName: string; count: number } {
  const [yStr, mStr] = yearMonth.split("-");
  const yearNum = Number(yStr) || new Date().getFullYear();
  const monthNum = Number(mStr) || new Date().getMonth() + 1;
  const ymPrefix = `${yearNum}-${String(monthNum).padStart(2, "0")}`;

  const monthObj = new Date(yearNum, monthNum - 1, 1);
  const monthTitleTR = monthObj
    .toLocaleDateString("tr-TR", {
      month: "long",
      year: "numeric",
    })
    .toLocaleUpperCase("tr-TR");

  const filtered = [...records]
    .filter((r) => {
      if (!r.date.startsWith(ymPrefix)) return false;
      if (onlyCompleted) {
        return r.status === "yapildi";
      }
      return r.status !== "iptal_edildi";
    })
    .sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return a.time.localeCompare(b.time);
    });

  const rowsHtml = filtered
    .map((rec, idx) => {
      const judge = rec.judgeName?.trim() || "-";
      const clerk = rec.clerkName?.trim() || "-";
      const bailiff = rec.bailiffName?.trim() || "-";

      const combinedStaffParts: string[] = [];
      if (rec.judgeName?.trim()) {
        combinedStaffParts.push(`Hakim: ${rec.judgeName.trim()}`);
      }
      if (rec.clerkName?.trim()) {
        combinedStaffParts.push(`Katip: ${rec.clerkName.trim()}`);
      }
      if (rec.bailiffName?.trim()) {
        combinedStaffParts.push(`Mübaşir: ${rec.bailiffName.trim()}`);
      }
      const combinedStaffText =
        combinedStaffParts.length > 0
          ? combinedStaffParts.join(" | ")
          : "Belirtilmedi";

      const adaParsel = formatAdaParselLabel(rec);
      const vehicle = formatVehicleLabel(rec);
      const address = formatAddressLabel(rec);
      const subjectDetail = vehicle
        ? `Araç: ${vehicle}`
        : adaParsel
        ? adaParsel
        : address
        ? `Adres: ${address}`
        : rec.addressDetail || "-";

      const statusText = STATUS_LABELS[rec.status || "planlandi"];
      const bgStyle = idx % 2 === 0 ? "#ffffff" : "#f8fafc";

      return `
        <tr style="background-color: ${bgStyle};">
          <td style="border: 1px solid #cbd5e1; padding: 7px 10px; text-align: center; font-weight: bold;">${
            idx + 1
          }</td>
          <td style="border: 1px solid #cbd5e1; padding: 7px 10px; font-weight: bold; color: #0f172a; mso-number-format:'\\@';">${escapeExcelHtml(
            rec.esasNo
          )}</td>
          <td style="border: 1px solid #cbd5e1; padding: 7px 10px; text-align: center; font-weight: bold; mso-number-format:'\\@';">${escapeExcelHtml(
            formatDateTR(rec.date)
          )}</td>
          <td style="border: 1px solid #cbd5e1; padding: 7px 10px; text-align: center; mso-number-format:'\\@';">${escapeExcelHtml(
            rec.time
          )}</td>
          <td style="border: 1px solid #cbd5e1; padding: 7px 10px; font-weight: bold; color: #065f46;">${escapeExcelHtml(
            judge
          )}</td>
          <td style="border: 1px solid #cbd5e1; padding: 7px 10px; font-weight: bold; color: #1e3a8a;">${escapeExcelHtml(
            clerk
          )}</td>
          <td style="border: 1px solid #cbd5e1; padding: 7px 10px; font-weight: bold; color: #7c2d12;">${escapeExcelHtml(
            bailiff
          )}</td>
          <td style="border: 1px solid #cbd5e1; padding: 7px 10px; color: #0f172a;">${escapeExcelHtml(
            combinedStaffText
          )}</td>
          <td style="border: 1px solid #cbd5e1; padding: 7px 10px;">${escapeExcelHtml(
            `[${rec.district}] ${rec.neighborhood}`
          )}</td>
          <td style="border: 1px solid #cbd5e1; padding: 7px 10px; mso-number-format:'\\@';">${escapeExcelHtml(
            subjectDetail
          )}</td>
          <td style="border: 1px solid #cbd5e1; padding: 7px 10px;">${escapeExcelHtml(
            rec.caseType
          )}</td>
          <td style="border: 1px solid #cbd5e1; padding: 7px 10px; text-align: center; font-weight: bold; color: ${
            rec.status === "yapildi" ? "#059669" : "#334155"
          };">${escapeExcelHtml(statusText)}</td>
        </tr>
      `;
    })
    .join("");

  const emptyRowHtml =
    filtered.length === 0
      ? `<tr><td colspan="12" style="border: 1px solid #cbd5e1; padding: 18px; text-align: center; color: #64748b; font-weight: bold;">${escapeExcelHtml(
          monthTitleTR
        )} döneminde kriterlere uygun keşif kaydı bulunmamaktadır.</td></tr>`
      : "";

  const reportSubtitle = onlyCompleted
    ? `${monthTitleTR} DÖNEMİ YAPILAN KEŞİFLER VE KEŞFE KATILAN PERSONEL LİSTESİ`
    : `${monthTitleTR} DÖNEMİ TÜM KEŞİFLER VE KEŞFE KATILAN PERSONEL LİSTESİ`;

  const excelHtml = `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta charset="utf-8" />
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>Aylik Kesif Raporu</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
</head>
<body style="font-family: Calibri, Arial, sans-serif; font-size: 11pt;">
  <table border="1" cellspacing="0" cellpadding="5" style="border-collapse: collapse; width: 100%;">
    <thead>
      <tr>
        <th colspan="12" style="background-color: #0f172a; color: #ffffff; font-size: 14pt; font-weight: bold; padding: 12px; text-align: left;">
          T.C. FATSA SULH HUKUK MAHKEMESİ KALEMİ — ${escapeExcelHtml(
            reportSubtitle
          )}
        </th>
      </tr>
      <tr>
        <th colspan="12" style="background-color: #f1f5f9; color: #334155; font-size: 10pt; font-weight: bold; padding: 8px; text-align: left;">
          Toplam Keşif Sayısı: ${
            filtered.length
          } Dosya | Rapor Oluşturma Tarihi: ${new Date().toLocaleDateString(
    "tr-TR"
  )}
        </th>
      </tr>
      <tr style="background-color: #059669; color: #ffffff; font-weight: bold;">
        <th style="border: 1px solid #047857; padding: 9px 10px; width: 55px;">Sıra No</th>
        <th style="border: 1px solid #047857; padding: 9px 10px; width: 135px;">Dosya Numarası</th>
        <th style="border: 1px solid #047857; padding: 9px 10px; width: 115px;">Keşif Tarihi</th>
        <th style="border: 1px solid #047857; padding: 9px 10px; width: 85px;">Keşif Saati</th>
        <th style="border: 1px solid #047857; padding: 9px 10px; width: 170px;">Keşfe Katılan Hakim</th>
        <th style="border: 1px solid #047857; padding: 9px 10px; width: 185px;">Keşfe Katılan Katip</th>
        <th style="border: 1px solid #047857; padding: 9px 10px; width: 170px;">Keşfe Katılan Mübaşir</th>
        <th style="border: 1px solid #047857; padding: 9px 10px; width: 320px;">Keşfe Katılan Personeller (Toplu)</th>
        <th style="border: 1px solid #047857; padding: 9px 10px; width: 200px;">İlçe / Mahalle</th>
        <th style="border: 1px solid #047857; padding: 9px 10px; width: 180px;">Ada / Parsel / Konu</th>
        <th style="border: 1px solid #047857; padding: 9px 10px; width: 180px;">Dava Türü</th>
        <th style="border: 1px solid #047857; padding: 9px 10px; width: 120px;">Durumu</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || emptyRowHtml}
    </tbody>
  </table>
</body>
</html>`;

  const blob = new Blob([excelHtml], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const fileName = `Fatsa_SHM_Aylik_${
    onlyCompleted ? "Yapilan_Kesifler" : "Tum_Kesifler"
  }_${ymPrefix}.xls`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  return { fileName, count: filtered.length };
}

