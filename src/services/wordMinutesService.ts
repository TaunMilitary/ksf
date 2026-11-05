import { InspectionRecord, RegisteredExpert } from "../types";
import {
  formatAdaParselLabel,
  formatAddressLabel,
  formatAreaM2,
  formatDateTR,
  formatLongDateTR,
  formatVehicleLabel,
} from "./geoService";

export const EXPERT_DIRECTORY_TITLES: string[] = [
  "Fen Bilirkişisi",
  "Kadastro Teknisyeni / Fen Bilirkişisi",
  "Harita ve Kadastro Mühendisi (Fen Bilirkişisi)",
  "Ziraat Bilirkişisi (Ziraat Mühendisi)",
  "İnşaat Bilirkişisi (İnşaat Mühendisi)",
  "Gayrimenkul Değerleme Uzmanı",
  "Mimar Bilirkişi",
  "Makine Bilirkişisi (Makine Mühendisi)",
  "Mobilya ve Ağaç İşleri Bilirkişisi",
  "Elektrik / Elektronik Bilirkişisi",
  "Otomotiv / Araç Hasar Bilirkişisi",
  "Diğer Teknik Bilirkişi",
];

/**
 * Bilirkişi eklerken kullanıcıya yardımcı olmak için unvana göre varsayılan açıklama şablonu üretir.
 * Kullanıcı bu açıklama metnini dilediği gibi değiştirebilir; keşif zaptında bilirkişi seçildiğinde
 * doğrudan bilirkişinin "description" (Açıklama) alanındaki metin zapta aktarılır.
 */
export function buildDefaultExpertDescription(
  title: string,
  fullName: string,
  sicilNo: string
): string {
  const namePart = fullName.trim() || "....................";
  const sicilPart = sicilNo.trim() ? ` (Bilirkişi Sicil / T.C. No: ${sicilNo.trim()})` : "";
  const lower = title.toLocaleLowerCase("tr-TR");

  if (lower.includes("fen") || lower.includes("kadastro") || lower.includes("harita")) {
    return `${title} ${namePart}${sicilPart} huzura alındı. Bölge bilirkişi listesine kayıtlı olup daha önce usulüne uygun yemini yaptırıldığından yemini hatırlatıldı. Dava konusu taşınmaz(lar)ın tapu kaydı ve kadastro paftasını zemine uygulamak, sınırlarını zeminde göstermek ve fen raporunu/krokisini sunmak üzere görevlendirildi. Soruldu: "Dava konusu taşınmaz(lar)ı kadastro paftası ve tapu kaydı ile zeminde çakıştırdım, sınırlarını heyete ve diğer bilirkişilere gösterdim, ayrıntılı teknik raporumu ve krokimi hazırlayıp mahkemeye sunacağım" dedi.`;
  }

  if (lower.includes("ziraat")) {
    return `${title} ${namePart}${sicilPart} huzura alındı. Bölge bilirkişi listesine kayıtlı olup yemini hatırlatıldı. Taşınmaz(lar)ın toprak yapısı, eğimi, tarımsal niteliği, üzerindeki ağaç/ürün varlığı ve zirai gelir/değer yönünden inceleme yaparak ayrıntılı rapor sunmak üzere görevlendirildi. Soruldu: "Taşınmaz(lar) üzerindeki tarımsal unsurları, toprak yapısını ve ağaç varlığını yerinde inceledim, gerekli notlarımı aldım, ayrıntılı zirai değerlendirme raporumu hazırlayarak mahkemeye sunacağım" dedi.`;
  }

  if (lower.includes("inşaat") || lower.includes("mimar") || lower.includes("değerleme")) {
    return `${title} ${namePart}${sicilPart} huzura alındı. Bölge bilirkişi listesine kayıtlı olup yemini hatırlatıldı. Taşınmaz(lar) üzerindeki muhdesat, yapı sınıfı, yıpranma payı, imar durumu, bölünabilirlik (aynen taksim) şartları ve piyasa rayiç değerini tespit etmek üzere görevlendirildi. Soruldu: "Dava konusu taşınmaz ve üzerindeki yapı/muhdesat durumunu yerinde inceledim, ölçümlerimi yaptım, ayrıntılı teknik ve kıymet takdir raporumu hazırlayıp mahkemeye sunacağım" dedi.`;
  }

  return `${title} ${namePart}${sicilPart} huzura alındı. Bölge bilirkişi listesine kayıtlı olup daha önce yemini yaptırıldığından yemini hatırlatıldı. Dosya kapsamı ve uzmanlık alanı doğrultusunda dava konusu yerde gerekli teknik inceleme ve tespitleri yaparak ayrıntılı ve gerekçeli raporunu hazırlamak üzere görevlendirildi. Soruldu: "Dava konusu yerde uzmanlık alanım kapsamında gerekli inceleme ve tespitleri yaptım, ayrıntılı raporumu hazırlayarak mahkemeye sunacağım" dedi.`;
}

function escapeHtml(str: string | undefined | null): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface MinutesGenerationOptions {
  record: InspectionRecord;
  courtName?: string; // Varsayılan: "T.C. FATSA 2. SULH HUKUK MAHKEMESİ"
  judgeName: string;
  judgeSicilNo?: string;
  clerkName: string;
  clerkSicilNo?: string;
  bailiffName: string;
  bailiffSicilNo?: string;
  selectedExperts: RegisteredExpert[];
  customBodyOverride?: string; // Kullanıcı metni elle düzenlediyse
}

/**
 * Taşınmaz / Parsel / Adres / Araç bilgisini metin olarak özetler
 */
export function formatPropertyDetailsForMinutes(rec: InspectionRecord): string {
  if (rec.subjectType === "arac" && rec.vehicleInfo?.plateNo) {
    const v = rec.vehicleInfo;
    return [
      `İlçe / Mahalle: ${rec.district} İlçesi, ${rec.neighborhood}`,
      `Araç Plaka No: ${v.plateNo}`,
      v.brandModel ? `Marka / Model: ${v.brandModel}` : "",
      v.vehicleType ? `Araç Cinsi: ${v.vehicleType}` : "",
      v.chassisOrEngineNo ? `Şasi / Motor No: ${v.chassisOrEngineNo}` : "",
      v.inspectionPlace ? `İnceleme Yeri: ${v.inspectionPlace}` : "",
      v.damageSummary ? `Tespit / Hasar Konusu: ${v.damageSummary}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
  }

  if (rec.subjectType === "adres") {
    return [
      `İlçe / Mahalle: Ordu İli, ${rec.district} İlçesi, ${rec.neighborhood}`,
      `Açık Adres: ${rec.addressDetail || formatAddressLabel(rec) || "Belirtilmedi"}`,
      rec.bagimsizBolumNo
        ? `Daire / Bağımsız Bölüm No: ${rec.bagimsizBolumNo}`
        : "",
      rec.nitelik ? `Taşınmaz Niteliği: ${rec.nitelik}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
  }

  if (rec.parcels && rec.parcels.length > 0) {
    return rec.parcels
      .map((p, idx) => {
        const neigh = p.neighborhood || rec.neighborhood;
        const bb = p.bagimsizBolumNo
          ? `, Bağımsız Bölüm No: ${p.bagimsizBolumNo}`
          : "";
        const area = p.yuzolcumuM2
          ? `, Yüzölçümü: ${formatAreaM2(p.yuzolcumuM2)} m²`
          : "";
        const nit = p.nitelik ? `, Niteliği: ${p.nitelik}` : "";
        const paf = p.paftaNo ? `, Pafta: ${p.paftaNo}` : "";
        return `${idx + 1}) Ordu İli, ${rec.district} İlçesi, ${neigh}, ${p.adaNo} Ada, ${p.parselNo} Parsel${bb}${nit}${area}${paf}`;
      })
      .join("\n");
  }

  const singleAdaParsel = formatAdaParselLabel(rec);
  return [
    `Ordu İli, ${rec.district} İlçesi, ${rec.neighborhood}`,
    singleAdaParsel ? `Tapu Kaydı: ${singleAdaParsel}` : "",
    rec.bagimsizBolumNo ? `Bağımsız Bölüm No: ${rec.bagimsizBolumNo}` : "",
    rec.nitelik ? `Niteliği: ${rec.nitelik}` : "",
    rec.yuzolcumuM2 ? `Yüzölçümü: ${formatAreaM2(rec.yuzolcumuM2)} m²` : "",
    rec.paftaNo ? `Pafta No: ${rec.paftaNo}` : "",
    rec.addressDetail ? `Mevkii / Açıklama: ${rec.addressDetail}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Seçilen keşif kaydı, mahkeme personeli ve seçili bilirkişilerin açıklamalarına göre
 * otomatik keşif zaptı gövde metnini üretir.
 */
export function generateAutomaticMinutesText(
  opts: MinutesGenerationOptions
): string {
  const {
    record,
    judgeName,
    judgeSicilNo,
    clerkName,
    clerkSicilNo,
    bailiffName,
    bailiffSicilNo,
    selectedExperts,
  } = opts;

  const dateFormatted = formatDateTR(record.date);
  const longDate = formatLongDateTR(record.date);
  const judgeStr = `${judgeName || "Kadir SAĞLAM"}${
    judgeSicilNo?.trim() ? ` (${judgeSicilNo.trim()})` : ""
  }`;
  const clerkStr = `${clerkName || "Mehmet AKIN"}${
    clerkSicilNo?.trim() ? ` (${clerkSicilNo.trim()})` : ""
  }`;
  const bailiffStr = `${bailiffName || "Ebru YILMAZ"}${
    bailiffSicilNo?.trim() ? ` (${bailiffSicilNo.trim()})` : ""
  }`;

  const propertyText = formatPropertyDetailsForMinutes(record);

  const expertsListSummary =
    selectedExperts.length > 0
      ? selectedExperts
          .map(
            (e) =>
              `${e.title} ${e.fullName}${
                e.sicilNo?.trim() ? ` (Sicil No: ${e.sicilNo.trim()})` : ""
              }`
          )
          .join(", ")
      : record.experts || "Görevli Bilirkişi Heyeti";

  const expertParagraphs =
    selectedExperts.length > 0
      ? selectedExperts
          .map((exp, idx) => {
            const desc =
              exp.description?.trim() ||
              buildDefaultExpertDescription(exp.title, exp.fullName, exp.sicilNo);
            return `${idx + 1}. BİLİRKİŞİ (${exp.title.toLocaleUpperCase("tr-TR")} - ${exp.fullName}${
              exp.sicilNo?.trim() ? ` - Sicil No: ${exp.sicilNo.trim()}` : ""
            }):\n${desc}`;
          })
          .join("\n\n")
      : `BİLİRKİŞİ HEYETİ (${record.experts || "Fen Bilirkişisi"}):\nBölge bilirkişi listesine kayıtlı bilirkişi heyeti huzura alındı, yeminleri hatırlatıldı. Dava konusu taşınmaz başında gerekli teknik inceleme ve ölçümleri yaparak raporlarını sunmak üzere görevlendirildiler.`;

  return [
    `Belirli gün ve saatte (${dateFormatted} günü saat ${record.time}'da) Mahkememiz Hakimi ${judgeStr} ile Zabıt Katibi ${clerkStr} ve Mübaşir ${bailiffStr} refakate alınarak, görevli bilirkişi(ler) ${expertsListSummary} hazır olduğu halde temin edilen araçla Fatsa Adliyesi'nden hareketle dava konusu keşif mahalline (${record.district} İlçesi, ${record.neighborhood}) gelindi.`,
    `Mübaşir ${bailiffName || "Ebru YILMAZ"} vasıtasıyla yüksek sesle yapılan yoklamada hazır bulunan taraflar/vekiller tespit edildi. Açık yargılamaya ve keşif icrasına dava konusu taşınmaz başında devam olundu.`,
    `KEŞİF KONUSU TAŞINMAZ / YER BİLGİLERİ:\n${propertyText}`,
    `DAVA KONUSU: ${record.caseType}${record.notes ? `\nDOSYA NOTU: ${record.notes}` : ""}`,
    `GÖREVLİ BİLİRKİŞİ HEYETİ İNCELEME VE AÇIKLAMALARI:\n${expertParagraphs}`,
    `GEREĞİ DÜŞÜNÜLDÜ:\n1- Keşfe katılan bilirkişi heyetine, dosya kapsamı, tapu kayıtları, kadastro paftası ve mahallinde yapılan inceleme doğrultusunda ayrıntılı, gerekçeli, denetime elverişli ve (varsa) krokili raporlarını hazırlayarak Mahkememiz kalemine sunmaları için 2 (iki) hafta süre verilmesine,\n2- Bilirkişi raporları sunulduğunda taraflara/vekillere HMK hükümleri uyarınca tebliğine,\n3- Başka bir işlem kalmadığından keşif icrasına son verilerek işbu keşif zaptının hazır bulunanlarca imza altına alınmasına karar verildi. ${longDate}`,
  ].join("\n\n");
}

/**
 * Tek bir keşif veya birden fazla seçilmiş keşif için Word (.doc - WordprocessingML HTML)
 * belgesi üretir.
 * - Alt bilgi (Footer) kısmında: "Fatsa 2. Sulh Hukuk Mahkemesi <DosyaNo> Keşif Zaptı" yazar.
 * - Her sayfaya otomatik sayfa numarası (Sayfa X / Y) verir ve resmi A4 sayfa düzenindedir.
 */
export function buildWordDocumentHtmlForInspections(
  items: MinutesGenerationOptions[]
): string {
  const stylesAndSectionsPageSetup = items
    .map((_, idx) => {
      const sNum = idx + 1;
      return `
    @page Section${sNum} {
      size: 595.3pt 841.9pt; /* A4 */
      margin: 56.7pt 56.7pt 62.0pt 62.0pt;
      mso-header-margin: 35.4pt;
      mso-footer-margin: 35.4pt;
      mso-footer: f${sNum};
      mso-paper-source: 0;
    }
    div.Section${sNum} {
      page: Section${sNum};
    }`;
    })
    .join("\n");

  const sectionsHtml = items
    .map((item, idx) => {
      const sNum = idx + 1;
      const {
        record,
        courtName = "T.C. FATSA 2. SULH HUKUK MAHKEMESİ",
        judgeName,
        judgeSicilNo,
        clerkName,
        clerkSicilNo,
        bailiffName,
        bailiffSicilNo,
        selectedExperts,
        customBodyOverride,
      } = item;

      const dosyaNoText = record.esasNo?.trim() || "2026/... E.";
      const footerLeftText = `Fatsa 2. Sulh Hukuk Mahkemesi ${dosyaNoText} Keşif Zaptı`;

      const judgeFull = `${judgeName || "Kadir SAĞLAM"}${
        judgeSicilNo?.trim() ? ` (${judgeSicilNo.trim()})` : ""
      }`;
      const clerkFull = `${clerkName || "Mehmet AKIN"}${
        clerkSicilNo?.trim() ? ` (${clerkSicilNo.trim()})` : ""
      }`;
      const bailiffFull = `${bailiffName || "Ebru YILMAZ"}${
        bailiffSicilNo?.trim() ? ` (${bailiffSicilNo.trim()})` : ""
      }`;

      // Taşınmaz Tablosu Satırları
      const parcelRowsHtml =
        record.parcels && record.parcels.length > 0
          ? record.parcels
              .map(
                (p, pIdx) => `
              <tr>
                <td style="border:1px solid #475569; padding:5px 8px; text-align:center;">${
                  pIdx + 1
                }</td>
                <td style="border:1px solid #475569; padding:5px 8px;">${escapeHtml(
                  record.district
                )}</td>
                <td style="border:1px solid #475569; padding:5px 8px;">${escapeHtml(
                  p.neighborhood || record.neighborhood
                )}</td>
                <td style="border:1px solid #475569; padding:5px 8px; text-align:center; font-weight:bold;">${escapeHtml(
                  p.adaNo
                )}</td>
                <td style="border:1px solid #475569; padding:5px 8px; text-align:center; font-weight:bold;">${escapeHtml(
                  p.parselNo
                )}</td>
                <td style="border:1px solid #475569; padding:5px 8px; text-align:center;">${escapeHtml(
                  p.bagimsizBolumNo || "-"
                )}</td>
                <td style="border:1px solid #475569; padding:5px 8px;">${escapeHtml(
                  p.nitelik || record.nitelik || "-"
                )}</td>
                <td style="border:1px solid #475569; padding:5px 8px; text-align:right;">${
                  p.yuzolcumuM2 ? `${formatAreaM2(p.yuzolcumuM2)} m²` : "-"
                }</td>
              </tr>`
              )
              .join("")
          : `
              <tr>
                <td style="border:1px solid #475569; padding:5px 8px; text-align:center;">1</td>
                <td style="border:1px solid #475569; padding:5px 8px;">${escapeHtml(
                  record.district
                )}</td>
                <td style="border:1px solid #475569; padding:5px 8px;">${escapeHtml(
                  record.neighborhood
                )}</td>
                <td style="border:1px solid #475569; padding:5px 8px; text-align:center; font-weight:bold;">${escapeHtml(
                  record.adaNo || "-"
                )}</td>
                <td style="border:1px solid #475569; padding:5px 8px; text-align:center; font-weight:bold;">${escapeHtml(
                  record.parselNo || "-"
                )}</td>
                <td style="border:1px solid #475569; padding:5px 8px; text-align:center;">${escapeHtml(
                  record.bagimsizBolumNo || "-"
                )}</td>
                <td style="border:1px solid #475569; padding:5px 8px;">${escapeHtml(
                  record.nitelik ||
                    record.addressDetail ||
                    record.vehicleInfo?.plateNo ||
                    "-"
                )}</td>
                <td style="border:1px solid #475569; padding:5px 8px; text-align:right;">${
                  record.yuzolcumuM2
                    ? `${formatAreaM2(record.yuzolcumuM2)} m²`
                    : "-"
                }</td>
              </tr>`;

      const bodyText =
        customBodyOverride !== undefined && customBodyOverride.trim().length > 0
          ? customBodyOverride
          : generateAutomaticMinutesText(item);

      const formattedBodyParagraphsHtml = bodyText
        .split(/\n\n+/)
        .map((para) => {
          const lines = para
            .split("\n")
            .map((l) => escapeHtml(l))
            .join("<br/>");
          return `<p style="margin: 0 0 9pt 0; text-align: justify; line-height: 1.45; font-size: 11.5pt; font-family: 'Times New Roman', serif;">${lines}</p>`;
        })
        .join("\n");

      // Bilirkişi İmza Hücreleri (3'lü satırlar halinde düzenli tablo)
      const expertSignatureCells: string[] = [];
      if (selectedExperts.length > 0) {
        for (let i = 0; i < selectedExperts.length; i += 3) {
          const chunk = selectedExperts.slice(i, i + 3);
          const tds = chunk
            .map(
              (exp) => `
              <td width="33%" valign="top" style="padding: 12pt 6pt 18pt 6pt; text-align: center; font-family: 'Times New Roman', serif; font-size: 11pt;">
                <strong>${escapeHtml(exp.title)}</strong><br/>
                ${escapeHtml(exp.fullName)}<br/>
                ${
                  exp.sicilNo?.trim()
                    ? `<span style="font-size: 10pt;">Sicil No: ${escapeHtml(
                        exp.sicilNo.trim()
                      )}</span><br/>`
                    : ""
                }
                <span style="font-size: 10pt; color: #334155;">(İmza)</span>
              </td>`
            )
            .join("");
          const emptyCount = 3 - chunk.length;
          const emptyTds =
            emptyCount > 0
              ? Array.from({ length: emptyCount })
                  .map(() => `<td width="33%"></td>`)
                  .join("")
              : "";
          expertSignatureCells.push(`<tr>${tds}${emptyTds}</tr>`);
        }
      }

      const pageBreakBetweenSections =
        idx < items.length - 1
          ? `<br clear="all" style="page-break-before: always; mso-break-type: section-break;" />`
          : "";

      return `
      <div class="Section${sNum}">
        <!-- KURUMSAL BAŞLIK -->
        <div style="text-align: center; margin-bottom: 12pt; border-bottom: 1.5pt solid #0f172a; padding-bottom: 8pt;">
          <div style="font-size: 13.5pt; font-weight: bold; font-family: 'Times New Roman', serif; letter-spacing: 0.3pt;">
            T.C.<br/>
            FATSA 2. SULH HUKUK MAHKEMESİ<br/>
            KEŞİF ZAPTI (KEŞİF TUTANAĞI)
          </div>
        </div>

        <!-- ÜST KÜNYE TABLOSU -->
        <table width="100%" cellspacing="0" cellpadding="4" style="border-collapse: collapse; margin-bottom: 12pt; font-family: 'Times New Roman', serif; font-size: 11.5pt;">
          <tr>
            <td width="26%" style="font-weight: bold; padding: 3pt 4pt;">ESAS NUMARASI</td>
            <td width="2%" style="font-weight: bold;">:</td>
            <td width="72%" style="font-weight: bold; padding: 3pt 4pt;">${escapeHtml(
              dosyaNoText
            )}</td>
          </tr>
          <tr>
            <td style="font-weight: bold; padding: 3pt 4pt;">HAKİM</td>
            <td style="font-weight: bold;">:</td>
            <td style="padding: 3pt 4pt;">${escapeHtml(judgeFull)}</td>
          </tr>
          <tr>
            <td style="font-weight: bold; padding: 3pt 4pt;">ZABIT KATİBİ</td>
            <td style="font-weight: bold;">:</td>
            <td style="padding: 3pt 4pt;">${escapeHtml(clerkFull)}</td>
          </tr>
          <tr>
            <td style="font-weight: bold; padding: 3pt 4pt;">MÜBAŞİR</td>
            <td style="font-weight: bold;">:</td>
            <td style="padding: 3pt 4pt;">${escapeHtml(bailiffFull)}</td>
          </tr>
          <tr>
            <td style="font-weight: bold; padding: 3pt 4pt;">KEŞİF TARİHİ VE SAATİ</td>
            <td style="font-weight: bold;">:</td>
            <td style="padding: 3pt 4pt;">${escapeHtml(
              formatDateTR(record.date)
            )} — Saat ${escapeHtml(record.time)}</td>
          </tr>
          <tr>
            <td style="font-weight: bold; padding: 3pt 4pt;">DAVA / KEŞİF KONUSU</td>
            <td style="font-weight: bold;">:</td>
            <td style="padding: 3pt 4pt;">${escapeHtml(record.caseType)}</td>
          </tr>
          <tr>
            <td style="font-weight: bold; padding: 3pt 4pt;">KEŞİF YERİ (İLÇE / MAHALLE)</td>
            <td style="font-weight: bold;">:</td>
            <td style="padding: 3pt 4pt;">Ordu İli, ${escapeHtml(
              record.district
            )} İlçesi, ${escapeHtml(record.neighborhood)}</td>
          </tr>
        </table>

        <!-- TAŞINMAZ / PARSEL BİLGİLERİ TABLOSU -->
        <div style="margin-bottom: 12pt;">
          <div style="font-weight: bold; font-size: 11pt; margin-bottom: 4pt; font-family: 'Times New Roman', serif;">
            KEŞİF KONUSU TAŞINMAZ / PARSEL CETVELİ:
          </div>
          <table width="100%" cellspacing="0" cellpadding="4" style="border-collapse: collapse; font-family: 'Times New Roman', serif; font-size: 10.5pt;">
            <thead>
              <tr style="background-color: #f1f5f9;">
                <th style="border:1px solid #475569; padding:5px 6px; width:6%;">Sıra</th>
                <th style="border:1px solid #475569; padding:5px 6px; width:12%;">İlçe</th>
                <th style="border:1px solid #475569; padding:5px 6px; width:22%;">Mahalle / Köy</th>
                <th style="border:1px solid #475569; padding:5px 6px; width:10%;">Ada No</th>
                <th style="border:1px solid #475569; padding:5px 6px; width:10%;">Parsel No</th>
                <th style="border:1px solid #475569; padding:5px 6px; width:10%;">B.Bölüm</th>
                <th style="border:1px solid #475569; padding:5px 6px; width:16%;">Niteliği</th>
                <th style="border:1px solid #475569; padding:5px 6px; width:14%;">Yüzölçümü</th>
              </tr>
            </thead>
            <tbody>
              ${parcelRowsHtml}
            </tbody>
          </table>
        </div>

        <!-- KEŞİF ZAPTI GÖVDE METNİ -->
        <div style="margin-top: 8pt; margin-bottom: 16pt;">
          ${formattedBodyParagraphsHtml}
        </div>

        <!-- MAHKEME HEYETİ İMZA TABLOSU -->
        <table width="100%" cellspacing="0" cellpadding="6" style="border-collapse: collapse; margin-top: 18pt; font-family: 'Times New Roman', serif; font-size: 11pt;">
          <tr>
            <td width="33%" valign="top" style="text-align: center; padding: 10pt 6pt 22pt 6pt;">
              <strong>Zabıt Katibi</strong><br/>
              ${escapeHtml(clerkFull)}<br/>
              <span style="font-size: 10pt; color: #334155;">(İmza)</span>
            </td>
            <td width="34%" valign="top" style="text-align: center; padding: 10pt 6pt 22pt 6pt;">
              <strong>Mübaşir</strong><br/>
              ${escapeHtml(bailiffFull)}<br/>
              <span style="font-size: 10pt; color: #334155;">(İmza)</span>
            </td>
            <td width="33%" valign="top" style="text-align: center; padding: 10pt 6pt 22pt 6pt;">
              <strong>Hakim</strong><br/>
              ${escapeHtml(judgeFull)}<br/>
              <span style="font-size: 10pt; color: #334155;">(İmza)</span>
            </td>
          </tr>
          ${expertSignatureCells.join("\n")}
        </table>

        <!-- WORD NATIVE FOOTER (ALT BİLGİ VE SAYFA NUMARASI) -->
        <div style="mso-element:footer" id="f${sNum}">
          <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border-top: 1px solid #64748b; padding-top: 4pt; font-family: 'Times New Roman', serif; font-size: 9.5pt; color: #334155;">
            <tr>
              <td align="left" width="75%" style="padding-top: 4pt; font-weight: bold;">
                ${escapeHtml(footerLeftText)}
              </td>
              <td align="right" width="25%" style="padding-top: 4pt;">
                Sayfa <span style='mso-field-code:" PAGE "'><span style="mso-no-proof:yes">1</span></span> / <span style='mso-field-code:" NUMPAGES "'><span style="mso-no-proof:yes">1</span></span>
              </td>
            </tr>
          </table>
        </div>
      </div>
      ${pageBreakBetweenSections}`;
    })
    .join("\n");

  return `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta charset="utf-8" />
  <title>Fatsa 2. Sulh Hukuk Mahkemesi Keşif Zaptı</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 11.5pt;
      color: #000000;
    }
    table {
      border-collapse: collapse;
    }
    p.MsoFooter, li.MsoFooter, div.MsoFooter {
      margin: 0cm;
      margin-bottom: .0001pt;
      mso-pagination: widow-orphan;
      font-size: 9.5pt;
      font-family: 'Times New Roman', serif;
    }
    ${stylesAndSectionsPageSetup}
  </style>
</head>
<body>
  ${sectionsHtml}
</body>
</html>`;
}

/**
 * Verilen keşif zaptı listesini Word (.doc) dosyası olarak indirir
 */
export function downloadWordMinutesDocument(
  items: MinutesGenerationOptions[],
  customFileName?: string
): string {
  const html = buildWordDocumentHtmlForInspections(items);
  const blob = new Blob([html], {
    type: "application/msword;charset=utf-8",
  });

  const firstEsas = (items[0]?.record.esasNo || "Kesif")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_");
  const fileName =
    customFileName ||
    (items.length === 1
      ? `Fatsa_2_SHM_${firstEsas}_Kesif_Zapti.doc`
      : `Fatsa_2_SHM_Toplu_Kesif_Zapti_${items.length}_Dosya_${
          items[0]?.record.date || ""
        }.doc`);

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2500);

  return fileName;
}
