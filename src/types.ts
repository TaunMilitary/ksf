export type CourtDistrict = "Fatsa" | "Çamaş" | "Çatalpınar";

export type InspectionType =
  | "Ortaklığın Giderilmesi"
  | "Kadastro Tespitine İtiraz"
  | "Elatmanın Önlenmesi ve Kal"
  | "Kira Tespiti ve Tahliye"
  | "Geçit Hakkı Tesisi"
  | "Ecrimisil ve Sınır Tespiti"
  | "Delil Tespiti"
  | "Kamulaştırma Bedel Tespiti";

export type InspectionStatus =
  | "planlandi"
  | "yapildi"
  | "iptal_edildi"
  | "ertelendi";

export interface WeatherForecast {
  condition: "sunny" | "partly_cloudy" | "cloudy" | "rainy" | "stormy" | "snowy";
  label: string; // Örn: "Güneşli", "Parçalı Bulutlu", "Yağmurlu"
  tempMax: number;
  tempMin: number;
  precipitationProb: number; // % yağış ihtimali
  windSpeedKmh?: number;
  source: "open_meteo" | "seasonal_norm";
}

export type ParcelBoundarySource =
  | "tkgm_api"
  | "geojson_import"
  | "cadastre_computed";

export type InspectionSubjectType = "tasinmaz" | "arac";

export interface ParcelItem {
  id: string; // Örn: "155062-101-1"
  mahalleId?: number;
  neighborhood?: string;
  adaNo: string;
  parselNo: string;
  bagimsizBolumNo?: string; // Örn: "4", "Zemin Kat No: 2" (Keşif Ajandası ve Bilirkişi paylaşımı için)
  nitelik?: string;
  yuzolcumuM2?: number;
  paftaNo?: string;
  mevkii?: string;
  centerLat?: number;
  centerLng?: number;
  polygon?: [number, number][];
  source?: ParcelBoundarySource;
  distanceFromFirstMeters?: number; // 1. parsele olan mesafe (yakın parsel önerileri için)
}

export interface VehicleInspectionInfo {
  plateNo: string; // Örn: "52 AF 452"
  brandModel?: string; // Örn: "Renault Megane 2022"
  vehicleType?: string; // Örn: "Otomobil", "Kamyonet / Ticari", "Motosiklet", "Traktör / İş Makinesi"
  chassisOrEngineNo?: string; // Şasi / Motor No (İsteğe bağlı)
  damageSummary?: string; // Örn: "Kaza sonrası ön tampon, sağ çamurluk hasar ve değer kaybı tespiti"
  inspectionPlace?: string; // Örn: "Fatsa Sanayi Sitesi / Yediemin Otoparkı / Adliye Otoparkı"
}

export type CourtUserTitle =
  | "Hakim"
  | "Yazı İşleri Müdürü"
  | "Zabıt Katibi"
  | "Mübaşir"
  | "Tekniker / Bilirkişi"
  | "Diğer Kalem Personeli";

export interface UserProfileConfig {
  fullName: string; // Örn: "Mehmet Demir"
  title: CourtUserTitle; // Örn: "Zabıt Katibi"
  sicilNo?: string; // Örn: "ab145230"
  courtUnit?: string; // Örn: "Fatsa Sulh Hukuk Mahkemesi Kalemi"
  includeDeviceName?: boolean; // Keşfi ekleyen bilgisinde cihaz adı da parantez içinde yer alsın mı
}

export interface InspectionRecord {
  id: string;
  esasNo: string; // Örn: 2026/145 E.
  district: CourtDistrict; // Fatsa | Çamaş | Çatalpınar
  neighborhood: string; // Örn: Ilıca Mahallesi
  tkgmMahalleId?: number; // Resmi TKGM Mahalle ID
  subjectType?: InspectionSubjectType; // "tasinmaz" (varsayılan) | "arac" (delil tespiti araç hasar)
  adaNo?: string; // Örn: "2058" (1. parsel veya tek parsel)
  parselNo?: string; // Örn: "1" (1. parsel veya tek parsel)
  bagimsizBolumNo?: string; // Örn: "3" (1. parsel veya tek parsel için Bağımsız Bölüm No)
  nitelik?: string; // Örn: "Fındık Bahçesi", "Arsa ve Kâgir Ev", "Tarla"
  yuzolcumuM2?: number; // Örn: 2746.15 (ondalıklı m² destekli - çoklu parselde toplam alan)
  paftaNo?: string; // Örn: "G38-B-04-B-2-B"
  parcelPolygon?: [number, number][]; // 1. Taşınmaz sınır poligonu [lat, lng][]
  parcelSource?: ParcelBoundarySource;
  parcels?: ParcelItem[]; // Birden fazla parsel eklendiğinde tüm parsellerin listesi ve poligonları
  vehicleInfo?: VehicleInspectionInfo; // Konu "arac" seçildiğinde plaka, marka/model ve hasar bilgisi
  addressDetail?: string; // Mevki veya ek açıklama
  lat: number;
  lng: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  caseType: InspectionType | string;
  experts: string; // Bilirkişi heyeti (Fen, Ziraat, İnşaat, Makine vb.)
  notes: string;
  distanceKm: number; // Fatsa Adliyesi'ne karayolu mesafesi (OSRM)
  durationMin: number; // Tahmini araç sürüş süresi (OSRM)
  routeGeometry?: [number, number][]; // OSRM polyline koordinatları
  corridor?: string; // Güzergah bölgesi
  status?: InspectionStatus; // planlandi | yapildi | iptal_edildi | ertelendi
  statusNote?: string; // Erteleme veya iptal gerekçesi
  createdBy?: string; // Ayarlardaki kullanıcı adı + unvanı ve/veya bilgisayar/telefon adı
  createdByTitle?: CourtUserTitle | string; // Ekleyen kişinin unvanı
  deviceType?: "pc" | "mobile" | "tablet"; // Ekleyen cihaz türü
  createdAt: string;
}

export interface FatsaNeighborhood {
  name: string;
  district: CourtDistrict;
  lat: number;
  lng: number;
  corridor: string;
  avgDistanceKm: number;
  avgDurationMin: number;
}

export interface SmartSuggestion {
  date: string;
  formattedDate: string;
  district: CourtDistrict;
  closestNeighborhood: string;
  distanceBetweenKm: number;
  existingCount: number;
  existingRecords: InspectionRecord[];
  corridorMatch: boolean;
  message: string;
}

export interface CloudSyncConfig {
  mode: "apps_script" | "github" | "google_drive_api";
  appsScriptUrl: string;
  driveClientId: string;
  driveApiKey: string;
  driveFileId: string;
  githubSyncType?: "gist" | "repo";
  githubToken?: string;
  githubGistId?: string;
  githubRepo?: string; // Örn: "kullanici/kesif-veritabani"
  githubFilePath?: string; // Örn: "kesif_veritabani.json"
  githubBranch?: string; // Örn: "main"
  autoSync: boolean;
  lastSyncAt: string | null;
}

export type ActiveTab =
  | "ajanda"
  | "takvim"
  | "harita"
  | "yeni_kesif"
  | "ai_rota"
  | "ayarlar";


export type PdfExportPeriod = "daily" | "weekly" | "monthly";

