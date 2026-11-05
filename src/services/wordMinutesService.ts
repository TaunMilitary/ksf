import { InspectionRecord, RegisteredExpert } from "../types";
import { formatAreaM2 } from "./geoService";

export const EXPERT_DIRECTORY_TITLES: string[] = [
  "Fen Bilirkişisi",
  "Ziraat Bilirkişisi",
  "İnşaat Bilirkişisi",
  "Kadastro Teknisyeni / Fen Bilirkişisi",
  "Harita ve Kadastro Mühendisi (Fen Bilirkişisi)",
  "Gayrimenkul Değerleme Uzmanı",
  "Mimar Bilirkişi",
  "Makine Bilirkişisi",
  "Mobilya Bilirkişisi",
  "Elektrik / Elektronik Bilirkişisi",
  "Otomotiv / Araç Hasar Bilirkişisi",
  "Diğer Teknik Bilirkişi",
];

// Mahkeme personeli varsayılan sicil numaraları (Ekteki şablondan birebir alınmıştır)
export const STAFF_DEFAULT_SICIL_MAP: Record<string, string> = {
  "Kadir SAĞLAM": "267550",
  "Mehmet AKIN": "186472",
  "Mahsuni BAŞBAYDAR": "",
  "Ebru YILMAZ": "231993",
};

// Ekteki örnek keşif zaptında yer alan mahkeme bilirkişileri (Varsayılan başlangıç rehberi)
export const DEFAULT_REGISTERED_EXPERTS: RegisteredExpert[] = [
  {
    id: "exp-kenan-yildiz",
    title: "Fen Bilirkişisi",
    fullName: "Kenan YILDIZ",
    sicilNo: "16294",
    description:
      "Fen Bilirkişisi Kenan YILDIZ: 16294 Sicil Numaralı, 56698381242 T.C. Kimlik numaralı, Mehmet ve Ümmehan oğlu, 28.12.1964 Fatsa doğumlu, Fatsa nüfusuna kayıtlı olup, halen Fatsa Kadastro Birimi’nde Harita-Kadastro Teknisyeni olarak görev yapar. Tarafları tanımaz, engel hali yok, yemini yaptırıldı. Yapacağı iş anlatıldı.",
    createdAt: "2026-01-01T09:00:00.000Z",
  },
  {
    id: "exp-serhan-turan",
    title: "Ziraat Bilirkişisi",
    fullName: "Serhan TURAN",
    sicilNo: "41923996834",
    description:
      "Ziraat Bilirkişisi Serhan TURAN: 41923996834 T.C. Kimlik numaralı, Necat ve Aynur oğlu, 02.07.1988 Trabzon doğumlu, halen Fatsa İlçe Tarım ve Orman Müdürlüğü’nde Ziraat Mühendisi olarak görev yapar. Tarafları tanımaz, engel hali yok, yemini yaptırıldı. Yapacağı iş anlatıldı.",
    createdAt: "2026-01-01T09:01:00.000Z",
  },
  {
    id: "exp-baris-kirca",
    title: "İnşaat Bilirkişisi",
    fullName: "Barış KIRCA",
    sicilNo: "16451",
    description:
      "İnşaat Bilirkişisi Barış KIRCA: 16451 sicil numaralı, 41527893874 T.C. Kimlik numaralı, Hicabi ve Şaziye oğlu, 19.07.1983 Ordu doğumlu, Ordu ili, Altınordu ilçesi, Alembey Mahallesi nüfusuna kayıtlı olup, halen Fatsa ilçesinde serbest inşaat mühendisi olarak görev yapar. Tarafları tanımaz, engel hali yok, yemini yaptırıldı. Yapacağı iş anlatıldı.",
    createdAt: "2026-01-01T09:02:00.000Z",
  },
];

/**
 * Yeni bilirkişi eklerken unvana göre örnek şablondaki formatta açıklama metni üretir.
 */
export function buildDefaultExpertDescription(
  title: string,
  fullName: string,
  sicilNo: string
): string {
  const namePart = fullName.trim() || "....................";
  const sicilPart = sicilNo.trim()
    ? `${sicilNo.trim()} Sicil / T.C. Kimlik numaralı, `
    : "";

  return `${title} ${namePart}: ${sicilPart}.................... oğlu/kızı, .......... doğumlu, halen Fatsa ilçesinde ${title.toLocaleLowerCase(
    "tr-TR"
  )} olarak görev yapar. Tarafları tanımaz, engel hali yok, yemini yaptırıldı. Yapacağı iş anlatıldı.`;
}

function escapeHtml(str: string | undefined | null): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Tarihi örnek şablondaki gibi GG/AA/YYYY (Örn: 05/11/2026) formatına çevirir
 */
export function formatDateSlashTR(dateStr: string | undefined): string {
  if (!dateStr) return "..../..../2026";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Dosya numarasını örnek şablondaki gibi "2025/1335 Esas" biçimine tamamlar
 */
export function formatEsasNoForTemplate(esasNo: string | undefined): string {
  const raw = (esasNo || "").trim();
  if (!raw) return "2026/.... Esas";
  if (/esas$/i.test(raw)) return raw;
  if (/e\.?$/i.test(raw)) {
    return raw.replace(/\s*e\.?$/i, " Esas");
  }
  return `${raw} Esas`;
}

export interface MinutesGenerationOptions {
  record: InspectionRecord;
  judgeName: string;
  judgeSicilNo?: string;
  clerkName: string;
  clerkSicilNo?: string;
  bailiffName: string;
  bailiffSicilNo?: string;
  selectedExperts: RegisteredExpert[];
  vehiclePlateText?: string; // Varsayılan: "ATGV’ye ait 06CUD608 plaka sayılı keşif aracı vasıtasıyla"
  attendingPartiesText?: string; // Varsayılan: "Keşif mahalinde yapılan yoklamada davacı vekili XXXXXX hazır bulunduğu görüldü. Açık keşfe devam olundu."
  driverFeeTl?: string; // Varsayılan: "2.500,00 TL"
  customBodyOverride?: string;
}

/**
 * Dosyadaki taşınmazları mahalle bazında gruplayarak şablondaki gibi:
 * "Ordu İli, Fatsa İlçesi, Ayazlı Mahallesi"
 * "1139 ada 10 parsel"
 * "1139 ada 11 parsel"
 * biçiminde döndürür.
 */
export function buildGroupedParcelObservationGroups(
  rec: InspectionRecord
): {
  headerLine: string;
  parcelLines: string[];
}[] {
  const districtName = rec.district || "Fatsa";

  if (rec.subjectType === "arac" && rec.vehicleInfo?.plateNo) {
    return [
      {
        headerLine: `Ordu İli, ${districtName} İlçesi, ${rec.neighborhood}`,
        parcelLines: [
          `${rec.vehicleInfo.plateNo} plaka sayılı araç${
            rec.vehicleInfo.brandModel ? ` (${rec.vehicleInfo.brandModel})` : ""
          }`,
        ],
      },
    ];
  }

  if (rec.subjectType === "adres") {
    return [
      {
        headerLine: `Ordu İli, ${districtName} İlçesi, ${rec.neighborhood}`,
        parcelLines: [
          `${rec.addressDetail || "Açık adres taşınmazı"}${
            rec.bagimsizBolumNo
              ? ` (Bağımsız Bölüm No: ${rec.bagimsizBolumNo})`
              : ""
          }`,
        ],
      },
    ];
  }

  if (rec.parcels && rec.parcels.length > 0) {
    const groupsMap = new Map<string, string[]>();
    for (const p of rec.parcels) {
      const mah = (p.neighborhood || rec.neighborhood || "").trim();
      const list = groupsMap.get(mah) || [];
      const bbSuffix = p.bagimsizBolumNo?.trim()
        ? ` (Bağımsız Bölüm No: ${p.bagimsizBolumNo.trim()})`
        : "";
      list.push(`${p.adaNo} ada ${p.parselNo} parsel,${bbSuffix}`);
      groupsMap.set(mah, list);
    }

    const result: { headerLine: string; parcelLines: string[] }[] = [];
    let idx = 0;
    for (const [mahName, pLines] of groupsMap.entries()) {
      result.push({
        headerLine:
          idx === 0
            ? `Ordu İli, ${districtName} İlçesi, ${mahName}`
            : mahName,
        parcelLines: pLines,
      });
      idx++;
    }
    return result;
  }

  // Tekil parsel
  const singleLine =
    rec.adaNo || rec.parselNo
      ? `${rec.adaNo || "0"} ada ${rec.parselNo || "1"} parsel${
          rec.bagimsizBolumNo
            ? ` (Bağımsız Bölüm No: ${rec.bagimsizBolumNo})`
            : ""
        }`
      : rec.addressDetail || "Dava konusu taşınmaz";

  return [
    {
      headerLine: `Ordu İli, ${districtName} İlçesi, ${rec.neighborhood}`,
      parcelLines: [singleLine],
    },
  ];
}

/**
 * Seçilen bilirkişi unvanlarına göre 1. paragraftaki "Ziraat, Fen ve İnşaat Bilirkişisi" ifadesini oluşturur
 */
export function formatExpertTitlesInlinePhrase(
  selectedExperts: RegisteredExpert[],
  fallbackExpertsText?: string
): string {
  if (selectedExperts.length === 0) {
    return fallbackExpertsText || "Ziraat, Fen ve İnşaat Bilirkişisi";
  }
  const shortTitles = selectedExperts.map((e) =>
    e.title.replace(/\s*Bilirkişisi$/i, "").trim()
  );
  if (shortTitles.length === 1) {
    return `${shortTitles[0]} Bilirkişisi`;
  }
  const last = shortTitles[shortTitles.length - 1];
  const rest = shortTitles.slice(0, -1);
  return `${rest.join(", ")} ve ${last} Bilirkişisi`;
}

/**
 * Ekteki PDF şablonunun (2025/1335 Esas) birebir metin akışını üretir
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
    vehiclePlateText = "ATGV’ye ait 06CUD608 plaka sayılı keşif aracı vasıtasıyla",
    attendingPartiesText = "Keşif mahalinde yapılan yoklamada davacı vekili XXXXXX hazır bulunduğu görüldü. Açık keşfe devam olundu.",
    driverFeeTl = "2.500,00 TL",
  } = opts;

  const jSicil =
    judgeSicilNo?.trim() || STAFF_DEFAULT_SICIL_MAP[judgeName.trim()] || "";
  const cSicil =
    clerkSicilNo?.trim() || STAFF_DEFAULT_SICIL_MAP[clerkName.trim()] || "";
  const bSicil =
    bailiffSicilNo?.trim() || STAFF_DEFAULT_SICIL_MAP[bailiffName.trim()] || "";

  const judgeInline = `${judgeName || "Kadir SAĞLAM"}${
    jSicil ? ` (${jSicil})` : ""
  }`;
  const clerkInline = `${clerkName || "Mehmet AKIN"}${
    cSicil ? ` (${cSicil})` : ""
  }`;
  const bailiffInline = `${bailiffName || "Ebru YILMAZ"}${
    bSicil ? ` (${bSicil})` : ""
  }`;

  const inlineExpertsPhrase = formatExpertTitlesInlinePhrase(
    selectedExperts,
    record.experts
  );

  const expertIdentityParagraphs =
    selectedExperts.length > 0
      ? selectedExperts
          .map(
            (exp) =>
              exp.description?.trim() ||
              buildDefaultExpertDescription(
                exp.title,
                exp.fullName,
                exp.sicilNo
              )
          )
          .join("\n")
      : DEFAULT_REGISTERED_EXPERTS.map((exp) => exp.description).join("\n");

  const expertTitlesRow =
    selectedExperts.length > 0
      ? selectedExperts.map((e) => e.title).join("            ")
      : "Fen Bilirkişisi            Ziraat Bilirkişisi            İnşaat Bilirkişisi";

  const observationGroups = buildGroupedParcelObservationGroups(record);
  const observationBlock = observationGroups
    .map((g, idx) => {
      const prefix = idx === 0 ? "Keşif heyeti gözleminde; " : "";
      return `${prefix}${g.headerLine}\n${g.parcelLines.join("\n")}`;
    })
    .join("\n\n");

  const slashDate = formatDateSlashTR(record.date);

  return [
    `Mahkememize ait iş bu dava dosyasında verilen keşif ara kararı uyarınca keşif yapılmasına karar verilmiş başta Hakim ${judgeInline}, Zabıt Katibi ${clerkInline}, Mübaşir ${bailiffInline} ile ${inlineExpertsPhrase} refakate alınarak ${vehiclePlateText} davaya konu edilen taşınmazların başına gelindi.`,
    `Açık keşfe başlandı.`,
    attendingPartiesText,
    `Bilirkişilerin kimliklerinin tespitine geçildi.`,
    expertIdentityParagraphs,
    `Dava konusu olan taşınmazlar bilirkişiler eşliğinde ayrı ayrı gezildi, incelendi. Bilirkişiler ölçümlerini yaptılar, notlarını alıp incelemelerini yaptılar. Kendilerine hangi hususta rapor verecekleri anlatıldı.`,
    `Bilirkişiler yukarıdaki kimlikleri ve yeminleri tahtında ayrı ayrı huzura alındı, soruldu:\nKeşif mahallini mahkeme heyeti ile birlikte gezdik, ölçümlerimizi yapıp notlarımızı aldık, tarafımıza süre verildiğinde ayrıntılı raporumuzu hazırlayıp, dosyaya ibraz edeceğiz dediler. Beyanları okundu. İmzaları alındı.`,
    expertTitlesRow,
    observationBlock,
    `Davacı vekilinden soruldu: Yapılan keşfe ve bilirkişi beyanlarına karşı bir diyeceğimiz yoktur. Bilirkişi raporları dosyaya sunulduğunda ayrıca beyanda bulunacağız dedi.\nDavalı vekilinden soruldu: Yapılan keşfe ve bilirkişi beyanlarına karşı bir diyeceğimiz yoktur. Bilirkişi raporları dosyaya sunulduğunda ayrıca beyanda bulunacağız dedi.\nKeşif mahallinde yapılacak başka işlem kalmadığından açık keşfe son verildi.`,
    `G.D.\n1-Mahkeme heyetinin yolluğunun harçlar kanuna göre ödenmesine,\n2-Bilirkişilere ayrıntılı raporunu 3 üç nüsha olarak ibraz etmeleri için fen bilirkişisi için 15 gün, ziraat bilirkişisi için 25 gün ve inşaat bilirkişisi için 35 gün süre verilmesine, bilirkişilere emek ve mesaisine karşılık fen bilirkişisi için 3.500,00 TL, ziraat bilirkişisi için 4.000,00 TL ve inşaat bilirkişisi 4.000,00 TL ücret takdirine,\n3-Araç şoförü tarafından gidiş-dönüş, bekleme ücreti olarak toplamda ${driverFeeTl}'lik fatura verildiği takdirde, faturanın dosyada saklanmasına, faturada geçen ${driverFeeTl}’nin keşifte görev alan şoföre ödenmesine,\n4-Sarf kararının adliyede düzenlenmesine,\nDair, iş bu zabıt keşif mahalinde tanzim edilerek hep birlikte imza altına alındı.${slashDate}`,
  ].join("\n\n");
}

/**
 * Ekteki PDF şablonuna (2025/1335 Esas) %100 sadık kalarak Word (.doc) belgesi oluşturur.
 * - Üst başlık: T.C. / FATSA / 2.SULH HUKUK MAHKEMESİ
 * - SAYI : <DosyaNo> Esas ve sağda "KEŞİF ZAPTI"
 * - HAKİM : KADİR SAĞLAM 267550 / KATİP : MEHMET AKIN 186472 / Keş.Tar. : GG/AA/YYYY
 * - Gövde paragrafları (1.25cm ilk satır girintili, Times New Roman 12pt, iki yana yaslı)
 * - Keşif heyeti gözleminde; Ordu İli, Fatsa İlçesi, ... Mahallesi ve alt alta ada/parsel listesi
 * - G.D. maddeleri (1, 2, 3, 4)
 * - En altta 3 sütunlu kenarlıklı imza tablosu (Hakim 267550 | Zabıt Katibi 186472 | Mübaşir 231993 / Ziraat Bilirkişisi | Fen Bilirkişisi | İnşaat Bilirkişisi / Davacı Vekili | Davalı Vekili)
 * - Alt Bilgi (Footer): Sol tarafta "Fatsa 2. Sulh Hukuk Mahkemesi – <DosyaNo> Esas – Keşif Zaptı", sağ tarafta siyah kutu içinde sayfa numarası (1, 2...)
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
      margin: 56.7pt 62.0pt 62.0pt 62.0pt;
      mso-header-margin: 35.4pt;
      mso-footer-margin: 28.0pt;
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
        judgeName,
        judgeSicilNo,
        clerkName,
        clerkSicilNo,
        bailiffName,
        bailiffSicilNo,
        selectedExperts,
        vehiclePlateText = "ATGV’ye ait 06CUD608 plaka sayılı keşif aracı vasıtasıyla",
        attendingPartiesText = "Keşif mahalinde yapılan yoklamada davacı vekili XXXXXX hazır bulunduğu görüldü. Açık keşfe devam olundu.",
        driverFeeTl = "2.500,00 TL",
        customBodyOverride,
      } = item;

      const esasFormatted = formatEsasNoForTemplate(record.esasNo);
      const slashDate = formatDateSlashTR(record.date);

      const jSicil =
        judgeSicilNo?.trim() ||
        STAFF_DEFAULT_SICIL_MAP[judgeName.trim()] ||
        "267550";
      const cSicil =
        clerkSicilNo?.trim() ||
        STAFF_DEFAULT_SICIL_MAP[clerkName.trim()] ||
        "186472";
      const bSicil =
        bailiffSicilNo?.trim() ||
        STAFF_DEFAULT_SICIL_MAP[bailiffName.trim()] ||
        "231993";

      const judgeUpperHeader = `${(judgeName || "KADİR SAĞLAM").toLocaleUpperCase(
        "tr-TR"
      )}${jSicil ? ` ${jSicil}` : ""}`;
      const clerkUpperHeader = `${(clerkName || "MEHMET AKIN").toLocaleUpperCase(
        "tr-TR"
      )}${cSicil ? ` ${cSicil}` : ""}`;

      const judgeInline = `${judgeName || "Kadir SAĞLAM"}${
        jSicil ? ` (${jSicil})` : ""
      }`;
      const clerkInline = `${clerkName || "Mehmet AKIN"}${
        cSicil ? ` (${cSicil})` : ""
      }`;
      const bailiffInline = `${bailiffName || "Ebru YILMAZ"}${
        bSicil ? ` (${bSicil})` : ""
      }`;

      const inlineExpertsPhrase = formatExpertTitlesInlinePhrase(
        selectedExperts,
        record.experts
      );

      const expertsToRender =
        selectedExperts.length > 0
          ? selectedExperts
          : DEFAULT_REGISTERED_EXPERTS;

      const observationGroups = buildGroupedParcelObservationGroups(record);

      // Ara imza satırı (Fen Bilirkişisi   Ziraat Bilirkişisi   İnşaat Bilirkişisi)
      const midSignatureCellsHtml = expertsToRender
        .map(
          (e) =>
            `<td align="center" style="font-family:'Times New Roman',serif; font-size:12pt; padding:6pt 10pt;">${escapeHtml(
              e.title
            )}</td>`
        )
        .join("");

      // Alt kenarlıklı imza tablosu 2. satır (Ziraat Bilirkişisi | Fen Bilirkişisi | İnşaat Bilirkişisi)
      const bottomExpertCells: string[] = [];
      for (let i = 0; i < Math.max(3, expertsToRender.length); i++) {
        const exp = expertsToRender[i];
        bottomExpertCells.push(
          `<td width="33.3%" valign="top" align="center" style="border:1px solid #000000; padding:4pt 6pt 34pt 6pt; font-family:'Times New Roman',serif; font-size:12pt; color:#991b1b;">${
            exp ? escapeHtml(exp.title) : "&nbsp;"
          }</td>`
        );
      }
      const bottomExpertRowHtml = `<tr>${bottomExpertCells
        .slice(0, 3)
        .join("")}</tr>`;

      // Eğer kullanıcı serbest metin modunda düzenleme yaptıysa onu, yapmadıysa birebir PDF şablonunu oluştur
      let bodySectionHtml = "";
      if (customBodyOverride && customBodyOverride.trim().length > 0) {
        bodySectionHtml = customBodyOverride
          .split(/\n\n+/)
          .map((p) => {
            const lines = p
              .split("\n")
              .map((l) => escapeHtml(l))
              .join("<br/>");
            return `<p class="ZaptPara">${lines}</p>`;
          })
          .join("\n");
      } else {
        const expertParagraphsHtml = expertsToRender
          .map((exp) => {
            const desc =
              exp.description?.trim() ||
              buildDefaultExpertDescription(
                exp.title,
                exp.fullName,
                exp.sicilNo
              );
            return `<p class="ZaptPara">${escapeHtml(desc)}</p>`;
          })
          .join("\n");

        const observationHtml = observationGroups
          .map((grp, gIdx) => {
            const pLinesHtml = grp.parcelLines
              .map(
                (pl) =>
                  `<p class="ZaptFlushRed" style="margin:0; color:#991b1b;">${escapeHtml(
                    pl
                  )}</p>`
              )
              .join("\n");

            if (gIdx === 0) {
              return `
                <p class="ZaptPara" style="margin-top:12pt; margin-bottom:2pt;">
                  <strong>Keşif heyeti gözleminde;</strong> <span style="color:#991b1b;">${escapeHtml(
                    grp.headerLine
                  )}</span>
                </p>
                ${pLinesHtml}
              `;
            }
            return `
              <p class="ZaptFlushRed" style="margin-top:8pt; margin-bottom:2pt; color:#991b1b;">
                ${escapeHtml(grp.headerLine)}
              </p>
              ${pLinesHtml}
            `;
          })
          .join("\n");

        bodySectionHtml = `
          <p class="ZaptPara">
            Mahkememize ait iş bu dava dosyasında verilen keşif ara kararı uyarınca keşif yapılmasına karar verilmiş başta Hakim ${escapeHtml(
              judgeInline
            )}, Zabıt Katibi ${escapeHtml(
          clerkInline
        )}, Mübaşir ${escapeHtml(bailiffInline)} ile ${escapeHtml(
          inlineExpertsPhrase
        )} refakate alınarak ${escapeHtml(
          vehiclePlateText
        )} davaya konu edilen taşınmazların başına gelindi.
          </p>
          <p class="ZaptPara">Açık keşfe başlandı.</p>
          <p class="ZaptPara" style="color:#991b1b;">
            ${escapeHtml(attendingPartiesText)}
          </p>
          <p class="ZaptPara">Bilirkişilerin kimliklerinin tespitine geçildi.</p>
          ${expertParagraphsHtml}
          <p class="ZaptPara">
            Dava konusu olan taşınmazlar bilirkişiler eşliğinde ayrı ayrı gezildi, incelendi. Bilirkişiler ölçümlerini yaptılar, notlarını alıp incelemelerini yaptılar. Kendilerine hangi hususta rapor verecekleri anlatıldı.
          </p>
          <p class="ZaptPara">
            Bilirkişiler yukarıdaki kimlikleri ve yeminleri tahtında ayrı ayrı huzura alındı, soruldu:
          </p>
          <p class="ZaptFlush">
            Keşif mahallini mahkeme heyeti ile birlikte gezdik, ölçümlerimizi yapıp notlarımızı aldık, tarafımıza süre verildiğinde ayrıntılı raporumuzu hazırlayıp, dosyaya ibraz edeceğiz dediler. Beyanları okundu. İmzaları alındı.
          </p>

          <table width="100%" cellspacing="0" cellpadding="4" style="border-collapse:collapse; margin-top:6pt; margin-bottom:14pt;">
            <tr>
              ${midSignatureCellsHtml}
            </tr>
          </table>

          ${observationHtml}

          <p class="ZaptPara" style="margin-top:8pt; color:#991b1b;">
            Davacı vekilinden soruldu: Yapılan keşfe ve bilirkişi beyanlarına karşı bir diyeceğimiz yoktur. Bilirkişi raporları dosyaya sunulduğunda ayrıca beyanda bulunacağız dedi.
          </p>
          <p class="ZaptPara" style="color:#991b1b;">
            Davalı vekilinden soruldu: Yapılan keşfe ve bilirkişi beyanlarına karşı bir diyeceğimiz yoktur. Bilirkişi raporları dosyaya sunulduğunda ayrıca beyanda bulunacağız dedi.
          </p>
          <p class="ZaptPara">
            Keşif mahallinde yapılacak başka işlem kalmadığından açık keşfe son verildi.
          </p>

          <p class="ZaptPara" style="margin-top:4pt;">
            <strong><u>G.D.</u></strong>
          </p>
          <p class="ZaptPara">
            <strong>1-</strong>Mahkeme heyetinin yolluğunun harçlar kanuna göre ödenmesine,
          </p>
          <p class="ZaptPara">
            <strong>2-</strong>Bilirkişilere ayrıntılı raporunu 3 üç nüsha olarak ibraz etmeleri için fen bilirkişisi için 15 gün, ziraat bilirkişisi için 25 gün ve inşaat bilirkişisi için 35 gün süre verilmesine, bilirkişilere emek ve mesaisine karşılık fen bilirkişisi için <span style="color:#991b1b;">3.500,00 TL</span>, ziraat bilirkişisi için <span style="color:#991b1b;">4.000,00 TL</span> ve inşaat bilirkişisi <span style="color:#991b1b;">4.000,00 TL</span> ücret takdirine,
          </p>
          <p class="ZaptPara">
            <strong>3-</strong>Araç şoförü tarafından gidiş-dönüş, bekleme ücreti olarak toplamda <span style="color:#991b1b;">${escapeHtml(
              driverFeeTl
            )}</span>'lik fatura verildiği takdirde, faturanın dosyada saklanmasına, faturada geçen <span style="color:#991b1b;">${escapeHtml(
          driverFeeTl
        )}</span>’nin keşifte görev alan şoföre ödenmesine,
          </p>
          <p class="ZaptPara">
            <strong>4-</strong>Sarf kararının adliyede düzenlenmesine,
          </p>
          <p class="ZaptPara" style="margin-bottom:14pt;">
            Dair, iş bu zabıt keşif mahalinde tanzim edilerek hep birlikte imza altına alındı.<span style="color:#991b1b;">${escapeHtml(
              slashDate
            )}</span>
          </p>
        `;
      }

      const footerLeftText = `Fatsa 2. Sulh Hukuk Mahkemesi – ${esasFormatted} – Keşif Zaptı`;

      const pageBreakBetweenSections =
        idx < items.length - 1
          ? `<br clear="all" style="page-break-before: always; mso-break-type: section-break;" />`
          : "";

      return `
      <div class="Section${sNum}">
        <!-- ÜST MAHKEME BAŞLIĞI (T.C. / FATSA / 2.SULH HUKUK MAHKEMESİ) -->
        <div style="text-align: center; font-family: 'Times New Roman', serif; font-size: 12pt; font-weight: bold; line-height: 1.2; margin-bottom: 14pt;">
          T.C.<br/>
          FATSA<br/>
          2.SULH HUKUK MAHKEMESİ
        </div>

        <!-- SAYI / HAKİM / KATİP / KEŞ.TAR. KÜNYE TABLOSU -->
        <table width="100%" cellspacing="0" cellpadding="1" style="border-collapse: collapse; margin-bottom: 14pt; font-family: 'Times New Roman', serif; font-size: 12pt; font-weight: bold;">
          <tr>
            <td width="16%" style="padding: 1.5pt 0;">SAYI</td>
            <td width="54%" style="padding: 1.5pt 0;">: ${escapeHtml(
              esasFormatted
            )}</td>
            <td width="30%" align="right" style="padding: 1.5pt 0; font-style: italic; font-weight: bold;">
              &ldquo;KEŞİF ZAPTI&rdquo;
            </td>
          </tr>
          <tr>
            <td colspan="3" style="height: 8pt;"></td>
          </tr>
          <tr>
            <td style="padding: 1.5pt 0;">HAKİM</td>
            <td colspan="2" style="padding: 1.5pt 0;">: ${escapeHtml(
              judgeUpperHeader
            )}</td>
          </tr>
          <tr>
            <td style="padding: 1.5pt 0;">KATİP</td>
            <td colspan="2" style="padding: 1.5pt 0;">: ${escapeHtml(
              clerkUpperHeader
            )}</td>
          </tr>
          <tr>
            <td style="padding: 1.5pt 0;">Keş.Tar.</td>
            <td colspan="2" style="padding: 1.5pt 0;">: ${escapeHtml(
              slashDate
            )}</td>
          </tr>
        </table>

        <!-- GÖVDE METNİ -->
        ${bodySectionHtml}

        <!-- ALT 3x3 KENARLIKLI İMZA TABLOSU (ŞABLON SAYFA 2 İLE BİREBİR) -->
        <table width="100%" cellspacing="0" cellpadding="4" style="border-collapse: collapse; border: 1px solid #000000; margin-top: 12pt; font-family: 'Times New Roman', serif; font-size: 12pt;">
          <tr>
            <td width="33.3%" valign="top" align="center" style="border: 1px solid #000000; padding: 4pt 6pt 34pt 6pt;">
              Hakim ${escapeHtml(jSicil)}
            </td>
            <td width="33.3%" valign="top" align="center" style="border: 1px solid #000000; padding: 4pt 6pt 34pt 6pt;">
              Zabıt Katibi ${escapeHtml(cSicil)}
            </td>
            <td width="33.3%" valign="top" align="center" style="border: 1px solid #000000; padding: 4pt 6pt 34pt 6pt;">
              Mübaşir ${escapeHtml(bSicil)}
            </td>
          </tr>
          ${bottomExpertRowHtml}
          <tr>
            <td width="33.3%" valign="top" align="center" style="border: 1px solid #000000; padding: 4pt 6pt 34pt 6pt;">
              Davacı Vekili
            </td>
            <td width="33.3%" valign="top" align="center" style="border: 1px solid #000000; padding: 4pt 6pt 34pt 6pt;">
              Davalı Vekili
            </td>
            <td width="33.3%" valign="top" align="center" style="border: 1px solid #000000; padding: 4pt 6pt 34pt 6pt;">
              &nbsp;
            </td>
          </tr>
        </table>

        <!-- WORD NATIVE ALT BİLGİ (FOOTER) & SİYAH KUTULU SAYFA NUMARASI -->
        <div style="mso-element:footer" id="f${sNum}">
          <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border-top: 2pt solid #1e293b;">
            <tr>
              <td align="left" valign="middle" width="88%" style="padding-top: 4pt; font-family: 'Calibri', 'Arial Narrow', sans-serif; font-size: 10.5pt; color: #64748b;">
                ${escapeHtml(footerLeftText)}
              </td>
              <td align="right" valign="top" width="12%">
                <table cellspacing="0" cellpadding="0" align="right" style="border-collapse: collapse;">
                  <tr>
                    <td align="center" valign="middle" style="background-color: #111827; color: #ffffff; font-family: 'Times New Roman', serif; font-size: 11pt; font-weight: bold; padding: 4pt 12pt;">
                      <span style='mso-field-code:" PAGE "'><span style="mso-no-proof:yes">1</span></span>
                    </td>
                  </tr>
                </table>
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
      font-size: 12pt;
      color: #000000;
      line-height: 1.18;
    }
    p.ZaptPara {
      margin: 0pt 0pt 2pt 0pt;
      text-indent: 35.4pt; /* 1.25 cm standart mahkeme paragraf girintisi */
      text-align: justify;
      line-height: 1.18;
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
    }
    p.ZaptFlush {
      margin: 0pt 0pt 2pt 0pt;
      text-indent: 0pt;
      text-align: justify;
      line-height: 1.18;
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
    }
    p.ZaptFlushRed {
      margin: 0pt 0pt 1pt 0pt;
      text-indent: 0pt;
      text-align: left;
      line-height: 1.18;
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      color: #991b1b;
    }
    table {
      border-collapse: collapse;
    }
    p.MsoFooter, li.MsoFooter, div.MsoFooter {
      margin: 0cm;
      margin-bottom: .0001pt;
      mso-pagination: widow-orphan;
      font-size: 10pt;
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
    .replace(/\s*E\.?$/i, "")
    .replace(/\s*Esas$/i, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-");
  const fileName =
    customFileName ||
    (items.length === 1
      ? `${firstEsas}_Kesif_Zapti.doc`
      : `Fatsa_2_SHM_Toplu_Kesif_Zapti_${items.length}_Dosya.doc`);

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
