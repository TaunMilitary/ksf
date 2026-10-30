import {
  CourtDistrict,
  CourtUserTitle,
  FatsaNeighborhood,
  InspectionRecord,
} from "../types";

export const DEFAULT_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwXFCBEGCQrNKPnF6zg-Fcd_fJp9zphRluwG5Uiw2PjR2Cmq-JQrSIwZ4LIqdUJqUup9w/exec";

// Fatsa Adliyesi (Sulh Hukuk Mahkemesi) Merkez Koordinatları (Tüm bölgenin yargı ve kalkış merkezi)
export const FATSA_COURTHOUSE = {
  name: "Fatsa Adliyesi (Sulh Hukuk Mahkemesi)",
  shortName: "Fatsa Adliyesi",
  lat: 41.0287,
  lng: 37.5008,
  address: "Mustafa Kemal Paşa Mah. Sahil Cad. Fatsa / Ordu",
  jurisdiction: "Fatsa, Çamaş ve Çatalpınar İlçeleri",
};

export const DISTRICTS: CourtDistrict[] = ["Fatsa", "Çamaş", "Çatalpınar"];

export const CASE_TYPES: string[] = [
  "Ortaklığın Giderilmesi",
  "Kadastro Tespitine İtiraz",
  "Elatmanın Önlenmesi ve Kal",
  "Kira Tespiti ve Tahliye",
  "Geçit Hakkı Tesisi",
  "Ecrimisil ve Sınır Tespiti",
  "Delil Tespiti",
  "Kamulaştırma Bedel Tespiti",
];

export interface CaseTypeVisualMeta {
  caseType: string;
  shortLabel: string;
  icon: string;
  bgColor: string;
  borderColor: string;
  badgeBg: string;
  badgeText: string;
}

export const CASE_TYPE_VISUALS: Record<string, CaseTypeVisualMeta> = {
  "Ortaklığın Giderilmesi": {
    caseType: "Ortaklığın Giderilmesi",
    shortLabel: "Ortaklığın Giderilmesi",
    icon: "👥",
    bgColor: "#d97706", // Amber-600
    borderColor: "#b45309",
    badgeBg: "#fef3c7",
    badgeText: "#92400e",
  },
  "Kadastro Tespitine İtiraz": {
    caseType: "Kadastro Tespitine İtiraz",
    shortLabel: "Kadastro Tespit",
    icon: "📐",
    bgColor: "#4f46e5", // Indigo-600
    borderColor: "#3730a3",
    badgeBg: "#e0e7ff",
    badgeText: "#3730a3",
  },
  "Elatmanın Önlenmesi ve Kal": {
    caseType: "Elatmanın Önlenmesi ve Kal",
    shortLabel: "Elatmanın Önlenmesi",
    icon: "🛡️",
    bgColor: "#0284c7", // Sky-600
    borderColor: "#0369a1",
    badgeBg: "#e0f2fe",
    badgeText: "#075985",
  },
  "Kira Tespiti ve Tahliye": {
    caseType: "Kira Tespiti ve Tahliye",
    shortLabel: "Kira & Tahliye",
    icon: "🏠",
    bgColor: "#0d9488", // Teal-600
    borderColor: "#0f766e",
    badgeBg: "#ccfbf1",
    badgeText: "#115e59",
  },
  "Geçit Hakkı Tesisi": {
    caseType: "Geçit Hakkı Tesisi",
    shortLabel: "Geçit Hakkı",
    icon: "🛣️",
    bgColor: "#7c3aed", // Violet-600
    borderColor: "#5b21b6",
    badgeBg: "#f3e8ff",
    badgeText: "#5b21b6",
  },
  "Ecrimisil ve Sınır Tespiti": {
    caseType: "Ecrimisil ve Sınır Tespiti",
    shortLabel: "Ecrimisil & Sınır",
    icon: "📍",
    bgColor: "#ea580c", // Orange-600
    borderColor: "#c2410c",
    badgeBg: "#ffedd5",
    badgeText: "#9a3412",
  },
  "Delil Tespiti": {
    caseType: "Delil Tespiti",
    shortLabel: "Delil Tespiti",
    icon: "🔍",
    bgColor: "#059669", // Emerald-600
    borderColor: "#047857",
    badgeBg: "#d1fae5",
    badgeText: "#065f46",
  },
  "Kamulaştırma Bedel Tespiti": {
    caseType: "Kamulaştırma Bedel Tespiti",
    shortLabel: "Kamulaştırma",
    icon: "🏗️",
    bgColor: "#dc2626", // Red-600
    borderColor: "#991b1b",
    badgeBg: "#fee2e2",
    badgeText: "#991b1b",
  },
};

export function getCaseTypeVisualMeta(caseType?: string): CaseTypeVisualMeta {
  if (!caseType) {
    return {
      caseType: "Genel Keşif",
      shortLabel: "Keşif",
      icon: "⚖️",
      bgColor: "#334155",
      borderColor: "#1e293b",
      badgeBg: "#f1f5f9",
      badgeText: "#334155",
    };
  }
  if (CASE_TYPE_VISUALS[caseType]) {
    return CASE_TYPE_VISUALS[caseType];
  }
  const lower = caseType.toLocaleLowerCase("tr-TR");
  if (lower.includes("ortak")) return CASE_TYPE_VISUALS["Ortaklığın Giderilmesi"];
  if (lower.includes("kadastro") || lower.includes("tapu"))
    return CASE_TYPE_VISUALS["Kadastro Tespitine İtiraz"];
  if (lower.includes("elatma") || lower.includes("el atma") || lower.includes("kal"))
    return CASE_TYPE_VISUALS["Elatmanın Önlenmesi ve Kal"];
  if (lower.includes("kira") || lower.includes("tahliye"))
    return CASE_TYPE_VISUALS["Kira Tespiti ve Tahliye"];
  if (lower.includes("geçit") || lower.includes("gecit"))
    return CASE_TYPE_VISUALS["Geçit Hakkı Tesisi"];
  if (lower.includes("ecrimisil") || lower.includes("sınır"))
    return CASE_TYPE_VISUALS["Ecrimisil ve Sınır Tespiti"];
  if (lower.includes("delil")) return CASE_TYPE_VISUALS["Delil Tespiti"];
  if (lower.includes("kamulaştırma") || lower.includes("bedel"))
    return CASE_TYPE_VISUALS["Kamulaştırma Bedel Tespiti"];

  return {
    caseType,
    shortLabel: caseType,
    icon: "⚖️",
    bgColor: "#334155",
    borderColor: "#1e293b",
    badgeBg: "#f1f5f9",
    badgeText: "#334155",
  };
}

export interface DefaultExpertOption {
  id: string;
  shortLabel: string;
  fullTitle: string;
}

// Yeni keşif ekleme ekranında yanına tik atılabilir varsayılan bilirkişi unvanları
export const DEFAULT_EXPERT_TITLES: DefaultExpertOption[] = [
  { id: "fen", shortLabel: "Fen", fullTitle: "Fen Bilirkişisi" },
  { id: "ziraat", shortLabel: "Ziraat", fullTitle: "Ziraat Bilirkişisi" },
  { id: "insaat", shortLabel: "İnşaat", fullTitle: "İnşaat Bilirkişisi" },
  { id: "makine", shortLabel: "Makine", fullTitle: "Makine Bilirkişisi" },
  { id: "mobilya", shortLabel: "Mobilya", fullTitle: "Mobilya Bilirkişisi" },
  { id: "mimar", shortLabel: "Mimar", fullTitle: "Mimar Bilirkişi" },
  {
    id: "gmdu",
    shortLabel: "GMDÜ",
    fullTitle: "GMDÜ (Gayrimenkul Değerleme Uzmanı)",
  },
];

export const EXPERT_PRESETS: string[] = [
  "Fen Bilirkişisi + Ziraat Bilirkişisi",
  "Fen Bilirkişisi + İnşaat Bilirkişisi + GMDÜ (Gayrimenkul Değerleme Uzmanı)",
  "Fen Bilirkişisi + Ziraat Bilirkişisi + İnşaat Bilirkişisi + Mimar Bilirkişi",
  "Makine Bilirkişisi + Mobilya Bilirkişisi",
  "Tek Fen Bilirkişisi (Sınır/Çap Uygulaması)",
];

export const PARCEL_NITELIK_PRESETS: string[] = [
  "Fındık Bahçesi",
  "Fındık Bahçesi ve Kâgir Bina",
  "Arsa",
  "Tarla",
  "Bahçeli Ahşap Ev",
  "İki Katlı Kâgir Ev ve Arsası",
  "Kavaklık ve Tarla",
];

export const VEHICLE_TYPE_PRESETS: string[] = [
  "Otomobil",
  "Kamyonet / Panelvan",
  "Kamyon / Çekici",
  "Motosiklet",
  "Traktör / İş Makinesi",
  "Minibüs / Otobüs",
];

export const VEHICLE_INSPECTION_PLACE_PRESETS: string[] = [
  "Fatsa Sanayi Sitesi",
  "Fatsa Yediemin Otoparkı",
  "Fatsa Adliyesi Otoparkı",
  "Evkaf Mah. Yetkili Servis Alanı",
  "Dolunay Mah. Otopark / İnceleme Noktası",
];

export interface UserTitleOption {
  title: CourtUserTitle;
  icon: string;
  description: string;
}

export const USER_TITLE_OPTIONS: UserTitleOption[] = [
  {
    title: "Hakim",
    icon: "⚖️",
    description: "Sulh Hukuk Mahkemesi Hakimi",
  },
  {
    title: "Yazı İşleri Müdürü",
    icon: "📋",
    description: "Mahkeme Kalemi Yazı İşleri Müdürü",
  },
  {
    title: "Zabıt Katibi",
    icon: "⌨️",
    description: "Duruşma ve Keşif Zabıt Katibi",
  },
  {
    title: "Mübaşir",
    icon: "📣",
    description: "Mahkeme Kalemi ve Keşif Mübaşiri",
  },
  {
    title: "Tekniker / Bilirkişi",
    icon: "📐",
    description: "Adliye Fen / Kadastro / Teknik Uzmanı",
  },
  {
    title: "Diğer Kalem Personeli",
    icon: "🏛️",
    description: "Adliye Kalem Personeli",
  },
];

// Ordu ili Fatsa, Çamaş ve Çatalpınar ilçeleri mahalle ve köy veri tabanı (TKGM MEGSİS koordinatlarıyla tam uyumlu)
export const FATSA_NEIGHBORHOODS: FatsaNeighborhood[] = [
  // --- FATSA İLÇESİ MAHALLELERİ ---
  { name: "Mustafa Kemal Paşa Mahallesi", district: "Fatsa", lat: 41.0302, lng: 37.4985, corridor: "Fatsa Merkez", avgDistanceKm: 1.2, avgDurationMin: 4 },
  { name: "Dumlupınar Mahallesi", district: "Fatsa", lat: 41.0273, lng: 37.5044, corridor: "Fatsa Merkez", avgDistanceKm: 1.5, avgDurationMin: 5 },
  { name: "Sakarya Mahallesi", district: "Fatsa", lat: 41.0274, lng: 37.4897, corridor: "Fatsa Merkez", avgDistanceKm: 1.8, avgDurationMin: 5 },
  { name: "Kurtuluş Mahallesi", district: "Fatsa", lat: 41.0184, lng: 37.5147, corridor: "Fatsa Merkez", avgDistanceKm: 2.1, avgDurationMin: 6 },
  { name: "Evkaf Mahallesi", district: "Fatsa", lat: 41.0425, lng: 37.4714, corridor: "Fatsa Merkez - Batı Yamaç", avgDistanceKm: 3.4, avgDurationMin: 7 },
  { name: "Dolunay Mahallesi", district: "Fatsa", lat: 41.0632, lng: 37.4604, corridor: "Batı Sahil - Ünye Yönü", avgDistanceKm: 4.8, avgDurationMin: 8 },
  { name: "Ayazlı Mahallesi", district: "Fatsa", lat: 41.0151, lng: 37.4633, corridor: "Fatsa Merkez - Güneybatı", avgDistanceKm: 4.1, avgDurationMin: 8 },
  { name: "Şerefiye Mahallesi", district: "Fatsa", lat: 41.0200, lng: 37.4930, corridor: "Fatsa Merkez", avgDistanceKm: 2.3, avgDurationMin: 6 },
  { name: "Karşıyaka Mahallesi", district: "Fatsa", lat: 40.9501, lng: 37.3111, corridor: "Geyikçeli - Kumru Güzergahı", avgDistanceKm: 19.5, avgDurationMin: 27 },
  { name: "Ilıca Mahallesi", district: "Fatsa", lat: 40.9818, lng: 37.6211, corridor: "Ilıca - Bolaman Vadisi", avgDistanceKm: 14.2, avgDurationMin: 19 },
  { name: "İslamdağ Mahallesi", district: "Fatsa", lat: 40.9023, lng: 37.3845, corridor: "İslamdağ - Korgan Vadisi", avgDistanceKm: 18.6, avgDurationMin: 25 },
  { name: "Saraytepe Mahallesi", district: "Fatsa", lat: 40.9952, lng: 37.4466, corridor: "Saraytepe - Kabakdağı Hattı", avgDistanceKm: 7.5, avgDurationMin: 11 },
  { name: "Uzundere Mahallesi", district: "Fatsa", lat: 40.9518, lng: 37.6212, corridor: "Ilıca - Uzundere Vadisi", avgDistanceKm: 16.4, avgDurationMin: 22 },
  { name: "Bolaman Mahallesi", district: "Fatsa", lat: 41.0313, lng: 37.6080, corridor: "Doğu Sahil - Bolaman - Yalıköy", avgDistanceKm: 8.4, avgDurationMin: 11 },
  { name: "Yalıköy Mahallesi", district: "Fatsa", lat: 41.0528, lng: 37.6228, corridor: "Doğu Sahil - Bolaman - Yalıköy", avgDistanceKm: 14.6, avgDurationMin: 17 },
  { name: "Sefaköy Mahallesi", district: "Fatsa", lat: 40.9631, lng: 37.4995, corridor: "Fatsa Güney İç Hat", avgDistanceKm: 7.8, avgDurationMin: 12 },
  { name: "Hatipli Mahallesi", district: "Fatsa", lat: 40.9587, lng: 37.3311, corridor: "Hatipli - Kumru Hattı", avgDistanceKm: 17.8, avgDurationMin: 24 },
  { name: "Kabakdağı Mahallesi", district: "Fatsa", lat: 40.9634, lng: 37.5420, corridor: "Kabakdağı - Aslancami Güzergahı", avgDistanceKm: 8.6, avgDurationMin: 13 },
  { name: "Yapraklı Mahallesi", district: "Fatsa", lat: 41.0589, lng: 37.4543, corridor: "Batı Sahil - Yapraklı", avgDistanceKm: 5.4, avgDurationMin: 9 },
  { name: "Geyikçeli Mahallesi", district: "Fatsa", lat: 40.9339, lng: 37.3573, corridor: "Geyikçeli - Kumru Güzergahı", avgDistanceKm: 16.5, avgDurationMin: 23 },
  { name: "Aslancami Mahallesi", district: "Fatsa", lat: 40.9066, lng: 37.6047, corridor: "Aslancami - Çamaş Koridoru", avgDistanceKm: 15.9, avgDurationMin: 22 },
  { name: "Örencik Mahallesi", district: "Fatsa", lat: 40.9443, lng: 37.4794, corridor: "Güney İç Hat", avgDistanceKm: 10.4, avgDurationMin: 15 },
  { name: "Konakbaşı Mahallesi", district: "Fatsa", lat: 41.0046, lng: 37.5269, corridor: "Aslancami - Çamaş Koridoru", avgDistanceKm: 4.5, avgDurationMin: 8 },
  { name: "Buhari Mahallesi", district: "Fatsa", lat: 41.0164, lng: 37.6284, corridor: "Doğu Sahil - Bolaman - Yalıköy", avgDistanceKm: 12.8, avgDurationMin: 16 },
  { name: "Kılıçlı Mahallesi", district: "Fatsa", lat: 40.9933, lng: 37.5514, corridor: "Doğu Yamaç Hattı", avgDistanceKm: 9.2, avgDurationMin: 14 },
  { name: "Meşebükü Mahallesi", district: "Fatsa", lat: 40.9944, lng: 37.4945, corridor: "Fatsa Güney", avgDistanceKm: 4.8, avgDurationMin: 8 },
  { name: "Yassıtaş Mahallesi", district: "Fatsa", lat: 40.9675, lng: 37.4835, corridor: "Fatsa Güney", avgDistanceKm: 8.9, avgDurationMin: 13 },
  { name: "Sudere Mahallesi", district: "Fatsa", lat: 41.0186, lng: 37.4425, corridor: "Batı Yamaç Hattı", avgDistanceKm: 7.4, avgDurationMin: 12 },
  { name: "Eskiordu Mahallesi", district: "Fatsa", lat: 40.9733, lng: 37.4207, corridor: "Batı İç Hat", avgDistanceKm: 10.7, avgDurationMin: 16 },
  { name: "Taşlıca Mahallesi", district: "Fatsa", lat: 40.9804, lng: 37.5170, corridor: "Aslancami - Çamaş Koridoru", avgDistanceKm: 7.8, avgDurationMin: 12 },

  // --- ÇAMAŞ İLÇESİ MAHALLELERİ ---
  { name: "Sarıyakup Mahallesi (Çamaş)", district: "Çamaş", lat: 40.8846, lng: 37.5581, corridor: "Çamaş İlçe Hattı", avgDistanceKm: 23.5, avgDurationMin: 32 },
  { name: "Kocaman Mahallesi (Çamaş)", district: "Çamaş", lat: 40.9150, lng: 37.5182, corridor: "Çamaş İlçe Hattı", avgDistanceKm: 21.4, avgDurationMin: 29 },
  { name: "Sakargeriş Mahallesi", district: "Çamaş", lat: 40.8747, lng: 37.5070, corridor: "Çamaş İlçe Hattı", avgDistanceKm: 25.2, avgDurationMin: 35 },
  { name: "Danışman Mahallesi", district: "Çamaş", lat: 40.9354, lng: 37.5272, corridor: "Çamaş İlçe Hattı", avgDistanceKm: 19.8, avgDurationMin: 27 },
  { name: "Edirli Mahallesi", district: "Çamaş", lat: 40.9421, lng: 37.5099, corridor: "Çamaş İlçe Hattı", avgDistanceKm: 18.6, avgDurationMin: 25 },
  { name: "Burhangüneyi Mahallesi", district: "Çamaş", lat: 40.8866, lng: 37.5704, corridor: "Çamaş İlçe Hattı", avgDistanceKm: 26.4, avgDurationMin: 36 },
  { name: "Kemalpaşa Mahallesi", district: "Çamaş", lat: 40.8580, lng: 37.5664, corridor: "Çamaş İlçe Hattı", avgDistanceKm: 28.9, avgDurationMin: 39 },
  { name: "Örmeli Mahallesi", district: "Çamaş", lat: 40.9058, lng: 37.5142, corridor: "Çamaş İlçe Hattı", avgDistanceKm: 22.4, avgDurationMin: 30 },
  { name: "Akpınar Mahallesi", district: "Çamaş", lat: 40.9109, lng: 37.4922, corridor: "Çamaş İlçe Hattı", avgDistanceKm: 21.5, avgDurationMin: 29 },

  // --- ÇATALPINAR İLÇESİ MAHALLELERİ ---
  { name: "Merkez Mahallesi (Çatalpınar)", district: "Çatalpınar", lat: 40.8752, lng: 37.4452, corridor: "Çatalpınar İlçe Hattı", avgDistanceKm: 26.8, avgDurationMin: 36 },
  { name: "Güney Mahallesi (Çatalpınar)", district: "Çatalpınar", lat: 40.8788, lng: 37.4396, corridor: "Çatalpınar İlçe Hattı", avgDistanceKm: 26.5, avgDurationMin: 36 },
  { name: "Göller Mahallesi", district: "Çatalpınar", lat: 40.9240, lng: 37.4692, corridor: "Çatalpınar İlçe Hattı", avgDistanceKm: 21.4, avgDurationMin: 29 },
  { name: "Haşal Mahallesi", district: "Çatalpınar", lat: 40.8715, lng: 37.4598, corridor: "Çatalpınar İlçe Hattı", avgDistanceKm: 27.5, avgDurationMin: 38 },
  { name: "Ortaköy Mahallesi", district: "Çatalpınar", lat: 40.8078, lng: 37.4349, corridor: "Çatalpınar İlçe Hattı", avgDistanceKm: 34.2, avgDurationMin: 46 },
  { name: "Keçili Mahallesi", district: "Çatalpınar", lat: 40.8632, lng: 37.4732, corridor: "Çatalpınar İlçe Hattı", avgDistanceKm: 29.5, avgDurationMin: 40 },
  { name: "Karahasan Mahallesi", district: "Çatalpınar", lat: 40.8490, lng: 37.4321, corridor: "Çatalpınar İlçe Hattı", avgDistanceKm: 30.8, avgDurationMin: 42 },
  { name: "Maden Mahallesi", district: "Çatalpınar", lat: 40.8613, lng: 37.4071, corridor: "Çatalpınar İlçe Hattı", avgDistanceKm: 31.2, avgDurationMin: 43 },
  { name: "Şirinköy Mahallesi", district: "Çatalpınar", lat: 40.8859, lng: 37.4843, corridor: "Çatalpınar İlçe Hattı", avgDistanceKm: 26.1, avgDurationMin: 35 },
  { name: "Sayacatürk Mahallesi", district: "Çatalpınar", lat: 40.7909, lng: 37.4558, corridor: "Çatalpınar İlçe Hattı", avgDistanceKm: 36.0, avgDurationMin: 48 },
];

// Saraytepe Mahallesi 101 Ada 1 Parsel gerçek TKGM sınır poligonu (2.746,15 m²)
export const INITIAL_SARAYTEPE_101_1_POLYGON: [number, number][] = [
  [40.99537, 37.44672],
  [40.99549, 37.44668],
  [40.99565, 37.44659],
  [40.99573, 37.44654],
  [40.99535, 37.44624],
  [40.99531, 37.44621],
  [40.9951, 37.44604],
  [40.99499, 37.4461],
  [40.99499, 37.44633],
  [40.99508, 37.44657],
  [40.99506, 37.44676],
  [40.99504, 37.44688],
  [40.99506, 37.44685],
  [40.99509, 37.44682],
  [40.99518, 37.44672],
  [40.99529, 37.44669],
];

function getOffsetDateString(daysOffset: number): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysOffset);
  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function getInitialSampleInspections(): InspectionRecord[] {
  return [];
}



