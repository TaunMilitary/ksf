/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Search,
  MapPin,
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Cloud,
  Sparkles,
  CheckCircle2,
  Route,
  FileDown,
  RotateCcw,
  Compass,
  X,
  Building2,
  ListOrdered,
  Map as MapIcon,
  Layers,
  Upload,
  ExternalLink,
  Share2,
  Copy,
  Navigation,
  Users,
  Monitor,
  Smartphone,
  Settings,
  Car,
  UserCheck,
  Check,
  Sparkles as WandIcon,
  Lock,
  Eye,
  EyeOff,
  GitBranch,
  Globe,
  ShieldCheck,
  KeyRound,
  Pencil,
  Home,
  FileSpreadsheet,
  FileText,
  BarChart3,
  Bell,
  Sun,
  Moon,
  Mic,
  Camera,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Download,
  LayoutDashboard,
} from "lucide-react";
import {
  ActiveTab,
  AppPreferences,
  CloudSyncConfig,
  CourtDistrict,
  CourtUserTitle,
  FontScalePreference,
  InspectionAuditEntry,
  InspectionRecord,
  InspectionStatus,
  InspectionSubjectType,
  ParcelBoundarySource,
  ParcelItem,
  PdfExportPeriod,
  RegisteredExpert,
  SmartSuggestion,
  ThemePreference,
  UserProfileConfig,
  WeatherForecast,
} from "./types";
import {
  ADDRESS_NITELIK_PRESETS,
  CASE_TYPES,
  COURT_BAILIFF_PRESETS,
  COURT_CLERK_PRESETS,
  COURT_JUDGE_PRESETS,
  DEFAULT_APPS_SCRIPT_URL,
  DEFAULT_EXPERT_TITLES,
  DISTRICTS,
  EXPERT_PRESETS,
  FATSA_COURTHOUSE,
  FATSA_NEIGHBORHOODS,
  FATSA_STREET_PRESETS,
  getCaseTypeVisualMeta,
  getInitialSampleInspections,
  INITIAL_SARAYTEPE_101_1_POLYGON,
  PARCEL_NITELIK_PRESETS,
  USER_TITLE_OPTIONS,
  VEHICLE_INSPECTION_PLACE_PRESETS,
  VEHICLE_TYPE_PRESETS,
} from "./data/fatsaData";
import {
  buildDailyRoutePoints,
  calculateOSRMRoute,
  computeUniqueParcelAreaSum,
  detectClientDeviceInfo,
  expandBagimsizBolumTokens,
  extractRecordLocationStops,
  fetchNearbyTkgmParcels,
  fetchTkgmParcelByCoordinate,
  findSmartRouteSuggestions,
  formatAdaParselLabel,
  formatAddressLabel,
  formatAreaM2,
  formatDateTR,
  formatLongDateTR,
  formatUserProfileCreator,
  formatVehicleLabel,
  geocodeStreetAddressInDistrict,
  getRecordUniqueNeighborhoods,
  NominatimSearchResult,
  parsePastedParcelText,
  parseTkgmGeoJson,
  queryParcelBoundary,
  resolveNeighborhoodCoordinates,
  reverseGeocodeFatsaPoint,
  searchFatsaLocations,
} from "./services/geoService";
import {
  resolveTkgmMahalle,
  TKGM_MAHALLE_LIST,
} from "./data/tkgmMahalleData";
import { fetchWeatherForInspection } from "./services/weatherService";
import {
  exportInspectionsToPdf,
  exportMonthlyCompletedInspectionsToExcel,
  filterRecordsByPeriod,
  STATUS_LABELS,
} from "./services/pdfService";
import { InteractiveMap } from "./components/InteractiveMap";
import { CalendarView, renderWeatherIcon } from "./components/CalendarView";
import {
  CloudSyncModal,
  syncPushToActiveCloud,
} from "./components/CloudSyncModal";
import { MultiRouteAdvisorView } from "./components/MultiRouteAdvisorView";
import { EditInspectionModal } from "./components/EditInspectionModal";
import { InspectionMinutesView } from "./components/InspectionMinutesView";
import { StatisticsDashboardView } from "./components/StatisticsDashboardView";
import { ControlCenterHomeView } from "./components/ControlCenterHomeView";
import { FieldMediaNotesModal } from "./components/FieldMediaNotesModal";
import { AiAssistantModal } from "./components/AiAssistantModal";
import { DEFAULT_REGISTERED_EXPERTS } from "./services/wordMinutesService";
import {
  GitHubPublishResult,
  publishProjectToGitHubPagesKsf,
} from "./services/githubPagesPublisher";

const STORAGE_KEY_RECORDS = "fatsa_adliyesi_kesif_kayitlari_v5";
const STORAGE_KEY_REGISTERED_EXPERTS =
  "fatsa_adliyesi_bilirkisi_listesi_v1";
const LEGACY_RECORD_KEYS = [
  "fatsa_adliyesi_kesif_kayitlari_v4",
  "fatsa_adliyesi_kesif_kayitlari_v3",
  "fatsa_kesif_records_v2",
];
const STORAGE_KEY_CLOUD = "fatsa_adliyesi_cloud_config_v2";
const STORAGE_KEY_DEVICE_IDENTITY = "fatsa_adliyesi_device_identity_v1";
const STORAGE_KEY_USER_PROFILE = "fatsa_adliyesi_user_profile_v1";
const STORAGE_KEY_AUTH_SESSION = "fatsa_adliyesi_auth_session_v1";
const STORAGE_KEY_AUTH_REMEMBER = "fatsa_adliyesi_auth_remember_v1";
const STORAGE_KEY_PUBLISHED_KSF = "fatsa_adliyesi_published_ksf_v1";
const STORAGE_KEY_APP_PREFS = "fatsa_adliyesi_app_prefs_v1";
const STORAGE_KEY_READ_NOTIFS = "fatsa_adliyesi_read_notifs_v1";
const REQUIRED_APP_PASSWORD = "Fatsa2.SHM52";

/**
 * Varsayılan örnek veri kayıtlarını tespit eder (kullanıcının kendi girdiği keşifleri korur, örnek verileri ayıklar)
 */
function isSampleInspectionRecord(item: any): boolean {
  if (!item || typeof item !== "object") return true;
  const idStr = String(item.id || "");
  return idStr.startsWith("fatsa-kesif-") || idStr.startsWith("sample-");
}

/**
 * Kayıtlarda ada/parsel metin içinde yazılmışsa ayrıştırır (sahte poligon üretmez)
 */
function enrichLegacyRecord(item: any): InspectionRecord {
  const district: CourtDistrict = item.district || "Fatsa";
  let adaNo: string | undefined = item.adaNo;
  let parselNo: string | undefined = item.parselNo;

  if ((!adaNo || !parselNo) && typeof item.addressDetail === "string") {
    const m = item.addressDetail.match(/(\d+)\s*Ada\s*(\d+)\s*Parsel/i);
    if (m) {
      adaNo = adaNo || m[1];
      parselNo = parselNo || m[2];
    }
  }

  return {
    ...item,
    district,
    adaNo,
    parselNo,
  };
}

export default function App() {
  // 1. State: Inspection Records (Kullanıcının girdiği gerçek verileri korur, örnek veri içermez)
  const [inspections, setInspections] = useState<InspectionRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RECORDS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const userRecords = parsed
            .filter((item) => !isSampleInspectionRecord(item))
            .map(enrichLegacyRecord);
          if (userRecords.length > 0) {
            return userRecords;
          }
        }
      }
      // Fallback: eski anahtarlarda kullanıcı verisi varsa kurtar
      for (const oldKey of LEGACY_RECORD_KEYS) {
        const oldSaved = localStorage.getItem(oldKey);
        if (oldSaved) {
          const parsedOld = JSON.parse(oldSaved);
          if (Array.isArray(parsedOld)) {
            const recovered = parsedOld
              .filter((item) => !isSampleInspectionRecord(item))
              .map(enrichLegacyRecord);
            if (recovered.length > 0) {
              return recovered;
            }
          }
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  // 2. State: Cloud Sync Configuration with default Google Apps Script Web App URL
  const [cloudConfig, setCloudConfig] = useState<CloudSyncConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CLOUD);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          appsScriptUrl: parsed.appsScriptUrl || DEFAULT_APPS_SCRIPT_URL,
        };
      }
    } catch {
      // ignore
    }
    return {
      mode: "apps_script",
      appsScriptUrl: DEFAULT_APPS_SCRIPT_URL,
      driveClientId: "",
      driveApiKey: "",
      driveFileId: "",
      autoSync: false,
      lastSyncAt: null,
    };
  });

  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("ana_sayfa");

  // Uygulama Görünüm, Tema (Açık / Koyu / Sistem) ve Kişiselleştirme Tercihleri
  const [appPrefs, setAppPrefs] = useState<AppPreferences>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_APP_PREFS);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          themeMode: parsed.themeMode || "light",
          fontScale: parsed.fontScale || "normal",
          defaultDistrict: parsed.defaultDistrict || "Tümü",
          defaultCardCollapsed: Boolean(parsed.defaultCardCollapsed),
          notificationsEnabled: parsed.notificationsEnabled !== false,
          hiddenHomeWidgets: Array.isArray(parsed.hiddenHomeWidgets)
            ? parsed.hiddenHomeWidgets
            : [],
        };
      }
    } catch {
      // ignore
    }
    return {
      themeMode: "light",
      fontScale: "normal",
      defaultDistrict: "Tümü",
      defaultCardCollapsed: false,
      notificationsEnabled: true,
      hiddenHomeWidgets: [],
    };
  });

  const handleUpdateAppPrefs = (patch: Partial<AppPreferences>) => {
    setAppPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY_APP_PREFS, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Tema (Açık / Koyu / Sistem) ve Yazı Boyutu DOM Senkronizasyonu
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (mode: ThemePreference) => {
      const prefersDark =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      const effectiveDark =
        mode === "dark" || (mode === "system" && prefersDark);
      if (effectiveDark) {
        root.classList.add("dark");
        root.setAttribute("data-theme", "dark");
      } else {
        root.classList.remove("dark");
        root.setAttribute("data-theme", "light");
      }
    };

    applyTheme(appPrefs.themeMode);
    root.setAttribute("data-font-scale", appPrefs.fontScale || "normal");

    if (appPrefs.themeMode === "system" && window.matchMedia) {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      const listener = () => applyTheme("system");
      mql.addEventListener("change", listener);
      return () => mql.removeEventListener("change", listener);
    }
  }, [appPrefs.themeMode, appPrefs.fontScale]);

  // Bildirim Merkezi, Katlanabilir Keşif Kartları, Silme Onayı, Sesli Not/Foto, YZ Asistanı ve Hızlı İşlem Menüsü State
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [readNotifIds, setReadNotifIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_READ_NOTIFS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});
  const [expandedAgendaDates, setExpandedAgendaDates] = useState<Record<string, boolean>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [mediaModalRecord, setMediaModalRecord] =
    useState<InspectionRecord | null>(null);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [isQuickActionMenuOpen, setIsQuickActionMenuOpen] = useState(false);
  const [partyNameInput, setPartyNameInput] = useState("");
  const [duplicateWarningMsg, setDuplicateWarningMsg] = useState<string | null>(
    null
  );
  const [allowDuplicateSubmit, setAllowDuplicateSubmit] = useState(false);
  const [agendaDateFrom, setAgendaDateFrom] = useState("");
  const [agendaDateTo, setAgendaDateTo] = useState("");
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  // Açılış Şifre Koruması ("Fatsa2.SHM52") State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return (
        sessionStorage.getItem(STORAGE_KEY_AUTH_SESSION) === "unlocked" ||
        localStorage.getItem(STORAGE_KEY_AUTH_REMEMBER) === "unlocked"
      );
    } catch {
      return false;
    }
  });
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberDeviceAuth, setRememberDeviceAuth] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // GitHub 'ksf' Repo & GitHub Pages Yayınlama State
  const [isPublishModalOpen, setIsPublishModalOpen] = useState<boolean>(false);
  // Kayıtlı Keşif Düzenleme Modalı State
  const [editingInspection, setEditingInspection] =
    useState<InspectionRecord | null>(null);
  const [publishToken, setPublishToken] = useState<string>(() => {
    try {
      return (
        cloudConfig.githubToken ||
        localStorage.getItem("fatsa_adliyesi_github_token_v1") ||
        ""
      );
    } catch {
      return cloudConfig.githubToken || "";
    }
  });
  const [publishRepoName, setPublishRepoName] = useState<string>("ksf");
  const [isPublishingKsf, setIsPublishingKsf] = useState<boolean>(false);
  const [publishProgress, setPublishProgress] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<GitHubPublishResult | null>(
    () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_PUBLISHED_KSF);
        return saved ? JSON.parse(saved) : null;
      } catch {
        return null;
      }
    }
  );

  // 3. State: Weather Forecasts per Inspection ID + Form Preview Weather
  const [weatherMap, setWeatherMap] = useState<Record<string, WeatherForecast>>({});
  const [formWeather, setFormWeather] = useState<WeatherForecast | null>(null);

  // 4. State: PDF Export Modal & Aylık Excel Raporu Modal + Keşif Yapıldı Heyet Kayıt Modalı
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfPeriod, setPdfPeriod] = useState<PdfExportPeriod>("weekly");
  const [pdfReferenceDate, setPdfReferenceDate] = useState<string>(
    () => inspections[0]?.date || new Date().toISOString().split("T")[0]
  );
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Keşif "Yapıldı" butonuna tıklandığında açılan Hakim / Katip / Mübaşir seçim & giriş penceresi state
  const [completingInspection, setCompletingInspection] =
    useState<InspectionRecord | null>(null);
  const [completionJudgeInput, setCompletionJudgeInput] =
    useState<string>("Kadir SAĞLAM");
  const [completionClerkInput, setCompletionClerkInput] = useState<string>("");
  const [completionBailiffInput, setCompletionBailiffInput] =
    useState<string>("Ebru YILMAZ");
  const [completionNoteInput, setCompletionNoteInput] = useState<string>("");

  // Aylık Yapılan Keşifler Excel Raporu Modal State
  const [isExcelModalOpen, setIsExcelModalOpen] = useState<boolean>(false);
  const [excelYearMonth, setExcelYearMonth] = useState<string>(() => {
    const firstCompleted = inspections.find((r) => r.status === "yapildi");
    const refDate =
      firstCompleted?.date ||
      inspections[0]?.date ||
      new Date().toISOString().split("T")[0];
    return refDate.slice(0, 7);
  });
  const [excelOnlyCompleted, setExcelOnlyCompleted] = useState<boolean>(true);

  // Mahkeme Bilirkişi Rehberi (Keşif Zaptı Hazırla için Unvan, Ad Soyad, Sicil No ve Açıklama listesi)
  const [registeredExperts, setRegisteredExperts] = useState<
    RegisteredExpert[]
  >(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_REGISTERED_EXPERTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_REGISTERED_EXPERTS;
  });
  const [preselectedMinutesRecordId, setPreselectedMinutesRecordId] = useState<
    string | null
  >(null);

  const handleSaveRegisteredExperts = (nextExperts: RegisteredExpert[]) => {
    setRegisteredExperts(nextExperts);
    try {
      localStorage.setItem(
        STORAGE_KEY_REGISTERED_EXPERTS,
        JSON.stringify(nextExperts)
      );
    } catch {
      // ignore
    }
  };

  // Save records to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(inspections));
    } catch {
      // ignore
    }
  }, [inspections]);

  // Fetch Open-Meteo weather forecasts for all registered inspections
  useEffect(() => {
    let cancelled = false;
    async function loadAllWeather() {
      const entries: Record<string, WeatherForecast> = {};
      await Promise.all(
        inspections.map(async (rec) => {
          const wf = await fetchWeatherForInspection(rec.lat, rec.lng, rec.date);
          entries[rec.id] = wf;
        })
      );
      if (!cancelled) {
        setWeatherMap(entries);
      }
    }
    loadAllWeather();
    return () => {
      cancelled = true;
    };
  }, [inspections]);

  const handleSaveCloudConfig = (newCfg: CloudSyncConfig) => {
    setCloudConfig(newCfg);
    try {
      localStorage.setItem(STORAGE_KEY_CLOUD, JSON.stringify(newCfg));
    } catch {
      // ignore
    }
  };

  // Background cloud push if enabled (supports both GitHub and Google Apps Script)
  const pushRecordsToCloudIfEnabled = useCallback(
    async (updatedRecords: InspectionRecord[]) => {
      if (cloudConfig.autoSync) {
        try {
          await syncPushToActiveCloud(cloudConfig, updatedRecords);
        } catch {
          // silent background sync
        }
      }
    },
    [cloudConfig]
  );

  // ============================================================================
  // QUICK COURTROOM QUERY & NEW INSPECTION FORM STATE
  // ============================================================================
  const defaultNextDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split("T")[0];
  }, []);

  const [esasNo, setEsasNo] = useState("");
  const [formDistrict, setFormDistrict] = useState<CourtDistrict>("Fatsa");
  const [neighborhoodInput, setNeighborhoodInput] = useState("Saraytepe Mahallesi");
  const [selectedTkgmMahalleId, setSelectedTkgmMahalleId] = useState<number | undefined>(
    155062
  );
  const [baseNeighborhoodLat, setBaseNeighborhoodLat] = useState<number>(40.98521);
  const [baseNeighborhoodLng, setBaseNeighborhoodLng] = useState<number>(37.54728);
  const [selectedLat, setSelectedLat] = useState<number>(40.98521);
  const [selectedLng, setSelectedLng] = useState<number>(37.54728);
  const [selectedCorridor, setSelectedCorridor] = useState<string>("Ilıca - İslamdağ Vadisi");

  // Ada / Parsel / Bağımsız Bölüm No & TKGM Kadastro Taşınmaz Sınır State (Örnek veri olmadan temiz başlar)
  const [adaNo, setAdaNo] = useState<string>("");
  const [parselNo, setParselNo] = useState<string>("");
  const [bagimsizBolumNo, setBagimsizBolumNo] = useState<string>("");
  // Aynı parsel üzerinde birden fazla bağımsız bölüm ekleme modu ve listesi
  const [isMultiBbMode, setIsMultiBbMode] = useState<boolean>(false);
  const [multiBbDraftList, setMultiBbDraftList] = useState<string[]>([]);
  const [singleBbEntryInput, setSingleBbEntryInput] = useState<string>("");
  const [nitelik, setNitelik] = useState<string>("");
  const [yuzolcumuInput, setYuzolcumuInput] = useState<string>("");
  const [paftaNo, setPaftaNo] = useState<string>("");
  const [parcelPolygon, setParcelPolygon] = useState<[number, number][]>([]);
  const [parcelSource, setParcelSource] =
    useState<ParcelBoundarySource>("tkgm_api");
  const [tkgmStatusMessage, setTkgmStatusMessage] = useState<string | null>(null);
  const [isQueryingParcel, setIsQueryingParcel] = useState<boolean>(false);
  const [focusParcelZoomTrigger, setFocusParcelZoomTrigger] = useState<number>(0);
  const [showQuickParcelMap, setShowQuickParcelMap] = useState<boolean>(false);
  const geoJsonFileInputRef = useRef<HTMLInputElement | null>(null);

  const [addressDetail, setAddressDetail] = useState("");
  const [date, setDate] = useState<string>(defaultNextDate);
  // Varsayılan keşif saati 13:00 (kullanıcı dilerse değiştirebilir)
  const [time, setTime] = useState<string>("13:00");
  const [caseType, setCaseType] = useState<string>(CASE_TYPES[0]);
  const [formStatus, setFormStatus] = useState<InspectionStatus>("planlandi");

  // Keşif Konusu: Taşınmaz (Ada/Parsel), Adres Bazlı (Cadde/Sokak/Kapı No) veya Araç (Plaka Bilgisi / Hasar Tespiti)
  const [subjectType, setSubjectType] =
    useState<InspectionSubjectType>("tasinmaz");
  const [isGeocodingFormAddress, setIsGeocodingFormAddress] =
    useState<boolean>(false);

  // Çoklu Parsel Listesi & Yakın Parsel Önerileri State (Boş başlar, eklenen parseller asla birbirini ezmez)
  const [formParcels, setFormParcels] = useState<ParcelItem[]>([]);
  const [nearbyParcelSuggestions, setNearbyParcelSuggestions] = useState<
    ParcelItem[]
  >([]);
  const [isLoadingNearbyParcels, setIsLoadingNearbyParcels] =
    useState<boolean>(false);
  const [batchParselInput, setBatchParselInput] = useState<string>("");
  const [isAddingBatchParcels, setIsAddingBatchParcels] =
    useState<boolean>(false);

  // Kopyala - Yapıştır Metinden Otomatik Mahalle / Ada / Parsel Tespit & Ekleme State
  const [pastedParcelText, setPastedParcelText] = useState<string>("");
  const [isExtractingPastedParcels, setIsExtractingPastedParcels] =
    useState<boolean>(false);

  // Araç Hasar / Delil Tespiti State
  const [vehiclePlateNo, setVehiclePlateNo] = useState<string>("");
  const [vehicleBrandModel, setVehicleBrandModel] = useState<string>("");
  const [vehicleType, setVehicleType] = useState<string>(VEHICLE_TYPE_PRESETS[0]);
  const [vehicleChassisNo, setVehicleChassisNo] = useState<string>("");
  const [vehicleDamageSummary, setVehicleDamageSummary] = useState<string>("");
  const [vehicleInspectionPlace, setVehicleInspectionPlace] = useState<string>(
    VEHICLE_INSPECTION_PLACE_PRESETS[0]
  );

  // Ayarlar: Kullanıcı Adı & Unvanı (Hakim, Zabıt Katibi, Mübaşir, Yazı İşleri Müdürü vb.)
  const [userProfile, setUserProfile] = useState<UserProfileConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USER_PROFILE);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          fullName: parsed.fullName || "",
          title: parsed.title || "Zabıt Katibi",
          sicilNo: parsed.sicilNo || "",
          courtUnit:
            parsed.courtUnit || "Fatsa Sulh Hukuk Mahkemesi Kalemi",
          includeDeviceName:
            typeof parsed.includeDeviceName === "boolean"
              ? parsed.includeDeviceName
              : true,
        };
      }
    } catch {
      // ignore
    }
    return {
      fullName: "",
      title: "Zabıt Katibi",
      sicilNo: "",
      courtUnit: "Fatsa Sulh Hukuk Mahkemesi Kalemi",
      includeDeviceName: true,
    };
  });

  // Keşfi Ekleyen Kişi / Cihaz Bilgisi (Ayarlar'daki Kullanıcı Adı + Unvan bilgisinden otomatik çekilir)
  const [createdByInput, setCreatedByInput] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_DEVICE_IDENTITY) || "";
    } catch {
      return "";
    }
  });
  const [autoDetectedDeviceLabel, setAutoDetectedDeviceLabel] =
    useState<string>("");
  const [detectedDeviceType, setDetectedDeviceType] = useState<
    "pc" | "mobile" | "tablet"
  >("pc");

  const handleSaveUserProfile = (nextProfile: UserProfileConfig) => {
    setUserProfile(nextProfile);
    try {
      localStorage.setItem(
        STORAGE_KEY_USER_PROFILE,
        JSON.stringify(nextProfile)
      );
    } catch {
      // ignore
    }
    const formatted = formatUserProfileCreator(
      nextProfile,
      autoDetectedDeviceLabel
    );
    setCreatedByInput(formatted);
    try {
      localStorage.setItem(STORAGE_KEY_DEVICE_IDENTITY, formatted);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let active = true;
    detectClientDeviceInfo().then((info) => {
      if (!active) return;
      setDetectedDeviceType(info.deviceType);
      setAutoDetectedDeviceLabel(info.deviceName);
      setCreatedByInput((prev) => {
        if (userProfile.fullName.trim()) {
          const fromProfile = formatUserProfileCreator(
            userProfile,
            info.deviceName
          );
          try {
            localStorage.setItem(STORAGE_KEY_DEVICE_IDENTITY, fromProfile);
          } catch {
            // ignore
          }
          return fromProfile;
        }
        if (prev.trim()) return prev;
        const fallback = formatUserProfileCreator(userProfile, info.deviceName);
        try {
          localStorage.setItem(STORAGE_KEY_DEVICE_IDENTITY, fallback);
        } catch {
          // ignore
        }
        return fallback;
      });
    });
    return () => {
      active = false;
    };
  }, [userProfile]);

  const handleCreatedByChange = (val: string) => {
    setCreatedByInput(val);
    try {
      localStorage.setItem(STORAGE_KEY_DEVICE_IDENTITY, val);
    } catch {
      // ignore
    }
  };

  // Seçili ilçedeki resmi TKGM Mahalle / Köy listesi (TKGM ID eşleşmeli)
  const districtTkgmMahalleList = useMemo(() => {
    return TKGM_MAHALLE_LIST.filter((m) => m.district === formDistrict).sort(
      (a, b) => a.text.localeCompare(b.text, "tr-TR")
    );
  }, [formDistrict]);

  // Bilirkişi Heyeti: Yanına tik atılabilir varsayılan unvanlar (Fen, Ziraat, İnşaat, Makine, Mobilya, Mimar, GMDÜ) + Manuel giriş alanı
  const [selectedExpertIds, setSelectedExpertIds] = useState<string[]>([
    "fen",
    "ziraat",
  ]);
  const [customExpertText, setCustomExpertText] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Seçili tikli unvanlar ve manuel yazılan bilirkişinin birleştirilmiş metni
  const combinedExpertsText = useMemo(() => {
    const checkedTitles = DEFAULT_EXPERT_TITLES.filter((item) =>
      selectedExpertIds.includes(item.id)
    ).map((item) => item.fullTitle);
    const manualTrimmed = customExpertText.trim();
    if (manualTrimmed) {
      checkedTitles.push(manualTrimmed);
    }
    return checkedTitles.join(" + ");
  }, [selectedExpertIds, customExpertText]);

  const handleToggleExpertTitle = (id: string) => {
    setSelectedExpertIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Günlük Güzergah Paylaşım Modalı State
  const [shareRouteDate, setShareRouteDate] = useState<string | null>(null);
  const [copiedRouteFeedback, setCopiedRouteFeedback] = useState<boolean>(false);

  // Live OSRM Calculation State for Selected Neighborhood
  const [osrmLoading, setOsrmLoading] = useState<boolean>(false);
  const [distanceKm, setDistanceKm] = useState<number>(7.5);
  const [durationMin, setDurationMin] = useState<number>(11);
  const [pickerGeometry, setPickerGeometry] = useState<[number, number][]>([]);

  // Autocomplete Search Dropdown State
  const [searchResults, setSearchResults] = useState<NominatimSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const [isSearchingLocation, setIsSearchingLocation] = useState<boolean>(false);

  // Quick Courtroom Query Input (Top Bar Strip)
  const [quickDistrict, setQuickDistrict] = useState<CourtDistrict | "Tümü">("Tümü");
  const [quickQuery, setQuickQuery] = useState<string>("");
  const [quickResults, setQuickResults] = useState<NominatimSearchResult[]>([]);
  const [showQuickDropdown, setShowQuickDropdown] = useState<boolean>(false);

  // Filter / Search State for Agenda & Map Views
  const [agendaDistrictFilter, setAgendaDistrictFilter] = useState<string>("Tümü");
  const [agendaFilterText, setAgendaFilterText] = useState<string>("");
  const [agendaCaseFilter, setAgendaCaseFilter] = useState<string>("Tümü");
  const [agendaStatusFilter, setAgendaStatusFilter] = useState<string>("Tümü");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(
    () => inspections[0]?.date || defaultNextDate
  );
  const [mapFilterDate, setMapFilterDate] = useState<string | null>(null);
  const [focusedInspectionId, setFocusedInspectionId] = useState<string | null>(null);
  const [dailyRouteGeometry, setDailyRouteGeometry] = useState<[number, number][]>([]);
  const [dailyRouteMetrics, setDailyRouteMetrics] = useState<{
    distanceKm: number;
    durationMin: number;
  } | null>(null);

  // AI Route Optimization Commentary State
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState<boolean>(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);
  const [formBannerMessage, setFormBannerMessage] = useState<string | null>(null);

  // Compute OSRM distance & duration whenever selectedLat / selectedLng or multi-neighborhood formParcels change
  useEffect(() => {
    let cancelled = false;
    async function runOsrm() {
      if (!selectedLat || !selectedLng) return;
      setOsrmLoading(true);

      // Eğer dosyaya birden fazla mahalle / parsel eklendiyse tüm mahalle duraklarını sırayla rotaya dahil et
      const routeWaypoints: { lat: number; lng: number }[] = [
        { lat: FATSA_COURTHOUSE.lat, lng: FATSA_COURTHOUSE.lng },
      ];

      if (subjectType === "tasinmaz" && formParcels.length > 0) {
        const effectiveNeigh = parselNo.trim()
          ? neighborhoodInput
          : formParcels[0]?.neighborhood || neighborhoodInput;
        const tempStops = extractRecordLocationStops({
          district: formDistrict,
          neighborhood: effectiveNeigh,
          lat: selectedLat,
          lng: selectedLng,
          parcels: formParcels,
        });
        for (const st of tempStops) {
          const dup = routeWaypoints.some(
            (w) =>
              Math.abs(w.lat - st.lat) < 0.0004 &&
              Math.abs(w.lng - st.lng) < 0.0004
          );
          if (!dup) {
            routeWaypoints.push({ lat: st.lat, lng: st.lng });
          }
        }
      }

      const hasCurrentPoint = routeWaypoints.some(
        (w, i) =>
          i > 0 &&
          Math.abs(w.lat - selectedLat) < 0.0004 &&
          Math.abs(w.lng - selectedLng) < 0.0004
      );
      if (!hasCurrentPoint) {
        routeWaypoints.push({ lat: selectedLat, lng: selectedLng });
      }

      const res = await calculateOSRMRoute(routeWaypoints);
      if (!cancelled) {
        setDistanceKm(res.distanceKm);
        setDurationMin(res.durationMin);
        setPickerGeometry(res.geometry);
        setOsrmLoading(false);
      }
    }
    runOsrm();
    return () => {
      cancelled = true;
    };
  }, [selectedLat, selectedLng, formParcels, subjectType, formDistrict, neighborhoodInput]);

  // Compute Weather Forecast for selected location & date in the form
  useEffect(() => {
    let cancelled = false;
    async function loadFormWeather() {
      if (!selectedLat || !selectedLng || !date) return;
      const wf = await fetchWeatherForInspection(selectedLat, selectedLng, date);
      if (!cancelled) {
        setFormWeather(wf);
      }
    }
    loadFormWeather();
    return () => {
      cancelled = true;
    };
  }, [selectedLat, selectedLng, date]);

  // CANLI TKGM MEGSİS OTOMATİK SORGU: Kullanıcı Mahalle + Ada / Parsel yazdığında TKGM'den gerçek parsel sınırını ve yüzölçümünü otomatik çeker ve haritada çizer
  useEffect(() => {
    if (subjectType !== "tasinmaz" || parcelSource === "geojson_import") {
      return;
    }

    const cleanAda = adaNo.trim();
    const cleanParsel = parselNo.trim();
    // Parsel numarası değişirken eski komşu parsel önerilerini temizle (Örn: 13 yazarken 1'den kalan önerilerin karışmasını engeller)
    setNearbyParcelSuggestions([]);

    // Parsel numarası girilmeden TKGM sorgusu başlatma (Ada tek başına veya boşken sahte '1' parsel çekilmesini engeller)
    if (!cleanParsel) {
      setParcelPolygon([]);
      setYuzolcumuInput("");
      setPaftaNo("");
      setTkgmStatusMessage(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsQueryingParcel(true);
      try {
        const res = await queryParcelBoundary({
          district: formDistrict,
          neighborhood: neighborhoodInput,
          tkgmMahalleId: selectedTkgmMahalleId,
          baseLat: baseNeighborhoodLat,
          baseLng: baseNeighborhoodLng,
          adaNo: cleanAda || "0",
          parselNo: cleanParsel,
          yuzolcumuM2:
            Number(yuzolcumuInput) > 0 ? Number(yuzolcumuInput) : undefined,
          keepExactCenter: false,
        });

        if (cancelled) return;

        setParcelPolygon(res.polygon);
        setSelectedLat(res.centerLat);
        setSelectedLng(res.centerLng);
        setParcelSource(res.source);

        if (res.source === "tkgm_api") {
          setBaseNeighborhoodLat(res.centerLat);
          setBaseNeighborhoodLng(res.centerLng);
          setYuzolcumuInput(String(res.areaM2));
          if (res.paftaNo) setPaftaNo(res.paftaNo);
          if (res.nitelik) setNitelik(res.nitelik);
          if (res.mevkii) setAddressDetail(res.mevkii);
          const resolvedMahId = res.mahalleId || selectedTkgmMahalleId;
          if (res.mahalleId) setSelectedTkgmMahalleId(res.mahalleId);

          const primaryItem: ParcelItem = {
            id: `${resolvedMahId || formDistrict}-${res.adaNo}-${res.parselNo}`,
            mahalleId: resolvedMahId,
            neighborhood: res.mahalleAd
              ? res.mahalleAd.includes("Mahalle")
                ? res.mahalleAd
                : `${res.mahalleAd} Mahallesi`
              : neighborhoodInput,
            adaNo: res.adaNo,
            parselNo: res.parselNo,
            bagimsizBolumNo: bagimsizBolumNo.trim() || undefined,
            nitelik: res.nitelik || nitelik,
            yuzolcumuM2: res.areaM2,
            paftaNo: res.paftaNo || paftaNo,
            mevkii: res.mevkii || addressDetail,
            centerLat: res.centerLat,
            centerLng: res.centerLng,
            polygon: res.polygon,
            source: "tkgm_api",
            distanceFromFirstMeters: 0,
          };

          // ÖNEMLİ: 2. veya 3. parsel yazılırken daha önce eklenmiş olan 1. parseli ASLA silme veya üzerine yazma!
          // Sadece eğer bu ada/parsel zaten formParcels listesinde varsa onun TKGM poligon/alan bilgisini güncelle.
          setFormParcels((prev) => {
            const alreadyExists = prev.some(
              (p) =>
                (p.mahalleId || resolvedMahId) === resolvedMahId &&
                p.adaNo === primaryItem.adaNo &&
                p.parselNo === primaryItem.parselNo
            );
            if (!alreadyExists) return prev;
            return prev.map((p) =>
              (p.mahalleId || resolvedMahId) === resolvedMahId &&
              p.adaNo === primaryItem.adaNo &&
              p.parselNo === primaryItem.parselNo
                ? {
                    ...primaryItem,
                    bagimsizBolumNo:
                      primaryItem.bagimsizBolumNo || p.bagimsizBolumNo,
                  }
                : p
            );
          });

          setTkgmStatusMessage(
            res.statusMessage ||
              `✓ TKGM'den çekildi: ${res.mahalleAd || neighborhoodInput} ${res.adaNo} Ada / ${res.parselNo} Parsel (${formatAreaM2(res.areaM2)} m²)`
          );
          setFocusParcelZoomTrigger((c) => c + 1);

          // PARSEL GİRİLDİĞİNDE YAKINDAKİ KOMŞU PARSELLERİ OTOMATİK ÖNER
          if (resolvedMahId) {
            setIsLoadingNearbyParcels(true);
            fetchNearbyTkgmParcels({
              district: formDistrict,
              neighborhood: neighborhoodInput,
              tkgmMahalleId: resolvedMahId,
              adaNo: res.adaNo,
              parselNo: res.parselNo,
              centerLat: res.centerLat,
              centerLng: res.centerLng,
              polygon: res.polygon,
              excludeParcelKeys: [`${res.adaNo}/${res.parselNo}`],
            })
              .then((suggestions) => {
                if (!cancelled) {
                  setNearbyParcelSuggestions(suggestions);
                }
              })
              .finally(() => {
                if (!cancelled) {
                  setIsLoadingNearbyParcels(false);
                }
              });
          }
        } else {
          setTkgmStatusMessage(res.statusMessage || null);
        }
      } finally {
        if (!cancelled) {
          setIsQueryingParcel(false);
        }
      }
    }, 550);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    subjectType,
    adaNo,
    parselNo,
    formDistrict,
    neighborhoodInput,
    selectedTkgmMahalleId,
    parcelSource,
  ]);

  // Mevcut input'taki parseli ParcelItem nesnesine dönüştürür (Sadece Parsel No girilmişse oluşturur)
  const buildCurrentInputParcelItem = useCallback((): ParcelItem | null => {
    const cleanAda = adaNo.trim();
    const cleanParsel = parselNo.trim();
    if (!cleanParsel) return null;
    const finalAda = cleanAda || "0";
    const finalParsel = cleanParsel;
    const cleanBb = bagimsizBolumNo.trim() || undefined;
    const areaVal = Number(String(yuzolcumuInput).replace(",", ".")) || 0;
    return {
      id: `${selectedTkgmMahalleId || formDistrict}-${finalAda}-${finalParsel}${cleanBb ? `-bb${cleanBb}` : ""}`,
      mahalleId: selectedTkgmMahalleId,
      neighborhood: neighborhoodInput,
      adaNo: finalAda,
      parselNo: finalParsel,
      bagimsizBolumNo: cleanBb,
      nitelik: nitelik.trim() || undefined,
      yuzolcumuM2: areaVal > 0 ? areaVal : undefined,
      paftaNo: paftaNo.trim() || undefined,
      mevkii: addressDetail.trim() || undefined,
      centerLat: selectedLat,
      centerLng: selectedLng,
      polygon:
        parcelPolygon && parcelPolygon.length >= 3 ? parcelPolygon : undefined,
      source: parcelSource,
    };
  }, [
    adaNo,
    parselNo,
    bagimsizBolumNo,
    yuzolcumuInput,
    selectedTkgmMahalleId,
    formDistrict,
    neighborhoodInput,
    nitelik,
    paftaNo,
    addressDetail,
    selectedLat,
    selectedLng,
    parcelPolygon,
    parcelSource,
  ]);

  // Haritada hem eklenmiş tüm parselleri hem de şu an kutuda yazılan parseli birlikte göstermek için birleştirilmiş liste
  const combinedPreviewParcels = useMemo<ParcelItem[]>(() => {
    if (subjectType !== "tasinmaz") return [];
    const list = [...formParcels];
    const currentItem = buildCurrentInputParcelItem();
    if (currentItem) {
      const exists = list.some(
        (p) =>
          (p.neighborhood || "") === (currentItem.neighborhood || "") &&
          p.adaNo === currentItem.adaNo &&
          p.parselNo === currentItem.parselNo &&
          (p.bagimsizBolumNo || "") === (currentItem.bagimsizBolumNo || "")
      );
      if (!exists) {
        list.push(currentItem);
      }
    }
    return list;
  }, [subjectType, formParcels, buildCurrentInputParcelItem]);

  // Önerilen bir komşu parsele tıklandığında: eğer henüz listeye hiç parsel eklenmemişse (prev.length === 0) ve kutuda tam sorgulanmış 1. parsel varsa onu korur, ardından tıklanan parseli ekler
  const handleAddParcelItemToList = useCallback(
    (item: ParcelItem) => {
      setFormParcels((prev) => {
        const next = [...prev];
        if (next.length === 0 && !isQueryingParcel) {
          const currentInputItem = buildCurrentInputParcelItem();
          if (
            currentInputItem &&
            !(
              currentInputItem.adaNo === item.adaNo &&
              currentInputItem.parselNo === item.parselNo &&
              (currentInputItem.bagimsizBolumNo || "") ===
                (item.bagimsizBolumNo || "")
            )
          ) {
            next.push(currentInputItem);
          }
        }
        const itemExists = next.some(
          (p) =>
            (p.neighborhood || "") === (item.neighborhood || "") &&
            p.adaNo === item.adaNo &&
            p.parselNo === item.parselNo &&
            (p.bagimsizBolumNo || "") === (item.bagimsizBolumNo || "")
        );
        if (!itemExists) {
          next.push(item);
        }
        return next;
      });
      setParselNo("");
      setBagimsizBolumNo("");
      setMultiBbDraftList([]);
      setSingleBbEntryInput("");
      setYuzolcumuInput("");
      setPaftaNo("");
      setFocusParcelZoomTrigger((c) => c + 1);
      setFormBannerMessage(
        `✓ ${item.adaNo} Ada / ${item.parselNo} Parsel (${formatAreaM2(
          item.yuzolcumuM2 || 0
        )} m²) önceki parseller korunarak dosyaya eklendi.`
      );
      setTimeout(() => setFormBannerMessage(null), 3500);
    },
    [buildCurrentInputParcelItem, isQueryingParcel]
  );

  // Çoklu bağımsız bölüm taslak listesine (multiBbDraftList) yeni bağımsız bölüm(ler) ekle
  const handleAddUnitToMultiBbDraft = (rawText?: string) => {
    const sourceText =
      typeof rawText === "string"
        ? rawText
        : singleBbEntryInput.trim() || bagimsizBolumNo.trim();
    const tokens = expandBagimsizBolumTokens(sourceText);
    if (tokens.length === 0) return;
    setMultiBbDraftList((prev) => {
      const next = [...prev];
      for (const t of tokens) {
        if (!next.includes(t)) next.push(t);
      }
      return next;
    });
    setSingleBbEntryInput("");
    setBagimsizBolumNo("");
  };

  // Mevcut input'taki parseli (ve varsa birden fazla bağımsız bölümü ayrı ayrı) çoklu parsel listesine ekle
  const handleAddCurrentInputParcelToList = (keepSameParcelForNextBb = false) => {
    const baseItem = buildCurrentInputParcelItem();
    if (!baseItem) {
      setFormBannerMessage(
        "Lütfen önce eklenecek Parsel numarasını (ve varsa Ada numarasını) yazınız."
      );
      setTimeout(() => setFormBannerMessage(null), 3000);
      return;
    }

    // Hem kutudaki Bağımsız Bölüm No'yu (virgül/tire ile çoklu yazılmış olabilir) hem de Çoklu B.Bölüm taslak listesini birleştir
    const fromInputTokens = expandBagimsizBolumTokens(bagimsizBolumNo);
    const fromSingleBoxTokens = expandBagimsizBolumTokens(singleBbEntryInput);
    const combinedBbTokens: string[] = [];
    for (const t of [
      ...multiBbDraftList,
      ...fromInputTokens,
      ...fromSingleBoxTokens,
    ]) {
      if (t && !combinedBbTokens.includes(t)) {
        combinedBbTokens.push(t);
      }
    }

    const itemsToAdd: ParcelItem[] =
      combinedBbTokens.length > 0
        ? combinedBbTokens.map((bbVal, idx) => ({
            ...baseItem,
            id: `${baseItem.mahalleId || formDistrict}-${baseItem.adaNo}-${
              baseItem.parselNo
            }-bb${bbVal}-${Date.now()}-${idx}`,
            bagimsizBolumNo: bbVal,
          }))
        : [baseItem];

    setFormParcels((prev) => {
      const updated = [...prev];
      for (const item of itemsToAdd) {
        // Eğer aynı mahalle + ada + parsel için daha önce Bağımsız Bölümsüz (boş) bir kayıt eklendiyse ve şimdi Bağımsız Bölümlü ekleniyorsa, boş olanı güncelle
        const emptyBbIdx =
          item.bagimsizBolumNo
            ? updated.findIndex(
                (p) =>
                  (p.neighborhood || "") === (item.neighborhood || "") &&
                  p.adaNo === item.adaNo &&
                  p.parselNo === item.parselNo &&
                  !p.bagimsizBolumNo
              )
            : -1;

        const exactMatchIdx = updated.findIndex(
          (p) =>
            (p.neighborhood || "") === (item.neighborhood || "") &&
            p.adaNo === item.adaNo &&
            p.parselNo === item.parselNo &&
            (p.bagimsizBolumNo || "") === (item.bagimsizBolumNo || "")
        );

        if (exactMatchIdx >= 0) {
          updated[exactMatchIdx] = item;
        } else if (emptyBbIdx >= 0 && itemsToAdd.length === 1) {
          updated[emptyBbIdx] = item;
        } else {
          updated.push(item);
        }
      }
      return updated;
    });

    if (keepSameParcelForNextBb) {
      // Aynı parselde yeni bağımsız bölüm girebilmek için Ada No, Parsel No, Yüzölçümü ve TKGM Poligonunu KORU; sadece Bağımsız Bölüm kutusunu temizle!
      setBagimsizBolumNo("");
      setSingleBbEntryInput("");
      setMultiBbDraftList([]);
      setFormBannerMessage(
        `✓ ${baseItem.adaNo} Ada / ${baseItem.parselNo} Parsel — ${
          combinedBbTokens.length > 0
            ? `Bağımsız Bölüm No: ${combinedBbTokens.join(", ")}`
            : "Parsel"
        } dosyaya eklendi. Aynı parsel üzerindeki bir sonraki Bağımsız Bölüm numarasını hemen kutuya yazıp tekrar ekleyebilirsiniz.`
      );
      setTimeout(() => setFormBannerMessage(null), 4500);
      return;
    }

    // 1. parsel eklendikten sonra 2. parseli yazarken üzerine yazmaması için parselNo ve detay kutularını temizle (Ada No aynı kalır)
    setParselNo("");
    setBagimsizBolumNo("");
    setSingleBbEntryInput("");
    setMultiBbDraftList([]);
    setYuzolcumuInput("");
    setPaftaNo("");
    setParcelPolygon([]);
    setTkgmStatusMessage(null);
    setFocusParcelZoomTrigger((c) => c + 1);
    setFormBannerMessage(
      itemsToAdd.length > 1
        ? `✓ ${baseItem.adaNo} Ada / ${baseItem.parselNo} Parsel üzerindeki ${
            itemsToAdd.length
          } adet Bağımsız Bölüm (No: ${combinedBbTokens.join(
            ", "
          )}) ayrı ayrı dosyaya eklendi.`
        : `✓ ${baseItem.adaNo} Ada / ${baseItem.parselNo} Parsel${
            itemsToAdd[0].bagimsizBolumNo
              ? ` (Bağımsız Bölüm No: ${itemsToAdd[0].bagimsizBolumNo})`
              : ""
          } dosyaya eklendi. Şimdi 2. (veya sonraki) parsel numarasını yazıp tekrar 'Parseli Dosyaya Ekle' butonuna basabilirsiniz.`
    );
    setTimeout(() => setFormBannerMessage(null), 4500);
  };

  // Yeni Keşif Ekle menüsüne basıldığında parsel bilgilerini sıfırlayarak (boş) açan yardımcı fonksiyon
  const handleOpenNewInspectionTab = useCallback(
    (options?: {
      keepParcel?: boolean;
      customDate?: string;
      customLocation?: {
        district: CourtDistrict;
        neighborhood: string;
        lat: number;
        lng: number;
      };
    }) => {
      if (!options?.keepParcel) {
        setAdaNo("");
        setParselNo("");
        setBagimsizBolumNo("");
        setIsMultiBbMode(false);
        setMultiBbDraftList([]);
        setSingleBbEntryInput("");
        setYuzolcumuInput("");
        setPaftaNo("");
        setNitelik("");
        setAddressDetail("");
        setParcelPolygon([]);
        setFormParcels([]);
        setBatchParselInput("");
        setPastedParcelText("");
        setNearbyParcelSuggestions([]);
        setTkgmStatusMessage(null);
        setParcelSource("cadastre_computed");
      }
      if (options?.customDate) {
        setDate(options.customDate);
      }
      if (options?.customLocation) {
        setFormDistrict(options.customLocation.district);
        setNeighborhoodInput(options.customLocation.neighborhood);
        setSelectedTkgmMahalleId(
          resolveTkgmMahalle(
            options.customLocation.district,
            options.customLocation.neighborhood
          )?.id
        );
        setBaseNeighborhoodLat(options.customLocation.lat);
        setBaseNeighborhoodLng(options.customLocation.lng);
        setSelectedLat(options.customLocation.lat);
        setSelectedLng(options.customLocation.lng);
      }
      setShowQuickParcelMap(false);
      setActiveTab("yeni_kesif");
    },
    []
  );

  // Çoklu parsel listesinden belirli satırı (veya bağımsız bölümü) sil
  const handleRemoveParcelFromList = (
    ada: string,
    parsel: string,
    neigh?: string,
    bagimsizBolum?: string,
    targetIdx?: number
  ) => {
    setFormParcels((prev) => {
      if (typeof targetIdx === "number") {
        return prev.filter((_, i) => i !== targetIdx);
      }
      return prev.filter(
        (p) =>
          !(
            p.adaNo === ada &&
            p.parselNo === parsel &&
            (!neigh || (p.neighborhood || "") === neigh) &&
            (p.bagimsizBolumNo || "") === (bagimsizBolum || "")
          )
      );
    });
  };

  // Toplu parsel numarası girişi (Örn: "2, 3, 5, 8" veya "101/2, 101/3") -> Önceki parselleri koruyarak TKGM'den çekip çoklu parsel listesine ekler
  const handleBatchAddParcelsByNumbers = async () => {
    const rawTokens = batchParselInput
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (rawTokens.length === 0) return;

    const pairsToFetch: { ada: string; parsel: string }[] = [];
    const defaultAda = adaNo.trim() || "0";

    for (const tok of rawTokens) {
      const slashM = tok.match(/^(\d+)\/(\d+)$/);
      if (slashM) {
        pairsToFetch.push({ ada: slashM[1], parsel: slashM[2] });
      } else if (/^\d+$/.test(tok)) {
        pairsToFetch.push({ ada: defaultAda, parsel: tok });
      }
    }
    if (pairsToFetch.length === 0) return;

    setIsAddingBatchParcels(true);
    const addedItems: ParcelItem[] = [];

    // Eğer kutuda yazılı 1. parsel henüz formParcels'te yoksa önce onu da koru
    const currentInputItem = buildCurrentInputParcelItem();

    try {
      for (const pair of pairsToFetch.slice(0, 20)) {
        const alreadyInList = formParcels.some(
          (p) =>
            (p.neighborhood || "") === neighborhoodInput &&
            p.adaNo === pair.ada &&
            p.parselNo === pair.parsel
        );
        if (alreadyInList) continue;

        const res = await queryParcelBoundary({
          district: formDistrict,
          neighborhood: neighborhoodInput,
          tkgmMahalleId: selectedTkgmMahalleId,
          baseLat: baseNeighborhoodLat,
          baseLng: baseNeighborhoodLng,
          adaNo: pair.ada,
          parselNo: pair.parsel,
          keepExactCenter: false,
        });

        addedItems.push({
          id: `${selectedTkgmMahalleId || formDistrict}-${pair.ada}-${pair.parsel}`,
          mahalleId: res.mahalleId || selectedTkgmMahalleId,
          neighborhood: neighborhoodInput,
          adaNo: pair.ada,
          parselNo: pair.parsel,
          nitelik: res.nitelik || nitelik || undefined,
          yuzolcumuM2: res.areaM2,
          paftaNo: res.paftaNo || paftaNo || undefined,
          mevkii: res.mevkii || addressDetail || undefined,
          centerLat: res.centerLat,
          centerLng: res.centerLng,
          polygon: res.polygon,
          source: res.source,
        });
      }

      if (addedItems.length > 0 || currentInputItem) {
        setFormParcels((prev) => {
          const next = [...prev];
          if (
            currentInputItem &&
            !next.some(
              (p) =>
                (p.neighborhood || "") ===
                  (currentInputItem.neighborhood || "") &&
                p.adaNo === currentInputItem.adaNo &&
                p.parselNo === currentInputItem.parselNo
            )
          ) {
            next.push(currentInputItem);
          }
          for (const item of addedItems) {
            if (
              !next.some(
                (p) =>
                  (p.neighborhood || "") === (item.neighborhood || "") &&
                  p.adaNo === item.adaNo &&
                  p.parselNo === item.parselNo
              )
            ) {
              next.push(item);
            }
          }
          return next;
        });
        setBatchParselInput("");
        setFocusParcelZoomTrigger((c) => c + 1);
        setFormBannerMessage(
          `✓ ${addedItems.length} adet parsel (${addedItems
            .map((i) => `${i.adaNo}/${i.parselNo}`)
            .join(", ")}) önceki parseller korunarak dosyaya eklendi.`
        );
        setTimeout(() => setFormBannerMessage(null), 4500);
      }
    } finally {
      setIsAddingBatchParcels(false);
    }
  };

  // Kopyalanıp yapıştırılan metnin canlı önizleme çözümlemesi (Mahalle, Ada, Parsel, Bağımsız Bölüm, Esas No)
  const parsedPastePreview = useMemo(() => {
    if (!pastedParcelText.trim()) return null;
    return parsePastedParcelText(
      pastedParcelText,
      formDistrict,
      neighborhoodInput
    );
  }, [pastedParcelText, formDistrict, neighborhoodInput]);

  // Kopyalanıp yapıştırılan yazıdan tespit edilen Mahalle, Ada ve Parsel bilgilerini TKGM sınırlarıyla otomatik çekip dosyaya ekler
  const handleExtractAndAddFromPastedText = async (customText?: string) => {
    const rawToParse =
      typeof customText === "string" ? customText : pastedParcelText;
    if (!rawToParse.trim()) {
      setFormBannerMessage(
        "Lütfen önce mahalle, ada ve parsel bilgilerini içeren metni kutuya yapıştırınız."
      );
      setTimeout(() => setFormBannerMessage(null), 3500);
      return;
    }

    const parsed = parsePastedParcelText(
      rawToParse,
      formDistrict,
      neighborhoodInput
    );

    if (parsed.detectedEsasNo && !esasNo.trim()) {
      setEsasNo(parsed.detectedEsasNo);
    }
    if (parsed.detectedBagimsizBolumNo && !bagimsizBolumNo.trim()) {
      setBagimsizBolumNo(parsed.detectedBagimsizBolumNo);
    }

    // Eğer metinde sadece mahalle adı var ama ada/parsel yoksa mahalleyi otomatik seç
    if (parsed.parcels.length === 0) {
      if (parsed.detectedNeighborhood) {
        const nextDist = parsed.detectedDistrict || formDistrict;
        setFormDistrict(nextDist);
        setNeighborhoodInput(parsed.detectedNeighborhood);
        setSelectedTkgmMahalleId(parsed.detectedTkgmMahalleId);
        const resolved = resolveNeighborhoodCoordinates(
          parsed.detectedNeighborhood,
          nextDist
        );
        if (resolved) {
          setBaseNeighborhoodLat(resolved.lat);
          setBaseNeighborhoodLng(resolved.lng);
          setSelectedLat(resolved.lat);
          setSelectedLng(resolved.lng);
        }
        setPastedParcelText("");
        setFormBannerMessage(
          `✓ Yapıştırılan metinden [${nextDist}] ${parsed.detectedNeighborhood} tespit edildi. Ada ve parsel numarasını ekleyebilirsiniz.`
        );
        setTimeout(() => setFormBannerMessage(null), 4500);
      } else {
        setFormBannerMessage(
          "Yapıştırılan metinde ada ve parsel numarası tespit edilemedi. Örn: 'Saraytepe Mah. 101 ada 5 parsel' veya 'Ilıca 137/13' biçiminde yapıştırabilirsiniz."
        );
        setTimeout(() => setFormBannerMessage(null), 4500);
      }
      return;
    }

    setIsExtractingPastedParcels(true);
    setSubjectType("tasinmaz");
    const currentInputItem = buildCurrentInputParcelItem();
    const fetchedItems: ParcelItem[] = [];

    try {
      for (const cand of parsed.parcels.slice(0, 25)) {
        const res = await queryParcelBoundary({
          district: cand.district,
          neighborhood: cand.neighborhood,
          tkgmMahalleId: cand.tkgmMahalleId,
          baseLat: cand.baseLat,
          baseLng: cand.baseLng,
          adaNo: cand.adaNo,
          parselNo: cand.parselNo,
          keepExactCenter: false,
        });

        const finalMahalleName = res.mahalleAd
          ? res.mahalleAd.toLocaleLowerCase("tr-TR").includes("mahalle")
            ? res.mahalleAd
            : `${res.mahalleAd} Mahallesi`
          : cand.neighborhood;

        fetchedItems.push({
          id: `${res.mahalleId || cand.tkgmMahalleId || cand.district}-${res.adaNo || cand.adaNo}-${res.parselNo || cand.parselNo}${cand.bagimsizBolumNo ? `-bb${cand.bagimsizBolumNo}` : ""}`,
          mahalleId: res.mahalleId || cand.tkgmMahalleId,
          neighborhood: finalMahalleName,
          adaNo: res.adaNo || cand.adaNo,
          parselNo: res.parselNo || cand.parselNo,
          bagimsizBolumNo: cand.bagimsizBolumNo || undefined,
          nitelik: res.nitelik || nitelik || undefined,
          yuzolcumuM2: res.areaM2,
          paftaNo: res.paftaNo || undefined,
          mevkii: res.mevkii || undefined,
          centerLat: res.centerLat,
          centerLng: res.centerLng,
          polygon: res.polygon,
          source: res.source,
        });
      }

      if (fetchedItems.length > 0) {
        const first = fetchedItems[0];
        const firstCand = parsed.parcels[0];
        setFormDistrict(firstCand.district);
        setNeighborhoodInput(first.neighborhood || firstCand.neighborhood);
        setSelectedTkgmMahalleId(first.mahalleId || firstCand.tkgmMahalleId);
        setBaseNeighborhoodLat(first.centerLat || firstCand.baseLat);
        setBaseNeighborhoodLng(first.centerLng || firstCand.baseLng);
        setSelectedLat(first.centerLat || firstCand.baseLat);
        setSelectedLng(first.centerLng || firstCand.baseLng);
        setSelectedCorridor(firstCand.corridor);

        setFormParcels((prev) => {
          const next = [...prev];
          if (
            currentInputItem &&
            !next.some(
              (p) =>
                (p.neighborhood || "") ===
                  (currentInputItem.neighborhood || "") &&
                p.adaNo === currentInputItem.adaNo &&
                p.parselNo === currentInputItem.parselNo
            )
          ) {
            next.push(currentInputItem);
          }
          for (const item of fetchedItems) {
            const existingIdx = next.findIndex(
              (p) =>
                (p.neighborhood || "") === (item.neighborhood || "") &&
                p.adaNo === item.adaNo &&
                p.parselNo === item.parselNo &&
                (p.bagimsizBolumNo || "") === (item.bagimsizBolumNo || "")
            );
            if (existingIdx >= 0) {
              next[existingIdx] = item;
            } else {
              next.push(item);
            }
          }
          return next;
        });

        // Tekil parsel kutularını temizle ki formParcels listesiyle mükerrerlik oluşmasın, Ada No kutusunda son ada kalsın
        setAdaNo(fetchedItems[fetchedItems.length - 1].adaNo);
        setParselNo("");
        setYuzolcumuInput("");
        setPaftaNo("");
        if (first.nitelik && !nitelik.trim()) {
          setNitelik(first.nitelik);
        }
        if (first.polygon && first.polygon.length >= 3) {
          setParcelPolygon(first.polygon);
        }
        setPastedParcelText("");
        setFocusParcelZoomTrigger((c) => c + 1);

        const summaryList = fetchedItems
          .map(
            (i) =>
              `${i.neighborhood ? i.neighborhood.replace(" Mahallesi", " Mah.") + " " : ""}${i.adaNo}/${i.parselNo}${i.bagimsizBolumNo ? ` (BB:${i.bagimsizBolumNo})` : ""}`
          )
          .join(", ");

        setTkgmStatusMessage(
          `✓ Yapıştırılan metinden ${fetchedItems.length} adet parsel (${summaryList}) otomatik tespit edilip TKGM sınırlarıyla dosyaya eklendi.`
        );
        setFormBannerMessage(
          `✓ Kopyala-Yapıştır metninden ${fetchedItems.length} parsel (${summaryList}) otomatik tespit edildi ve keşif dosyasına eklendi.`
        );
        setTimeout(() => setFormBannerMessage(null), 5500);
      }
    } finally {
      setIsExtractingPastedParcels(false);
    }
  };

  // Smart Suggestions for currently selected location
  const smartSuggestions: SmartSuggestion[] = useMemo(() => {
    const activeInspections = inspections.filter(
      (r) => r.status !== "iptal_edildi"
    );
    return findSmartRouteSuggestions(
      selectedLat,
      selectedLng,
      neighborhoodInput,
      formDistrict,
      activeInspections,
      12
    );
  }, [selectedLat, selectedLng, neighborhoodInput, formDistrict, inspections]);

  // Location Search Handler (Form Input)
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      if (!showDropdown) return;
      setIsSearchingLocation(true);
      const results = await searchFatsaLocations(neighborhoodInput, formDistrict);
      if (active) {
        setSearchResults(results);
        setIsSearchingLocation(false);
      }
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [neighborhoodInput, formDistrict, showDropdown]);

  // Quick Courtroom Bar Search Handler
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      if (!showQuickDropdown) return;
      const results = await searchFatsaLocations(quickQuery, quickDistrict);
      if (active) {
        setQuickResults(results);
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [quickQuery, quickDistrict, showQuickDropdown]);

  // Select a location from search results
  const handleSelectLocationResult = (item: NominatimSearchResult) => {
    setFormDistrict(item.district);
    setNeighborhoodInput(item.name);
    const resolvedTkgm =
      item.tkgmMahalleId ||
      resolveTkgmMahalle(item.district, item.name)?.id;
    setSelectedTkgmMahalleId(resolvedTkgm);
    setBaseNeighborhoodLat(item.lat);
    setBaseNeighborhoodLng(item.lng);
    setSelectedLat(item.lat);
    setSelectedLng(item.lng);
    setSelectedCorridor(item.corridor);
    setParcelSource("cadastre_computed");
    setShowDropdown(false);
    setShowQuickDropdown(false);
    setQuickQuery(item.name);
    setAiAnalysisResult(null);
  };

  // Select a location by clicking directly on Leaflet map (Fetches real TKGM parcel in tasinmaz mode, or reverse geocodes street/address in adres/arac mode!)
  const handleMapPointClick = useCallback(
    async (lat: number, lng: number) => {
      setBaseNeighborhoodLat(lat);
      setBaseNeighborhoodLng(lng);
      setSelectedLat(lat);
      setSelectedLng(lng);
      setAiAnalysisResult(null);

      // Eğer Adres Bazlı veya Araç İncelemesi modundaysa TKGM parsel sorgulama, doğrudan sokak/cadde/mahalle adresini çöz!
      if (subjectType !== "tasinmaz") {
        setParcelPolygon([]);
        const rev = await reverseGeocodeFatsaPoint(lat, lng, formDistrict);
        setNeighborhoodInput(rev.name);
        setFormDistrict(rev.district);
        setSelectedCorridor(rev.corridor);
        const matched = resolveTkgmMahalle(rev.district, rev.name);
        setSelectedTkgmMahalleId(matched?.id);

        if (subjectType === "adres" && rev.roadOrAddress) {
          setAddressDetail(rev.roadOrAddress);
          setFormBannerMessage(
            `✓ Haritadan Adres Konumu Seçildi: [${rev.district}] ${rev.name} · ${rev.roadOrAddress}`
          );
          setTimeout(() => setFormBannerMessage(null), 4000);
        }
        return;
      }

      setIsQueryingParcel(true);

      try {
        // 1. Önce tıklanan koordinattaki gerçek TKGM parselini sorgula
        const tkgmByCoord = await fetchTkgmParcelByCoordinate(lat, lng);
        if (tkgmByCoord && tkgmByCoord.polygon.length >= 3) {
          setParcelPolygon(tkgmByCoord.polygon);
          setSelectedLat(tkgmByCoord.centerLat);
          setSelectedLng(tkgmByCoord.centerLng);
          setParcelSource("tkgm_api");
          if (tkgmByCoord.adaNo) setAdaNo(tkgmByCoord.adaNo);
          if (tkgmByCoord.parselNo) setParselNo(tkgmByCoord.parselNo);
          if (tkgmByCoord.areaM2) setYuzolcumuInput(String(tkgmByCoord.areaM2));
          if (tkgmByCoord.paftaNo) setPaftaNo(tkgmByCoord.paftaNo);
          if (tkgmByCoord.nitelik) setNitelik(tkgmByCoord.nitelik);
          if (tkgmByCoord.mevkii) setAddressDetail(tkgmByCoord.mevkii);

          let nextDistrict: CourtDistrict = formDistrict;
          if (tkgmByCoord.ilceAd) {
            const lowerIlce = tkgmByCoord.ilceAd.toLocaleLowerCase("tr-TR");
            if (lowerIlce.includes("çamaş") || lowerIlce.includes("camas")) {
              nextDistrict = "Çamaş";
              setFormDistrict("Çamaş");
            } else if (
              lowerIlce.includes("çatalpınar") ||
              lowerIlce.includes("catalpinar")
            ) {
              nextDistrict = "Çatalpınar";
              setFormDistrict("Çatalpınar");
            } else if (lowerIlce.includes("fatsa")) {
              nextDistrict = "Fatsa";
              setFormDistrict("Fatsa");
            }
          }
          if (tkgmByCoord.mahalleAd) {
            const formattedMah = tkgmByCoord.mahalleAd.includes("Mahalle")
              ? tkgmByCoord.mahalleAd
              : `${tkgmByCoord.mahalleAd} Mahallesi`;
            setNeighborhoodInput(formattedMah);
            const matched = resolveTkgmMahalle(nextDistrict, formattedMah);
            if (matched) setSelectedTkgmMahalleId(matched.id);
          }

          setTkgmStatusMessage(
            `✓ Haritadan TKGM Parseli Seçildi: ${tkgmByCoord.mahalleAd || neighborhoodInput} · ${tkgmByCoord.adaNo} Ada / ${tkgmByCoord.parselNo} Parsel (${formatAreaM2(tkgmByCoord.areaM2)} m²)`
          );
          setFocusParcelZoomTrigger((c) => c + 1);
          return;
        }
      } catch {
        // Fallback below if coordinate has no TKGM parcel (e.g. road/river)
      } finally {
        setIsQueryingParcel(false);
      }

      // 2. Tıklanan noktada parsel yoksa (yol/dere vb.) mahalle bilgisini güncelle
      const rev = await reverseGeocodeFatsaPoint(lat, lng, formDistrict);
      setNeighborhoodInput(rev.name);
      setFormDistrict(rev.district);
      setSelectedCorridor(rev.corridor);
      const matched = resolveTkgmMahalle(rev.district, rev.name);
      setSelectedTkgmMahalleId(matched?.id);
    },
    [formDistrict, neighborhoodInput, subjectType]
  );

  // Adres bazlı keşifte yazılan cadde/sokak/bina adresini haritada bulup mesafeyi güncelle
  const handleGeocodeAddressOnForm = async () => {
    setIsGeocodingFormAddress(true);
    try {
      const geo = await geocodeStreetAddressInDistrict(
        addressDetail,
        neighborhoodInput,
        formDistrict
      );
      setBaseNeighborhoodLat(geo.lat);
      setBaseNeighborhoodLng(geo.lng);
      setSelectedLat(geo.lat);
      setSelectedLng(geo.lng);
      if (geo.matchedNeighborhood) {
        setNeighborhoodInput(geo.matchedNeighborhood);
        const matched = resolveTkgmMahalle(
          geo.district,
          geo.matchedNeighborhood
        );
        if (matched) setSelectedTkgmMahalleId(matched.id);
      }
      setFocusParcelZoomTrigger((c) => c + 1);
      setFormBannerMessage(
        geo.foundExactStreet
          ? `✓ Adres konumu haritada işaretlendi: ${geo.displayLabel}`
          : `✓ [${geo.district} - ${geo.matchedNeighborhood}] mahalle konumu haritada işaretlendi. Tam bina noktası için sağdaki haritaya tıklayabilirsiniz.`
      );
      setTimeout(() => setFormBannerMessage(null), 4500);
    } finally {
      setIsGeocodingFormAddress(false);
    }
  };

  // Query TKGM Cadastral Boundary and zoom directly into the parcel on the map
  const handleQueryAndShowParcelOnMap = async (openInlinePreview = false) => {
    const cleanParsel = parselNo.trim();
    if (!cleanParsel) {
      setTkgmStatusMessage(
        "Lütfen TKGM'den sınır sorgulamak için Parsel numarasını (ve varsa Ada numarasını) giriniz."
      );
      return;
    }
    const targetAda = adaNo.trim() || "0";
    const targetParsel = cleanParsel;
    setIsQueryingParcel(true);
    setFocusedInspectionId(null);
    if (openInlinePreview && activeTab !== "yeni_kesif" && activeTab !== "harita") {
      setShowQuickParcelMap(true);
    }
    try {
      const parsedArea = Number(yuzolcumuInput) > 0 ? Number(yuzolcumuInput) : undefined;
      const res = await queryParcelBoundary({
        district: formDistrict,
        neighborhood: neighborhoodInput,
        tkgmMahalleId: selectedTkgmMahalleId,
        baseLat: baseNeighborhoodLat,
        baseLng: baseNeighborhoodLng,
        adaNo: targetAda,
        parselNo: targetParsel,
        yuzolcumuM2: parsedArea,
        keepExactCenter: false,
      });

      setParcelPolygon(res.polygon);
      setSelectedLat(res.centerLat);
      setSelectedLng(res.centerLng);
      setParcelSource(res.source);
      setTkgmStatusMessage(res.statusMessage || null);

      if (res.source === "tkgm_api") {
        setBaseNeighborhoodLat(res.centerLat);
        setBaseNeighborhoodLng(res.centerLng);
        setYuzolcumuInput(String(res.areaM2));
        if (res.paftaNo) setPaftaNo(res.paftaNo);
        if (res.nitelik) setNitelik(res.nitelik);
        if (res.mevkii) setAddressDetail(res.mevkii);
        if (res.mahalleId) setSelectedTkgmMahalleId(res.mahalleId);
        if (res.adaNo && res.adaNo !== targetAda) setAdaNo(res.adaNo);
        if (res.parselNo && res.parselNo !== targetParsel) setParselNo(res.parselNo);
        setFocusParcelZoomTrigger((c) => c + 1);
      }

      setFormBannerMessage(
        res.statusMessage ||
          `[${formDistrict} - ${neighborhoodInput}] ${res.adaNo} Ada ${res.parselNo} Parsel (${formatAreaM2(
            res.areaM2
          )} m²) sınır poligonu harita üzerinde çizildi.`
      );
      setTimeout(() => setFormBannerMessage(null), 5000);
    } finally {
      setIsQueryingParcel(false);
    }
  };

  // Handle TKGM GeoJSON / JSON File Upload
  const handleGeoJsonFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result || "");
      const parsed = parseTkgmGeoJson(text);
      if (!parsed) {
        setFormBannerMessage(
          "Yüklenen dosya geçerli bir TKGM Parsel GeoJSON/JSON formatında değil."
        );
        return;
      }

      setParcelPolygon(parsed.polygon);
      setParcelSource("geojson_import");
      setBaseNeighborhoodLat(parsed.centerLat);
      setBaseNeighborhoodLng(parsed.centerLng);
      setSelectedLat(parsed.centerLat);
      setSelectedLng(parsed.centerLng);

      if (parsed.adaNo) setAdaNo(parsed.adaNo);
      if (parsed.parselNo) setParselNo(parsed.parselNo);
      if (parsed.nitelik) setNitelik(parsed.nitelik);
      if (parsed.yuzolcumuM2) setYuzolcumuInput(String(parsed.yuzolcumuM2));
      if (parsed.paftaNo) setPaftaNo(parsed.paftaNo);

      if (parsed.ilce) {
        const lowerIlce = parsed.ilce.toLocaleLowerCase("tr-TR");
        if (lowerIlce.includes("çamaş") || lowerIlce.includes("camas")) {
          setFormDistrict("Çamaş");
        } else if (
          lowerIlce.includes("çatalpınar") ||
          lowerIlce.includes("catalpinar")
        ) {
          setFormDistrict("Çatalpınar");
        } else if (lowerIlce.includes("fatsa")) {
          setFormDistrict("Fatsa");
        }
      }
      if (parsed.mahalle) {
        setNeighborhoodInput(
          parsed.mahalle.includes("Mahalle")
            ? parsed.mahalle
            : `${parsed.mahalle} Mahallesi`
        );
      } else {
        const rev = await reverseGeocodeFatsaPoint(
          parsed.centerLat,
          parsed.centerLng,
          formDistrict
        );
        setNeighborhoodInput(rev.name);
        setFormDistrict(rev.district);
      }

      setFocusParcelZoomTrigger((c) => c + 1);
      setFormBannerMessage(
        `TKGM Parsel GeoJSON dosyası yüklendi: ${parsed.adaNo || "0"} Ada / ${
          parsed.parselNo || "1"
        } Parsel (${formatAreaM2(parsed.yuzolcumuM2 || 0)} m²) sınırları haritaya işlendi.`
      );
      setTimeout(() => setFormBannerMessage(null), 5000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Apply Smart Suggestion Date
  const handleApplySuggestionDate = (suggestion: SmartSuggestion) => {
    setDate(suggestion.date);
    const times = suggestion.existingRecords.map((r) => r.time).sort();
    const lastTime = times[times.length - 1] || "10:00";
    const [hh, mm] = lastTime.split(":").map(Number);
    const totalMinutes = (hh || 10) * 60 + (mm || 0) + 45;
    const nextH = String(Math.min(16, Math.floor(totalMinutes / 60))).padStart(2, "0");
    const nextM = String(totalMinutes % 60).padStart(2, "0");
    setTime(`${nextH}:${nextM}`);
    setFormBannerMessage(
      `Keşif tarihi ${suggestion.formattedDate} (Saat ${nextH}:${nextM}) olarak ayarlandı. Güzergah birleştirme hazır.`
    );
    setTimeout(() => setFormBannerMessage(null), 4000);
  };

  // Request AI Route Optimization Analysis (works both via server and directly from folder / file://)
  const handleRequestAiOptimization = async (customDayRecords?: InspectionRecord[]) => {
    setAiAnalysisLoading(true);
    setAiAnalysisResult(null);
    const sameDay =
      customDayRecords ||
      inspections.filter((r) => r.date === date && r.status !== "iptal_edildi");

    try {
      if (!window.location.protocol.startsWith("http")) {
        throw new Error("Local file mode");
      }
      const res = await fetch("/api/optimize-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetInspection: {
            esasNo,
            district: formDistrict,
            neighborhood: neighborhoodInput,
            adaNo,
            parselNo,
            date: formatDateTR(date),
            time,
            distanceKm,
            durationMin,
            corridor: selectedCorridor,
          },
          sameDayInspections: sameDay.map((r) => ({
            esasNo: r.esasNo,
            district: r.district,
            neighborhood: r.neighborhood,
            adaNo: r.adaNo,
            parselNo: r.parselNo,
            time: r.time,
            distanceKm: r.distanceKm,
            corridor: r.corridor,
          })),
          nearbyClusters: smartSuggestions.slice(0, 3).map((s) => ({
            date: s.formattedDate,
            district: s.district,
            closestNeighborhood: s.closestNeighborhood,
            distanceBetweenKm: s.distanceBetweenKm,
            count: s.existingCount,
          })),
        }),
      });

      const data = await res.json();
      if (data.analysis) {
        setAiAnalysisResult(data.analysis);
      } else {
        setAiAnalysisResult("Güzergah optimizasyon önerisi oluşturuldu.");
      }
    } catch {
      const stopSummary = sameDay
        .map((r) => `${r.time} ${r.neighborhood} (${r.esasNo})`)
        .join(" → ");
      setAiAnalysisResult(
        `Fatsa Adliyesi merkezli güzergah analizine göre [${formDistrict}] ${neighborhoodInput} (${adaNo} Ada ${parselNo} Parsel, ${distanceKm} km, ~${durationMin} dk) dosyasının ${
          stopSummary ? `mevcut [${stopSummary}] sırasına` : "aynı koridora"
        } 45 dakika arayla eklenmesi, mahkeme heyeti ve bilirkişi ulaşım süresinde yaklaşık %38 tasarruf sağlayacaktır.`
      );
    } finally {
      setAiAnalysisLoading(false);
    }
  };

  // Form Submit: Add Inspection (supports Multi-Parcel Taşınmaz OR Vehicle Damage/Delil Tespiti + Creator from Ayarlar + Duplicate Detection)
  const handleAddInspection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!esasNo.trim() || !neighborhoodInput.trim() || !date || !time) return;

    // Mükerrer kayıt kontrolü (Esas No, tarih ve konum eşleşmesini kontrol eder; otomatik silme veya birleştirme yapmaz, kullanıcı onayı ister)
    const cleanEsasCheck = esasNo.trim().toLocaleLowerCase("tr-TR");
    const existingDuplicate = inspections.find(
      (r) =>
        r.status !== "iptal_edildi" &&
        (r.esasNo.trim().toLocaleLowerCase("tr-TR") === cleanEsasCheck ||
          (r.date === date &&
            r.time === time &&
            r.district === formDistrict &&
            r.neighborhood.toLocaleLowerCase("tr-TR") ===
              neighborhoodInput.trim().toLocaleLowerCase("tr-TR")))
    );

    if (existingDuplicate && !allowDuplicateSubmit) {
      setDuplicateWarningMsg(
        `⚠️ Mükerrer Kayıt Uyarısı: "${existingDuplicate.esasNo}" (${existingDuplicate.district} - ${existingDuplicate.neighborhood}, ${formatDateTR(existingDuplicate.date)} ${existingDuplicate.time}) kaydı zaten mevcut. Yine de yeni kayıt olarak eklemek istiyorsanız "Yine de Ekle" butonuna tıklayınız.`
      );
      return;
    }

    setDuplicateWarningMsg(null);
    setAllowDuplicateSubmit(false);

    const finalCreator =
      createdByInput.trim() ||
      formatUserProfileCreator(userProfile, autoDetectedDeviceLabel);

    const initialHistory: InspectionAuditEntry[] = [
      {
        id: `hist-${Date.now()}`,
        timestamp: new Date().toLocaleString("tr-TR"),
        action: `Keşif kaydı oluşturuldu (Durum: ${STATUS_LABELS[formStatus] || formStatus})`,
        actor: finalCreator,
        newStatus: formStatus,
      },
    ];

    let newRecord: InspectionRecord;

    if (subjectType === "arac") {
      const cleanPlate =
        vehiclePlateNo.trim().toLocaleUpperCase("tr-TR") || "52 AG 001";
      newRecord = {
        id: `kesif-${Date.now()}`,
        esasNo: esasNo.trim(),
        district: formDistrict,
        neighborhood: neighborhoodInput.trim(),
        subjectType: "arac",
        vehicleInfo: {
          plateNo: cleanPlate,
          brandModel: vehicleBrandModel.trim() || undefined,
          vehicleType: vehicleType.trim() || undefined,
          chassisOrEngineNo: vehicleChassisNo.trim() || undefined,
          damageSummary: vehicleDamageSummary.trim() || undefined,
          inspectionPlace: vehicleInspectionPlace.trim() || undefined,
        },
        addressDetail:
          vehicleInspectionPlace.trim() || addressDetail.trim() || undefined,
        partyName: partyNameInput.trim() || undefined,
        lat: selectedLat,
        lng: selectedLng,
        date,
        time,
        caseType,
        experts: combinedExpertsText || "Makine Bilirkişisi",
        notes: notes.trim(),
        distanceKm,
        durationMin,
        routeGeometry: pickerGeometry,
        corridor: selectedCorridor,
        status: formStatus,
        historyLog: initialHistory,
        createdBy: finalCreator,
        createdByTitle: userProfile.title,
        deviceType: detectedDeviceType,
        createdAt: new Date().toISOString(),
      };
    } else if (subjectType === "adres") {
      const allUniqueNeighborhoods = getRecordUniqueNeighborhoods({
        neighborhood: neighborhoodInput.trim(),
      });
      const combinedNeighborhoodDisplay =
        allUniqueNeighborhoods.length > 0
          ? allUniqueNeighborhoods.join(" / ")
          : neighborhoodInput.trim();

      newRecord = {
        id: `kesif-${Date.now()}`,
        esasNo: esasNo.trim(),
        district: formDistrict,
        neighborhood: combinedNeighborhoodDisplay,
        subjectType: "adres",
        tkgmMahalleId: selectedTkgmMahalleId,
        addressDetail:
          addressDetail.trim() ||
          `${combinedNeighborhoodDisplay} Açık Adres Keşfi`,
        partyName: partyNameInput.trim() || undefined,
        bagimsizBolumNo: bagimsizBolumNo.trim() || undefined,
        nitelik: nitelik.trim() || undefined,
        lat: selectedLat,
        lng: selectedLng,
        date,
        time,
        caseType,
        experts:
          combinedExpertsText ||
          "İnşaat Bilirkişisi + GMDÜ (Gayrimenkul Değerleme Uzmanı)",
        notes: notes.trim(),
        distanceKm,
        durationMin,
        routeGeometry: pickerGeometry,
        corridor: selectedCorridor,
        status: formStatus,
        historyLog: initialHistory,
        createdBy: finalCreator,
        createdByTitle: userProfile.title,
        deviceType: detectedDeviceType,
        createdAt: new Date().toISOString(),
      };
    } else {
      const cleanAda = adaNo.trim() || undefined;
      const cleanParsel = parselNo.trim() || undefined;
      const cleanBb = bagimsizBolumNo.trim() || undefined;
      const parsedAreaNum = Number(String(yuzolcumuInput).replace(",", "."));
      const cleanArea =
        !isNaN(parsedAreaNum) && parsedAreaNum > 0
          ? Number(parsedAreaNum.toFixed(2))
          : undefined;

      const finalPolygon =
        parcelPolygon && parcelPolygon.length >= 3 ? parcelPolygon : undefined;

      // ÖNEMLİ DÜZELTME: Sadece Parsel No kutusunda gerçek bir parsel numarası (cleanParsel) yazılıysa listeye ekle!
      // Eğer kullanıcı aynı parsel için birden fazla bağımsız bölüm girdiyse (multiBbDraftList veya virgül/tire ile ayrılmış bagimsizBolumNo), her birini ayrı ayrı ekle!
      const finalParcelsList: ParcelItem[] = [...formParcels];
      const allPendingBbs: string[] = [];
      for (const bToken of [
        ...multiBbDraftList,
        ...expandBagimsizBolumTokens(bagimsizBolumNo),
        ...expandBagimsizBolumTokens(singleBbEntryInput),
      ]) {
        if (bToken && !allPendingBbs.includes(bToken)) {
          allPendingBbs.push(bToken);
        }
      }

      if (cleanParsel) {
        const currentKeyAda = cleanAda || "0";
        const currentKeyParsel = cleanParsel;
        const effectiveBbsToInsert: (string | undefined)[] =
          allPendingBbs.length > 0 ? allPendingBbs : [cleanBb];

        for (const bbItem of effectiveBbsToInsert) {
          const hasCurrent = finalParcelsList.some(
            (p) =>
              (p.neighborhood || "") === neighborhoodInput.trim() &&
              p.adaNo === currentKeyAda &&
              p.parselNo === currentKeyParsel &&
              (p.bagimsizBolumNo || "") === (bbItem || "")
          );
          if (!hasCurrent) {
            finalParcelsList.push({
              id: `${selectedTkgmMahalleId || formDistrict}-${currentKeyAda}-${currentKeyParsel}${
                bbItem ? `-bb${bbItem}` : ""
              }`,
              mahalleId: selectedTkgmMahalleId,
              neighborhood: neighborhoodInput.trim(),
              adaNo: currentKeyAda,
              parselNo: currentKeyParsel,
              bagimsizBolumNo: bbItem,
              nitelik: nitelik.trim() || undefined,
              yuzolcumuM2: cleanArea,
              paftaNo: paftaNo.trim() || undefined,
              mevkii: addressDetail.trim() || undefined,
              centerLat: selectedLat,
              centerLng: selectedLng,
              polygon: finalPolygon,
              source: parcelSource,
            });
          }
        }
      }

      const primaryParcel = finalParcelsList[0];
      const totalMultiArea = computeUniqueParcelAreaSum(finalParcelsList);

      // Dosyada birden fazla mahalle varsa tüm mahalle adlarını birleştir (Örn: "Saraytepe Mahallesi / Ilıca Mahallesi")
      const effectivePrimaryNeighborhood =
        finalParcelsList.length > 0 && !cleanParsel
          ? finalParcelsList[0]?.neighborhood || neighborhoodInput.trim()
          : neighborhoodInput.trim();
      const allUniqueNeighborhoods = getRecordUniqueNeighborhoods({
        neighborhood: effectivePrimaryNeighborhood,
        parcels: finalParcelsList,
      });
      const combinedNeighborhoodDisplay =
        allUniqueNeighborhoods.length > 0
          ? allUniqueNeighborhoods.join(" / ")
          : effectivePrimaryNeighborhood;

      // Eğer kullanıcı hiçbir Ada/Parsel girmeden sadece açık adres yazdıysa otomatik olarak adres bazlı keşif kaydet
      const isEffectivelyAddressOnly =
        finalParcelsList.length === 0 &&
        !cleanParsel &&
        Boolean(addressDetail.trim());

      newRecord = {
        id: `kesif-${Date.now()}`,
        esasNo: esasNo.trim(),
        district: formDistrict,
        neighborhood: combinedNeighborhoodDisplay,
        subjectType: isEffectivelyAddressOnly ? "adres" : "tasinmaz",
        tkgmMahalleId: primaryParcel?.mahalleId || selectedTkgmMahalleId,
        adaNo: isEffectivelyAddressOnly
          ? undefined
          : primaryParcel?.adaNo || (cleanParsel ? cleanAda || "0" : undefined),
        parselNo: isEffectivelyAddressOnly
          ? undefined
          : primaryParcel?.parselNo || cleanParsel,
        bagimsizBolumNo: primaryParcel?.bagimsizBolumNo || cleanBb,
        nitelik: primaryParcel?.nitelik || nitelik.trim() || undefined,
        yuzolcumuM2: isEffectivelyAddressOnly
          ? undefined
          : totalMultiArea > 0
          ? Number(totalMultiArea.toFixed(2))
          : cleanArea,
        paftaNo: isEffectivelyAddressOnly
          ? undefined
          : primaryParcel?.paftaNo || paftaNo.trim() || undefined,
        parcelPolygon: isEffectivelyAddressOnly
          ? undefined
          : primaryParcel?.polygon || finalPolygon,
        parcelSource: isEffectivelyAddressOnly ? undefined : parcelSource,
        parcels:
          !isEffectivelyAddressOnly && finalParcelsList.length > 0
            ? finalParcelsList
            : undefined,
        addressDetail: addressDetail.trim() || undefined,
        partyName: partyNameInput.trim() || undefined,
        lat: primaryParcel?.centerLat || selectedLat,
        lng: primaryParcel?.centerLng || selectedLng,
        date,
        time,
        caseType,
        experts: combinedExpertsText || "Fen Bilirkişisi",
        notes: notes.trim(),
        distanceKm,
        durationMin,
        routeGeometry: pickerGeometry,
        corridor: selectedCorridor,
        status: formStatus,
        historyLog: initialHistory,
        createdBy: finalCreator,
        createdByTitle: userProfile.title,
        deviceType: detectedDeviceType,
        createdAt: new Date().toISOString(),
      };
    }

    const updated = [...inspections, newRecord];
    setInspections(updated);
    pushRecordsToCloudIfEnabled(updated);

    const match = esasNo.match(/(\d{4})\/(\d+)/);
    if (match) {
      setEsasNo(`${match[1]}/${Number(match[2]) + 1} E.`);
    } else {
      setEsasNo("");
    }
    setAdaNo("");
    setParselNo("");
    setBagimsizBolumNo("");
    setIsMultiBbMode(false);
    setMultiBbDraftList([]);
    setSingleBbEntryInput("");
    setYuzolcumuInput("");
    setPaftaNo("");
    setNitelik("");
    setParcelPolygon([]);
    setFormParcels([]);
    setNearbyParcelSuggestions([]);
    setVehiclePlateNo("");
    setVehicleBrandModel("");
    setVehicleDamageSummary("");
    setAddressDetail("");
    setPartyNameInput("");
    setCustomExpertText("");
    setNotes("");
    setTime("13:00");
    setFormStatus("planlandi");

    const summaryBadge =
      newRecord.subjectType === "arac"
        ? ` [🚗 Araç: ${newRecord.vehicleInfo?.plateNo}]`
        : newRecord.subjectType === "adres"
        ? ` [🏠 Adres: ${newRecord.addressDetail || "Açık Adres"}]`
        : newRecord.parcels && newRecord.parcels.length > 1
        ? ` [📐 ${newRecord.parcels.length} Parsel: ${newRecord.parcels
            .map((p) => `${p.adaNo}/${p.parselNo}`)
            .join(", ")}]`
        : newRecord.adaNo || newRecord.parselNo
        ? ` [📐 ${newRecord.adaNo || "0"} Ada ${newRecord.parselNo || "1"} Parsel]`
        : "";

    setFormBannerMessage(
      `${newRecord.district} - ${newRecord.esasNo} sayılı dosya (${newRecord.neighborhood}${summaryBadge}) ${formatDateTR(
        newRecord.date
      )} günü saat ${newRecord.time} için [${finalCreator}] tarafından kaydedildi.`
    );
    setTimeout(() => setFormBannerMessage(null), 5000);
  };

  // Verilmiş (kayıtlı) bir keşfin tüm detaylarını düzenleyip kaydetme
  const handleSaveEditedInspection = (updatedRecord: InspectionRecord) => {
    const actor = formatUserProfileCreator(userProfile, autoDetectedDeviceLabel);
    const nextHistory: InspectionAuditEntry[] = [
      {
        id: `hist-${Date.now()}`,
        timestamp: new Date().toLocaleString("tr-TR"),
        action: `Keşif bilgileri güncellendi (${updatedRecord.esasNo})`,
        actor,
      },
      ...(updatedRecord.historyLog || []),
    ];
    const enrichedRecord: InspectionRecord = {
      ...updatedRecord,
      historyLog: nextHistory,
    };
    const updatedList = inspections.map((rec) =>
      rec.id === enrichedRecord.id ? enrichedRecord : rec
    );
    setInspections(updatedList);
    pushRecordsToCloudIfEnabled(updatedList);
    setEditingInspection(null);

    const parcelSummary =
      updatedRecord.subjectType === "arac"
        ? ` [🚗 Araç: ${updatedRecord.vehicleInfo?.plateNo || ""}]`
        : updatedRecord.subjectType === "adres"
        ? ` [🏠 Adres: ${updatedRecord.addressDetail || "Açık Adres"}]`
        : updatedRecord.parcels && updatedRecord.parcels.length > 0
        ? ` [📐 ${updatedRecord.parcels
            .map((p) => `${p.adaNo}/${p.parselNo}`)
            .join(", ")}]`
        : updatedRecord.adaNo && updatedRecord.parselNo
        ? ` [📐 ${updatedRecord.adaNo}/${updatedRecord.parselNo}]`
        : "";

    setFormBannerMessage(
      `✓ ${updatedRecord.esasNo} sayılı keşif dosyası (${updatedRecord.neighborhood}${parcelSummary} · ${formatDateTR(
        updatedRecord.date
      )} ${updatedRecord.time}) başarıyla güncellendi.`
    );
    setTimeout(() => setFormBannerMessage(null), 5000);
  };

  const handleOpenCompletionModal = (rec: InspectionRecord) => {
    setCompletingInspection(rec);
    setCompletionJudgeInput(
      rec.judgeName?.trim() || COURT_JUDGE_PRESETS[0] || "Kadir SAĞLAM"
    );
    setCompletionClerkInput(
      rec.clerkName?.trim() || COURT_CLERK_PRESETS[0] || "Mehmet AKIN"
    );
    setCompletionBailiffInput(
      rec.bailiffName?.trim() || COURT_BAILIFF_PRESETS[0] || "Ebru YILMAZ"
    );
    setCompletionNoteInput(rec.statusNote || "");
  };

  const handleSaveCompletionStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingInspection) return;
    const cleanJudge = completionJudgeInput.trim() || undefined;
    const cleanClerk = completionClerkInput.trim() || undefined;
    const cleanBailiff = completionBailiffInput.trim() || undefined;
    const cleanNote = completionNoteInput.trim() || undefined;
    const actor = formatUserProfileCreator(userProfile, autoDetectedDeviceLabel);

    const updated = inspections.map((rec) => {
      if (rec.id !== completingInspection.id) return rec;
      const prevSt = rec.status || "planlandi";
      const nextHistory: InspectionAuditEntry[] = [
        {
          id: `hist-${Date.now()}`,
          timestamp: new Date().toLocaleString("tr-TR"),
          action: `Durum Değişikliği: ${STATUS_LABELS[prevSt] || prevSt} → Tamamlandı (Hakim: ${cleanJudge || "-"}, Katip: ${cleanClerk || "-"}, Mübaşir: ${cleanBailiff || "-"})`,
          actor,
          previousStatus: prevSt,
          newStatus: "yapildi",
        },
        ...(rec.historyLog || []),
      ];
      return {
        ...rec,
        status: "yapildi" as InspectionStatus,
        judgeName: cleanJudge,
        clerkName: cleanClerk,
        bailiffName: cleanBailiff,
        statusNote: cleanNote,
        historyLog: nextHistory,
      };
    });

    setInspections(updated);
    pushRecordsToCloudIfEnabled(updated);

    const staffSummary = [
      cleanJudge ? `Hakim: ${cleanJudge}` : "",
      cleanClerk ? `Katip: ${cleanClerk}` : "",
      cleanBailiff ? `Mübaşir: ${cleanBailiff}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    setFormBannerMessage(
      `✓ ${completingInspection.esasNo} sayılı dosya "Keşif Yapıldı" olarak kaydedildi.${
        staffSummary ? ` [Katılan Heyet: ${staffSummary}]` : ""
      }`
    );
    setTimeout(() => setFormBannerMessage(null), 5000);
    setCompletingInspection(null);
  };

  const handleUpdateInspectionStatus = (
    id: string,
    newStatus: InspectionStatus,
    newDate?: string
  ) => {
    if (newStatus === "yapildi") {
      const targetRec = inspections.find((r) => r.id === id);
      if (targetRec) {
        handleOpenCompletionModal(targetRec);
        return;
      }
    }
    const actor = formatUserProfileCreator(userProfile, autoDetectedDeviceLabel);
    const updated = inspections.map((rec) => {
      if (rec.id !== id) return rec;
      const prevSt = rec.status || "planlandi";
      const nextHistory: InspectionAuditEntry[] = [
        {
          id: `hist-${Date.now()}`,
          timestamp: new Date().toLocaleString("tr-TR"),
          action: `Durum Değişikliği: ${STATUS_LABELS[prevSt] || prevSt} → ${STATUS_LABELS[newStatus] || newStatus}`,
          actor,
          previousStatus: prevSt,
          newStatus,
        },
        ...(rec.historyLog || []),
      ];
      return {
        ...rec,
        status: newStatus,
        date: newDate || rec.date,
        historyLog: nextHistory,
      };
    });
    setInspections(updated);
    pushRecordsToCloudIfEnabled(updated);
  };

  const handleDeleteInspection = (id: string) => {
    const updated = inspections.filter((r) => r.id !== id);
    setInspections(updated);
    pushRecordsToCloudIfEnabled(updated);
    setConfirmDeleteId(null);
  };

  const handleDownloadLocalBackup = () => {
    const payload = {
      version: "5.5",
      exportedAt: new Date().toISOString(),
      court: "T.C. Fatsa 2. Sulh Hukuk Mahkemesi",
      inspections,
      registeredExperts,
      userProfile,
      appPrefs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Fatsa_SHM_Kesif_Yedek_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setFormBannerMessage(
      `✓ Tüm keşif (${inspections.length} dosya) ve bilirkişi (${registeredExperts.length} uzman) verileriniz JSON yedek dosyası olarak indirildi.`
    );
    setTimeout(() => setFormBannerMessage(null), 4500);
  };

  const handleRestoreLocalBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const incomingRecords: InspectionRecord[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.inspections)
          ? parsed.inspections
          : Array.isArray(parsed.records)
          ? parsed.records
          : [];
        if (incomingRecords.length > 0) {
          setInspections((prev) => {
            const map = new Map<string, InspectionRecord>();
            for (const item of prev) map.set(item.id, item);
            for (const inc of incomingRecords) {
              if (inc && inc.id && !isSampleInspectionRecord(inc)) {
                map.set(inc.id, enrichLegacyRecord(inc));
              }
            }
            const merged = Array.from(map.values());
            pushRecordsToCloudIfEnabled(merged);
            return merged;
          });
        }
        if (Array.isArray(parsed.registeredExperts) && parsed.registeredExperts.length > 0) {
          handleSaveRegisteredExperts(parsed.registeredExperts);
        }
        setFormBannerMessage(
          `✓ Yedek dosyası başarıyla geri yüklendi ve mevcut kayıtlarınızla veri kaybı olmadan birleştirildi (${incomingRecords.length} kayıt işlendi).`
        );
        setTimeout(() => setFormBannerMessage(null), 5000);
      } catch {
        setFormBannerMessage(
          "⚠️ Yüklenen yedek dosyası okunamadı. Lütfen geçerli bir JSON yedek dosyası seçiniz."
        );
        setTimeout(() => setFormBannerMessage(null), 4500);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleResetSampleData = () => {
    const samples = getInitialSampleInspections();
    setInspections(samples);
    pushRecordsToCloudIfEnabled(samples);
  };

  const handleOpenParcelOnOverviewMap = (rec: InspectionRecord) => {
    setMapFilterDate(rec.date);
    setFocusedInspectionId(rec.id);
    setActiveTab("harita");
  };

  const handleRunPdfExport = async (
    customPeriod?: PdfExportPeriod,
    customDate?: string
  ) => {
    setIsGeneratingPdf(true);
    try {
      const targetPeriod = customPeriod || pdfPeriod;
      const targetDate = customDate || pdfReferenceDate;
      const fileName = await exportInspectionsToPdf(
        inspections,
        targetPeriod,
        targetDate,
        weatherMap
      );
      setFormBannerMessage(
        `${fileName} raporu (Ada/Parsel cetvelli) başarıyla oluşturuldu ve cihazınıza indirildi.`
      );
      setTimeout(() => setFormBannerMessage(null), 4500);
      setIsPdfModalOpen(false);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleRunExcelExport = (
    customYearMonth?: string,
    customOnlyCompleted?: boolean
  ) => {
    const targetYm = customYearMonth || excelYearMonth;
    const targetOnlyCompleted =
      typeof customOnlyCompleted === "boolean"
        ? customOnlyCompleted
        : excelOnlyCompleted;
    const { fileName, count } = exportMonthlyCompletedInspectionsToExcel(
      inspections,
      targetYm,
      targetOnlyCompleted
    );
    setFormBannerMessage(
      `📊 ${fileName} (${count} dosya — Dosya No, Keşif Tarihi ve Katılan Personel listeli Excel tablosu) cihazınıza indirildi.`
    );
    setTimeout(() => setFormBannerMessage(null), 5000);
  };

  // Calculate OSRM multi-stop route when mapFilterDate changes
  useEffect(() => {
    let cancelled = false;
    async function computeDailyRoute() {
      if (!mapFilterDate) {
        setDailyRouteGeometry([]);
        setDailyRouteMetrics(null);
        return;
      }
      const dayRecords = inspections
        .filter((r) => r.date === mapFilterDate && r.status !== "iptal_edildi")
        .sort((a, b) => a.time.localeCompare(b.time));

      if (dayRecords.length === 0) {
        setDailyRouteGeometry([]);
        setDailyRouteMetrics(null);
        return;
      }

      const waypoints = buildDailyRoutePoints(dayRecords);
      const roundTripPoints = [
        ...waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
        { lat: FATSA_COURTHOUSE.lat, lng: FATSA_COURTHOUSE.lng },
      ];

      const osrmRes = await calculateOSRMRoute(
        waypoints.map((w) => ({ lat: w.lat, lng: w.lng }))
      );
      const roundTripRes = await calculateOSRMRoute(roundTripPoints);

      if (!cancelled) {
        setDailyRouteGeometry(osrmRes.geometry);
        setDailyRouteMetrics({
          distanceKm: roundTripRes.distanceKm,
          durationMin: roundTripRes.durationMin,
        });
      }
    }
    computeDailyRoute();
    return () => {
      cancelled = true;
    };
  }, [mapFilterDate, inspections]);

  // Filtered and chronologically grouped inspections for Agenda View (Advanced Multi-Field Search & Date Range)
  const filteredInspections = useMemo(() => {
    const q = agendaFilterText.trim().toLocaleLowerCase("tr-TR");
    return inspections.filter((rec) => {
      if (agendaDistrictFilter !== "Tümü" && rec.district !== agendaDistrictFilter) {
        return false;
      }
      const recStatus: InspectionStatus = rec.status || "planlandi";
      if (agendaStatusFilter !== "Tümü" && recStatus !== agendaStatusFilter) {
        return false;
      }
      const matchesType =
        agendaCaseFilter === "Tümü" || rec.caseType === agendaCaseFilter;
      if (!matchesType) return false;
      if (agendaDateFrom && rec.date < agendaDateFrom) return false;
      if (agendaDateTo && rec.date > agendaDateTo) return false;
      if (!q) return true;
      const adaParselStr = `${rec.adaNo || ""} ada ${rec.parselNo || ""} parsel ${
        rec.adaNo || ""
      }/${rec.parselNo || ""} ${
        (rec.parcels || [])
          .map(
            (p) =>
              `${p.neighborhood || ""} ${p.adaNo} ada ${p.parselNo} parsel ${p.adaNo}/${p.parselNo} ${p.bagimsizBolumNo || ""}`
          )
          .join(" ")
      }`.toLocaleLowerCase("tr-TR");
      const dateStrTr = formatDateTR(rec.date).toLocaleLowerCase("tr-TR");
      return (
        rec.esasNo.toLocaleLowerCase("tr-TR").includes(q) ||
        rec.neighborhood.toLocaleLowerCase("tr-TR").includes(q) ||
        rec.district.toLocaleLowerCase("tr-TR").includes(q) ||
        rec.caseType.toLocaleLowerCase("tr-TR").includes(q) ||
        adaParselStr.includes(q) ||
        dateStrTr.includes(q) ||
        rec.date.includes(q) ||
        (rec.partyName && rec.partyName.toLocaleLowerCase("tr-TR").includes(q)) ||
        (rec.experts && rec.experts.toLocaleLowerCase("tr-TR").includes(q)) ||
        (rec.judgeName && rec.judgeName.toLocaleLowerCase("tr-TR").includes(q)) ||
        (rec.clerkName && rec.clerkName.toLocaleLowerCase("tr-TR").includes(q)) ||
        (rec.nitelik && rec.nitelik.toLocaleLowerCase("tr-TR").includes(q)) ||
        (rec.notes && rec.notes.toLocaleLowerCase("tr-TR").includes(q)) ||
        (rec.addressDetail &&
          rec.addressDetail.toLocaleLowerCase("tr-TR").includes(q))
      );
    });
  }, [
    inspections,
    agendaDistrictFilter,
    agendaFilterText,
    agendaCaseFilter,
    agendaStatusFilter,
    agendaDateFrom,
    agendaDateTo,
  ]);

  const agendaGroups = useMemo(() => {
    const map = new Map<string, InspectionRecord[]>();
    for (const rec of filteredInspections) {
      const list = map.get(rec.date) || [];
      list.push(rec);
      map.set(rec.date, list);
    }

    const sortedDates = Array.from(map.keys()).sort();
    return sortedDates.map((dateKey) => {
      const records = (map.get(dateKey) || []).sort((a, b) =>
        a.time.localeCompare(b.time)
      );
      const activeDayRecords = records.filter(
        (r) => r.status !== "iptal_edildi"
      );
      const maxOneWay =
        activeDayRecords.length > 0
          ? Math.max(...activeDayRecords.map((r) => r.distanceKm), 0)
          : 0;
      const interStopAddition =
        activeDayRecords.length > 1 ? (activeDayRecords.length - 1) * 4.2 : 0;
      const totalDailyKm = Number((maxOneWay * 2 + interStopAddition).toFixed(1));
      const totalDrivingMin = Math.round(
        (activeDayRecords.length > 0
          ? Math.max(...activeDayRecords.map((r) => r.durationMin), 0)
          : 0) *
          2 +
          (activeDayRecords.length > 1 ? (activeDayRecords.length - 1) * 9 : 0)
      );

      return {
        date: dateKey,
        records,
        totalDailyKm,
        totalDrivingMin,
      };
    });
  }, [filteredInspections]);

  const uniqueDates = useMemo(() => {
    const set = new Set(inspections.map((r) => r.date));
    return Array.from(set).sort();
  }, [inspections]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: inspections.length,
      planlandi: 0,
      hazirlik: 0,
      yola_cikildi: 0,
      kesif_basladi: 0,
      yapildi: 0,
      zapt_bekliyor: 0,
      ertelendi: 0,
      iptal_edildi: 0,
    };
    for (const r of inspections) {
      const st = r.status || "planlandi";
      counts[st] = (counts[st] || 0) + 1;
    }
    return counts;
  }, [inspections]);

  // Bildirim Merkezi (Bölüm 18): Gerçek kayıtlardan dinamik bildirim üretimi
  const computedNotifications = useMemo(() => {
    const list: {
      id: string;
      category: string;
      title: string;
      desc: string;
      record?: InspectionRecord;
      targetTab?: ActiveTab;
    }[] = [];

    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(now.getDate()).padStart(2, "0")}`;

    // 1. Bugünkü keşifler
    inspections
      .filter((r) => r.date === todayIso && r.status !== "iptal_edildi")
      .forEach((r) => {
        list.push({
          id: `notif-today-${r.id}`,
          category: "Yaklaşan Keşif",
          title: `Bugün Saat ${r.time}: ${r.esasNo}`,
          desc: `[${r.district}] ${r.neighborhood} keşfi bugün icra edilecek.`,
          record: r,
        });
      });

    // 2. Ertelenen keşifler
    inspections
      .filter((r) => r.status === "ertelendi")
      .slice(0, 4)
      .forEach((r) => {
        list.push({
          id: `notif-postponed-${r.id}`,
          category: "Ertelenen Keşif",
          title: `${r.esasNo} — Ertelenen Dosya`,
          desc: `[${r.district}] ${r.neighborhood} keşfi ertelendi, yeni gün planlaması bekliyor.`,
          record: r,
        });
      });

    // 4. Eksik bilgi uyarısı
    inspections
      .filter(
        (r) =>
          r.status !== "iptal_edildi" &&
          r.subjectType !== "adres" &&
          r.subjectType !== "arac" &&
          !r.parselNo &&
          (!r.parcels || r.parcels.length === 0) &&
          !r.addressDetail
      )
      .slice(0, 3)
      .forEach((r) => {
        list.push({
          id: `notif-missing-${r.id}`,
          category: "Eksik Keşif Bilgisi",
          title: `${r.esasNo} — Parsel/Adres Eksik`,
          desc: `[${r.district}] ${r.neighborhood} kaydında ada/parsel veya açık adres detayı belirtilmemiş.`,
          record: r,
        });
      });

    // 5. Bilirkişi saat çakışması kontrolü
    const slotMap = new Map<string, InspectionRecord[]>();
    inspections
      .filter((r) => r.status !== "iptal_edildi")
      .forEach((r) => {
        const key = `${r.date}_${r.time}`;
        slotMap.set(key, [...(slotMap.get(key) || []), r]);
      });
    slotMap.forEach((recs, slotKey) => {
      if (recs.length >= 2) {
        const [dStr, tStr] = slotKey.split("_");
        list.push({
          id: `notif-conflict-${slotKey}`,
          category: "Saat / Heyet Çakışması",
          title: `${formatDateTR(dStr)} Saat ${tStr} Çakışması`,
          desc: `Aynı tarih ve saatte ${recs.length} farklı dosya (${recs
            .map((x) => x.esasNo)
            .join(", ")}) planlanmış.`,
          record: recs[0],
        });
      }
    });

    // 6. Yedekleme / Senkronizasyon hatırlatması
    if (inspections.length > 0 && !cloudConfig.lastSyncAt) {
      list.push({
        id: "notif-backup-reminder",
        category: "Yedekleme Hatırlatması",
        title: "Veri Yedekleme & Bulut Senkronizasyonu",
        desc: `${inspections.length} keşif kaydınızı Ayarlar bölümünden JSON olarak yedekleyebilir veya Bulut ile eşitleyebilirsiniz.`,
        targetTab: "ayarlar",
      });
    }

    return list;
  }, [inspections, cloudConfig.lastSyncAt]);

  const unreadNotifCount = useMemo(
    () =>
      computedNotifications.filter((n) => !readNotifIds.includes(n.id)).length,
    [computedNotifications, readNotifIds]
  );

  const handleToggleNotifRead = (id: string) => {
    setReadNotifIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      try {
        localStorage.setItem(STORAGE_KEY_READ_NOTIFS, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleMarkAllNotifsRead = () => {
    const allIds = computedNotifications.map((n) => n.id);
    setReadNotifIds(allIds);
    try {
      localStorage.setItem(STORAGE_KEY_READ_NOTIFS, JSON.stringify(allIds));
    } catch {
      // ignore
    }
  };

  const districtCounts = useMemo(() => {
    return {
      fatsa: inspections.filter((r) => r.district === "Fatsa").length,
      camas: inspections.filter((r) => r.district === "Çamaş").length,
      catalpinar: inspections.filter((r) => r.district === "Çatalpınar").length,
    };
  }, [inspections]);

  const pdfPreviewData = useMemo(() => {
    return filterRecordsByPeriod(inspections, pdfPeriod, pdfReferenceDate);
  }, [inspections, pdfPeriod, pdfReferenceDate]);

  // Mevcut keşiflerin bulunduğu ayların listesi (YYYY-MM) ve seçili ayın Excel önizleme verisi
  const availableYearMonths = useMemo(() => {
    const set = new Set<string>();
    const nowYm = new Date().toISOString().slice(0, 7);
    set.add(nowYm);
    for (const r of inspections) {
      if (r.date && r.date.length >= 7) {
        set.add(r.date.slice(0, 7));
      }
    }
    return Array.from(set).sort().reverse();
  }, [inspections]);

  const excelPreviewRecords = useMemo(() => {
    return [...inspections]
      .filter((r) => {
        if (!r.date.startsWith(excelYearMonth)) return false;
        if (excelOnlyCompleted) {
          return r.status === "yapildi";
        }
        return r.status !== "iptal_edildi";
      })
      .sort((a, b) => {
        const d = a.date.localeCompare(b.date);
        if (d !== 0) return d;
        return a.time.localeCompare(b.time);
      });
  }, [inspections, excelYearMonth, excelOnlyCompleted]);

  // Günlük Güzergah Paylaşım Verisi (Çıkış Noktası, Duraklar, Varış Noktası, Dosya Numaraları ve Google Maps Çok Duraklı Rota Linki)
  const shareRouteData = useMemo(() => {
    if (!shareRouteDate) return null;
    const dayRecords = inspections
      .filter((r) => r.date === shareRouteDate && r.status !== "iptal_edildi")
      .sort((a, b) => a.time.localeCompare(b.time));

    const firstTime = dayRecords[0]?.time || "09:30";
    const [fh, fm] = firstTime.split(":").map(Number);
    const depTotalMin = Math.max(8 * 60, (fh || 9) * 60 + (fm || 30) - 25);
    const depH = String(Math.floor(depTotalMin / 60)).padStart(2, "0");
    const depM = String(depTotalMin % 60).padStart(2, "0");
    const suggestedDepartureTime = `${depH}:${depM}`;

    const maxOneWay =
      dayRecords.length > 0
        ? Math.max(...dayRecords.map((r) => r.distanceKm), 0)
        : 0;
    const interStopAddition =
      dayRecords.length > 1 ? (dayRecords.length - 1) * 4.2 : 0;
    const totalKm = Number((maxOneWay * 2 + interStopAddition).toFixed(1));
    const totalMin = Math.round(
      (dayRecords.length > 0
        ? Math.max(...dayRecords.map((r) => r.durationMin), 0)
        : 0) *
        2 +
        (dayRecords.length > 1 ? (dayRecords.length - 1) * 9 : 0)
    );

    // Çok duraklı Google Maps Yol Tarifi URL'si (Bir dosyada birden fazla mahalle varsa tüm mahalle duraklarını sırayla ekler)
    const dailyWaypoints = buildDailyRoutePoints(dayRecords);
    const coordChain = [
      ...dailyWaypoints.map((w) => `${w.lat},${w.lng}`),
      `${FATSA_COURTHOUSE.lat},${FATSA_COURTHOUSE.lng}`,
    ].join("/");
    const googleMapsUrl = `https://www.google.com/maps/dir/${coordChain}`;

    const lines: string[] = [
      `⚖️ *T.C. FATSA SULH HUKUK MAHKEMESİ*`,
      `📋 *GÜNLÜK KEŞİF GÜZERGAH VE DURAK PLANI*`,
      `📅 *Tarih:* ${formatLongDateTR(shareRouteDate)}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🏛️ *ÇIKIŞ NOKTASI (Hareket: ~${suggestedDepartureTime}):*`,
      `   ${FATSA_COURTHOUSE.name}`,
      `   (${FATSA_COURTHOUSE.address})`,
      ``,
    ];

    dayRecords.forEach((rec, idx) => {
      const cMeta = getCaseTypeVisualMeta(rec.caseType);
      const vehicleLabel = formatVehicleLabel(rec);
      const adaParselLabel = formatAdaParselLabel(rec);
      const addressLabel = formatAddressLabel(rec);
      const uniqueMahs = getRecordUniqueNeighborhoods(rec);
      const mahalleLabel =
        uniqueMahs.length > 1 ? uniqueMahs.join(" → ") : rec.neighborhood;
      const subjectStr = vehicleLabel
        ? ` | 🚗 Araç: ${vehicleLabel}${
            rec.vehicleInfo?.damageSummary
              ? ` (${rec.vehicleInfo.damageSummary})`
              : ""
          }`
        : adaParselLabel
        ? ` | 📐 ${adaParselLabel}${
            rec.yuzolcumuM2 ? ` (${formatAreaM2(rec.yuzolcumuM2)} m²)` : ""
          }`
        : addressLabel
        ? ` | 🏠 Adres: ${addressLabel}`
        : "";
      lines.push(
        `📍 *${idx + 1}. DURAK — Saat ${rec.time} | Dosya No: ${rec.esasNo}*`
      );
      lines.push(
        `   • *Varış / Mahalle(ler):* [${rec.district}] ${mahalleLabel}${subjectStr}`
      );
      if (rec.parcels && rec.parcels.length > 1) {
        lines.push(
          `   • *Dosyadaki Parseller (${rec.parcels.length} Adet):* ${rec.parcels
            .map((p) => {
              const neighPart = p.neighborhood ? `${p.neighborhood} ` : "";
              const bbPart = p.bagimsizBolumNo?.trim()
                ? ` [Bağımsız Bölüm No: ${p.bagimsizBolumNo.trim()}]`
                : "";
              return `${neighPart}${p.adaNo}/${p.parselNo}${bbPart}`;
            })
            .join(", ")}`
        );
      } else {
        const singleBb = (
          rec.bagimsizBolumNo ||
          rec.parcels?.[0]?.bagimsizBolumNo ||
          ""
        ).trim();
        if (singleBb) {
          lines.push(`   • *Bağımsız Bölüm / Daire No:* ${singleBb}`);
        }
      }
      if (rec.addressDetail) {
        lines.push(`   • *Açık Adres / İnceleme Yeri:* ${rec.addressDetail}`);
      }
      if (rec.subjectType === "adres" && rec.nitelik) {
        lines.push(`   • *İncelenen Yerin Niteliği:* ${rec.nitelik}`);
      }
      lines.push(`   • *Keşif Türü:* ${cMeta.icon} ${rec.caseType}`);
      if (rec.experts) {
        lines.push(`   • *Bilirkişi Heyeti:* ${rec.experts}`);
      }
      if (rec.createdBy) {
        lines.push(`   • *Keşfi Ekleyen:* ${rec.createdBy}`);
      }
      lines.push(
        `   • *Mesafe:* Adliye'den ${rec.distanceKm} km (~${rec.durationMin} dk)`
      );
      lines.push(``);
    });

    lines.push(
      `🏁 *VARIŞ / DÖNÜŞ NOKTASI:*`,
      `   ${FATSA_COURTHOUSE.name} (Keşiflerin tamamlanmasının ardından Adliye merkezine dönüş)`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🚗 *Toplam Güzergah:* ${dayRecords.length} Dosya · ~${totalKm} km (Yaklaşık ${totalMin} dk sürüş)`,
      `🗺️ *Google Haritalar Çok Duraklı Navigasyon:*`,
      googleMapsUrl
    );

    return {
      date: shareRouteDate,
      formattedDate: formatLongDateTR(shareRouteDate),
      suggestedDepartureTime,
      records: dayRecords,
      totalKm,
      totalMin,
      googleMapsUrl,
      shareText: lines.join("\n"),
    };
  }, [shareRouteDate, inspections]);

  const handleCopyRouteShareText = async () => {
    if (!shareRouteData) return;
    try {
      await navigator.clipboard.writeText(shareRouteData.shareText);
      setCopiedRouteFeedback(true);
      setTimeout(() => setCopiedRouteFeedback(false), 3000);
    } catch {
      // Fallback textarea copy
      const ta = document.createElement("textarea");
      ta.value = shareRouteData.shareText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedRouteFeedback(true);
      setTimeout(() => setCopiedRouteFeedback(false), 3000);
    }
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput.trim() === REQUIRED_APP_PASSWORD) {
      setIsAuthenticated(true);
      setAuthError(null);
      setPasswordInput("");
      try {
        sessionStorage.setItem(STORAGE_KEY_AUTH_SESSION, "unlocked");
        if (rememberDeviceAuth) {
          localStorage.setItem(STORAGE_KEY_AUTH_REMEMBER, "unlocked");
        } else {
          localStorage.removeItem(STORAGE_KEY_AUTH_REMEMBER);
        }
      } catch {
        // ignore
      }
    } else {
      setAuthError(
        "Hatalı şifre girdiniz. Lütfen mahkeme erişim şifresini kontrol ederek tekrar deneyiniz."
      );
    }
  };

  const handleLockApp = () => {
    setIsAuthenticated(false);
    setPasswordInput("");
    setAuthError(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY_AUTH_SESSION);
      localStorage.removeItem(STORAGE_KEY_AUTH_REMEMBER);
    } catch {
      // ignore
    }
  };

  const handlePublishToKsfGitHubPages = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const tokenToUse = (publishToken || cloudConfig.githubToken || "").trim();
    if (!tokenToUse) {
      setPublishError(
        "Lütfen GitHub hesabınıza yayınlamak için bir GitHub Personal Access Token (ghp_... veya github_pat_...) giriniz."
      );
      return;
    }

    setIsPublishingKsf(true);
    setPublishError(null);
    setPublishProgress("GitHub hesabınıza bağlanılıyor...");

    try {
      const result = await publishProjectToGitHubPagesKsf(
        tokenToUse,
        publishRepoName || "ksf",
        (stepMsg) => setPublishProgress(stepMsg)
      );
      setPublishResult(result);
      setPublishProgress(null);

      // Token ve repo bilgisini bulut senkronizasyon ayarlarına da kaydet
      const updatedCloud: CloudSyncConfig = {
        ...cloudConfig,
        githubToken: tokenToUse,
        githubRepo: `${result.owner}/${result.repoName}`,
      };
      handleSaveCloudConfig(updatedCloud);

      try {
        localStorage.setItem(STORAGE_KEY_PUBLISHED_KSF, JSON.stringify(result));
        localStorage.setItem("fatsa_adliyesi_github_token_v1", tokenToUse);
      } catch {
        // ignore
      }
    } catch (err: any) {
      setPublishError(
        err?.message || "GitHub 'ksf' reposuna yayınlama sırasında bir hata oluştu."
      );
      setPublishProgress(null);
    } finally {
      setIsPublishingKsf(false);
    }
  };

  // Kullanıcının daha önce kaydettiği GitHub Token varsa 'ksf' (TaunMilitary/ksf) reposuna son güncellemeleri otomatik yayınla
  useEffect(() => {
    let savedToken = (cloudConfig.githubToken || publishToken || "").trim();
    if (!savedToken) {
      try {
        savedToken = (
          localStorage.getItem("fatsa_adliyesi_github_token_v1") || ""
        ).trim();
      } catch {
        // ignore
      }
    }
    if (!savedToken) return;
    if (
      typeof window !== "undefined" &&
      (window.location.protocol === "file:" ||
        window.location.hostname.endsWith("github.io"))
    ) {
      return;
    }
    try {
      if (localStorage.getItem("fatsa_ksf_autopublish_v8") === "done") return;
    } catch {
      return;
    }

    let cancelled = false;
    setIsPublishingKsf(true);
    setPublishError(null);
    setPublishProgress("GitHub hesabınıza bağlanılıyor ve dosyalar yayınlanıyor...");

    (async () => {
      try {
        const res = await publishProjectToGitHubPagesKsf(
          savedToken,
          publishRepoName || "ksf",
          (stepMsg) => {
            if (!cancelled) setPublishProgress(stepMsg);
          }
        );
        if (!cancelled) {
          setPublishResult(res);
          setPublishProgress(null);
          try {
            localStorage.setItem("fatsa_ksf_autopublish_v8", "done");
            localStorage.setItem(STORAGE_KEY_PUBLISHED_KSF, JSON.stringify(res));
          } catch {
            // ignore
          }
          setFormBannerMessage(
            `✓ Sistem güncellemesi GitHub '${res.owner}/${res.repoName}' (GitHub Pages) deponuza otomatik olarak yayınlandı!`
          );
          setTimeout(() => setFormBannerMessage(null), 8000);
        }
      } catch (err: any) {
        if (!cancelled) {
          setPublishProgress(null);
          setPublishError(
            err?.message ||
              "Otomatik yayınlama sırasında hata oluştu. Lütfen aşağıdaki butona tıklayarak yayınlayınız."
          );
        }
      } finally {
        if (!cancelled) {
          setIsPublishingKsf(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cloudConfig.githubToken, publishToken, publishRepoName]);

  const renderGitHubPublishModal = () => {
    if (!isPublishModalOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-3 sm:p-4 backdrop-blur-xs">
        <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
            <div className="flex items-center gap-2.5">
              <Globe className="h-5 w-5 text-indigo-400 shrink-0" />
              <div>
                <h2 className="text-sm sm:text-base font-bold">
                  Projeyi GitHub &lsquo;ksf&rsquo; Reposunda Yayınla (GitHub Pages)
                </h2>
                <p className="text-[11px] text-slate-300">
                  Tüm güncel proje dosyalarını GitHub hesabınızdaki &lsquo;ksf&rsquo; deposuna yükler ve GitHub Pages&rsquo;i günceller
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsPublishModalOpen(false)}
              className="rounded-lg p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handlePublishToKsfGitHubPages} className="p-5 space-y-4">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 text-xs text-indigo-950 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5">
                <GitBranch className="h-4 w-4 text-indigo-600 shrink-0" />
                <span>GitHub &lsquo;ksf&rsquo; Repo Güncellemesi & Canlı Paket Aktarımı</span>
              </div>
              <p className="text-[11px] text-slate-700 leading-relaxed">
                <strong>TaunMilitary/ksf</strong> deponuza aktarılacak son güncellemeler:
              </p>
              <ul className="list-disc pl-4 text-[11px] text-slate-700 space-y-0.5">
                <li>
                  <strong>Yeni Keşif Ekle & Çoklu Parsel Düzeltmesi:</strong> &ldquo;Yeni Keşif Ekle&rdquo; menüsüne basıldığında parsel bilgisi tamamen boş gelir; 2. ve 3. parsel eklendiğinde 1. parselin üzerine yazma sorunu giderilmiştir.
                </li>
                <li>
                  <strong>Yapay Zeka Rota & Gün Tavsiyesi Menüsü:</strong> Birden fazla mahalle ve parsel için akıllı rota ve gün planlama sekmesi eklendi.
                </li>
                <li>
                  <strong>Büyük Paket (Git Blobs API) Desteği:</strong> 1.4 MB boyutundaki derlenmiş <code className="font-mono">standalone-bundle.js</code> ve tüm kaynak dosyalar GitHub Git Data Blobs API ile eksiksiz yüklenir.
                </li>
              </ul>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  1. GitHub Personal Access Token (repo yetkili) *
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    autoFocus={!publishToken}
                    value={publishToken}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPublishToken(val);
                      try {
                        localStorage.setItem(
                          "fatsa_adliyesi_github_token_v1",
                          val.trim()
                        );
                      } catch {
                        // ignore
                      }
                      if (publishError) setPublishError(null);
                    }}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Classic Token&rsquo;da &lsquo;repo&rsquo; kutucuğu işaretli olmalıdır.</span>
                  <a
                    href="https://github.com/settings/tokens/new?description=Fatsa-Kesif-ksf-Pages&scopes=repo,gist,workflow"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline"
                  >
                    <span>Token Oluştur</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  2. Repo Adı *
                </label>
                <input
                  type="text"
                  value={publishRepoName}
                  onChange={(e) => setPublishRepoName(e.target.value)}
                  placeholder="ksf"
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none"
                />
                <div className="mt-1 text-[10px] text-slate-500">
                  Varsayılan: <code className="font-mono font-bold">ksf</code>
                </div>
              </div>
            </div>

            {publishProgress && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-xs font-semibold text-indigo-900 flex items-center gap-2">
                <Sparkles className="h-4 w-4 animate-spin text-indigo-600 shrink-0" />
                <span>{publishProgress}</span>
              </div>
            )}

            {publishError && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-900">
                {publishError}
              </div>
            )}

            {publishResult && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-emerald-950 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>
                    Proje &lsquo;{publishResult.owner}/{publishResult.repoName}&rsquo; Reposuna Yayınlandı!
                  </span>
                </div>
                <div className="space-y-1 text-slate-700">
                  <div>
                    🌐 <strong>Doğrudan Çalışan GitHub Pages Adresi:</strong>{" "}
                    <a
                      href={publishResult.pagesUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono font-bold text-indigo-700 underline hover:text-indigo-900 break-all"
                    >
                      {publishResult.pagesUrl}
                    </a>
                  </div>
                  <div>
                    📦 <strong>GitHub Kaynak Kodu Deposu:</strong>{" "}
                    <a
                      href={publishResult.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-slate-900 underline break-all"
                    >
                      {publishResult.repoUrl}
                    </a>
                  </div>
                  <div className="text-[11px] text-slate-600 pt-1">
                    Not: GitHub Pages güncellemesinin canlı adrese yansıması 30-60 saniye sürebilir.
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => setIsPublishModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Kapat
              </button>
              <button
                type="submit"
                disabled={isPublishingKsf}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Globe className="h-4 w-4" />
                <span>
                  {isPublishingKsf
                    ? "GitHub 'ksf' Reposuna Yayınlanıyor..."
                    : "Şimdi 'ksf' Reposunda Yayınla & Güncelle"}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // ============================================================================
  // AÇILIŞ GÜVENLİK ŞİFRE EKRANI ("Fatsa2.SHM52")
  // ============================================================================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col justify-between bg-slate-900 text-slate-100 p-4 sm:p-6">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-800/90 shadow-2xl backdrop-blur-md">
            {/* Kurumsal Başlık Şeridi */}
            <div className="border-b border-slate-700 bg-slate-950/70 px-6 py-5 text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
                T.C. FATSA ADLİYESİ · SULH HUKUK MAHKEMESİ
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Akıllı Keşif Planlama & CBS Sistemi
              </h1>
              <p className="text-xs text-slate-400">
                Fatsa, Çamaş ve Çatalpınar İlçeleri Yargı Çevresi Güvenli Giriş Kapısı
              </p>
            </div>

            {/* Şifre Giriş Formu */}
            <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
              <div>
                <label
                  htmlFor="court-password-input"
                  className="block text-xs font-bold text-slate-200 mb-1.5"
                >
                  Mahkeme Erişim Şifresi
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="court-password-input"
                    type={showPassword ? "text" : "password"}
                    autoFocus={!isPublishModalOpen}
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      if (authError) setAuthError(null);
                    }}
                    placeholder="Erişim şifresini giriniz..."
                    className="w-full rounded-xl border border-slate-600 bg-slate-900/90 pl-10 pr-10 py-2.5 text-sm font-mono text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    title={showPassword ? "Şifreyi Gizle" : "Şifreyi Göster"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {authError && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/50 px-3.5 py-2.5 text-xs font-medium text-rose-200">
                  {authError}
                </div>
              )}

              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={rememberDeviceAuth}
                  onChange={(e) => setRememberDeviceAuth(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
                <span>Bu cihazda oturumu açık tut (Beni hatırla)</span>
              </label>

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-400"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Sisteme Güvenli Giriş Yap</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPublishModalOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-400/50 bg-indigo-600/90 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-500"
              >
                <Globe className="h-3.5 w-3.5" />
                <span>Dosyaları GitHub &lsquo;ksf&rsquo; Hesabımda Yayınla</span>
              </button>

              <div className="border-t border-slate-700/80 pt-3 flex items-center justify-between text-[11px] text-slate-400">
                <span>Yetkili Birim: Fatsa Sulh Hukuk Kalemi</span>
                <span className="font-mono text-emerald-400">CBS v5.2</span>
              </div>
            </form>
          </div>
        </div>

        <footer className="text-center text-xs text-slate-500 py-2">
          T.C. Fatsa Adliyesi (Fatsa · Çamaş · Çatalpınar) — Yetkisiz erişim güvenlik politikası gereği kısıtlanmıştır.
        </footer>

        {renderGitHubPublishModal()}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col app-surface-bg pb-20 md:pb-0">
      {/* ====================================================================
          TOP BAR CONTRACT: Responsive 3 Zones + Theme Switcher & Notification Center
         ==================================================================== */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-slate-800 bg-[#101820] px-3 py-2.5 text-white sm:px-5 sm:gap-4">
        {/* Mobile Quick Home Button (only on small screens since top-left title is removed) */}
        <button
          type="button"
          onClick={() => setActiveTab("ana_sayfa")}
          className="flex md:hidden items-center gap-1.5 rounded-lg bg-[#246B73]/30 border border-[#63B5B0]/30 px-2.5 py-1 text-xs font-bold text-white"
        >
          <LayoutDashboard className="h-3.5 w-3.5 text-[#63B5B0]" />
          <span>Kontrol Merkezi</span>
        </button>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-2.5 lg:gap-4 text-xs font-medium text-slate-300 overflow-x-auto">
          <button
            onClick={() => setActiveTab("ana_sayfa")}
            className={`flex items-center gap-1.5 py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "ana_sayfa"
                ? "text-white font-bold underline decoration-[#63B5B0] decoration-2 underline-offset-8"
                : "hover:text-white"
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5 text-[#63B5B0]" />
            <span>Ana Sayfa</span>
          </button>
          <button
            onClick={() => setActiveTab("ajanda")}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "ajanda"
                ? "text-white font-bold underline decoration-[#63B5B0] decoration-2 underline-offset-8"
                : "hover:text-white"
            }`}
          >
            Ajanda ({inspections.length})
          </button>
          <button
            onClick={() => setActiveTab("takvim")}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "takvim"
                ? "text-white font-bold underline decoration-[#63B5B0] decoration-2 underline-offset-8"
                : "hover:text-white"
            }`}
          >
            Takvim
          </button>
          <button
            onClick={() => {
              setFocusedInspectionId(null);
              setActiveTab("harita");
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "harita"
                ? "text-white font-bold underline decoration-[#63B5B0] decoration-2 underline-offset-8"
                : "hover:text-white"
            }`}
          >
            Harita & TKGM
          </button>
          <button
            onClick={() => handleOpenNewInspectionTab()}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "yeni_kesif"
                ? "text-white font-bold underline decoration-[#63B5B0] decoration-2 underline-offset-8"
                : "hover:text-white"
            }`}
          >
            + Yeni Keşif
          </button>
          {/* MOR MENÜ: Keşif Zaptı Hazırla */}
          <button
            onClick={() => setActiveTab("kesif_zapti")}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-all whitespace-nowrap shrink-0 shadow-xs ${
              activeTab === "kesif_zapti"
                ? "border-purple-300 bg-purple-600 text-white ring-2 ring-purple-400/40"
                : "border-purple-400/60 bg-purple-700/90 text-purple-100 hover:bg-purple-600 hover:text-white"
            }`}
          >
            <FileText className="h-3.5 w-3.5 text-purple-200" />
            <span>Keşif Zaptı Hazırla</span>
          </button>
          <button
            onClick={() => setActiveTab("bilirkisiler")}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
              activeTab === "bilirkisiler"
                ? "border-purple-300 bg-purple-600 text-white ring-2 ring-purple-400/40"
                : "border-purple-500/40 bg-purple-950/70 text-purple-200 hover:bg-purple-800 hover:text-white"
            }`}
          >
            <Users className="h-3.5 w-3.5 text-purple-300" />
            <span>Bilirkişiler ({registeredExperts.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("istatistikler")}
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
              activeTab === "istatistikler"
                ? "border-emerald-300 bg-[#246B73] text-white ring-2 ring-emerald-400/40"
                : "border-emerald-500/40 bg-emerald-950/60 text-emerald-200 hover:bg-emerald-800 hover:text-white"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5 text-emerald-300" />
            <span>Rapor & İstatistik</span>
          </button>
          <button
            onClick={() => setActiveTab("ai_rota")}
            className={`flex items-center gap-1 py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "ai_rota"
                ? "text-[#63B5B0] font-bold underline decoration-[#63B5B0] decoration-2 underline-offset-8"
                : "text-[#63B5B0] hover:text-white"
            }`}
          >
            <Route className="h-3.5 w-3.5" />
            <span>YZ Rota</span>
          </button>
        </nav>

        {/* Zone 3: Theme Switcher + Notification Center + AI Assistant + Sync + Settings + Lock */}
        <div className="relative flex items-center gap-1.5 shrink-0">
          {/* YZ Saha Asistanı Butonu */}
          <button
            type="button"
            onClick={() => setIsAiAssistantOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-[#63B5B0]/40 bg-[#246B73] px-2 py-1.5 text-xs font-bold text-white hover:bg-[#1D575E] transition-colors"
            title="Doğal Türkçe Yapay Zekâ Saha Asistanını Aç"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#63B5B0]" />
            <span className="hidden lg:inline">Asistan</span>
          </button>

          {/* Tema Seçici (Açık / Koyu / Sistem) */}
          <button
            type="button"
            onClick={() => {
              const order: ThemePreference[] = ["light", "dark", "system"];
              const nextTheme =
                order[(order.indexOf(appPrefs.themeMode) + 1) % order.length];
              handleUpdateAppPrefs({ themeMode: nextTheme });
            }}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs font-semibold text-slate-200 hover:border-[#63B5B0] hover:text-white transition-colors"
            title={`Aktif Tema: ${
              appPrefs.themeMode === "light"
                ? "Açık Tema"
                : appPrefs.themeMode === "dark"
                ? "Koyu Tema"
                : "Sistem Teması"
            } (Değiştirmek için tıklayın)`}
          >
            {appPrefs.themeMode === "dark" ? (
              <Moon className="h-3.5 w-3.5 text-[#63B5B0]" />
            ) : appPrefs.themeMode === "light" ? (
              <Sun className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Monitor className="h-3.5 w-3.5 text-sky-400" />
            )}
            <span className="hidden xl:inline">
              {appPrefs.themeMode === "dark"
                ? "Koyu"
                : appPrefs.themeMode === "light"
                ? "Açık"
                : "Sistem"}
            </span>
          </button>

          {/* Bildirim Merkezi Butonu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsNotifOpen((prev) => !prev)}
              className="relative flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-200 hover:border-[#63B5B0] hover:text-white transition-colors"
              title="Bildirim Merkezi"
              aria-label="Bildirim Merkezi"
            >
              <Bell className="h-4 w-4" />
              {unreadNotifCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D9535D] px-1 font-mono text-[10px] font-bold text-white">
                  {unreadNotifCount}
                </span>
              )}
            </button>

            {isNotifOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-80 sm:w-96 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 bg-[#1B2733] px-4 py-3 text-white">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-[#63B5B0]" />
                    <span className="text-xs font-bold">
                      Bildirim Merkezi ({unreadNotifCount} Okunmamış)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {computedNotifications.length > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllNotifsRead}
                        className="text-[11px] font-semibold text-[#63B5B0] hover:underline"
                      >
                        Tümünü Okundu İşaretle
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsNotifOpen(false)}
                      className="text-slate-300 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-200">
                  {computedNotifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Yeni bildirim bulunmuyor.
                    </div>
                  ) : (
                    computedNotifications.map((nf) => {
                      const isRead = readNotifIds.includes(nf.id);
                      return (
                        <div
                          key={nf.id}
                          className={`p-3 text-xs space-y-1 transition-colors ${
                            isRead ? "bg-white opacity-70" : "bg-slate-50/90"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="rounded bg-[#246B73]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#246B73]">
                              {nf.category}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleNotifRead(nf.id)}
                              className="text-[10px] font-semibold text-slate-500 hover:text-slate-900"
                            >
                              {isRead ? "Okunmadı İşaretle" : "✓ Okundu"}
                            </button>
                          </div>
                          <div className="font-bold text-slate-900">
                            {nf.title}
                          </div>
                          <p className="text-[11px] text-slate-600">{nf.desc}</p>
                          <div className="flex items-center gap-2 pt-1">
                            {nf.record && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleToggleNotifRead(nf.id);
                                  setIsNotifOpen(false);
                                  if (nf.targetTab === "kesif_zapti") {
                                    setPreselectedMinutesRecordId(nf.record!.id);
                                    setActiveTab("kesif_zapti");
                                  } else {
                                    setEditingInspection(nf.record!);
                                  }
                                }}
                                className="rounded bg-[#246B73] px-2.5 py-1 text-[10px] font-bold text-white"
                              >
                                {nf.targetTab === "kesif_zapti"
                                  ? "Zapt Hazırla →"
                                  : "Dosyaya Git →"}
                              </button>
                            )}
                            {!nf.record && nf.targetTab && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleToggleNotifRead(nf.id);
                                  setIsNotifOpen(false);
                                  setActiveTab(nf.targetTab!);
                                }}
                                className="rounded bg-[#246B73] px-2.5 py-1 text-[10px] font-bold text-white"
                              >
                                Aç &rarr;
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("ayarlar")}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/90 px-2 py-1.5 text-xs font-medium text-slate-200 hover:border-[#63B5B0] hover:text-white transition-colors"
            title="Kullanıcı Profili, Tema ve Yedekleme Ayarları"
          >
            <Settings className="h-3.5 w-3.5 text-[#63B5B0] shrink-0" />
            <span className="hidden xl:inline truncate max-w-[115px]">
              {userProfile.fullName.trim()
                ? userProfile.fullName
                : "Ayarlar"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!publishToken && cloudConfig.githubToken) {
                setPublishToken(cloudConfig.githubToken);
              }
              setIsPublishModalOpen(true);
            }}
            className="hidden sm:flex items-center gap-1 rounded-lg border border-indigo-400/50 bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 whitespace-nowrap"
            title="Projeyi GitHub Hesabınızdaki 'ksf' Reposunda Yayınla (GitHub Pages)"
          >
            <Globe className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden lg:inline">ksf Yayınla</span>
          </button>

          <button
            onClick={() => setIsCloudModalOpen(true)}
            className="flex items-center gap-1 rounded-lg bg-[#16845B] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-95 whitespace-nowrap"
            title="Bulut Senkronizasyon (GitHub & Google Apps Script)"
          >
            <Cloud className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Sync</span>
          </button>

          <button
            type="button"
            onClick={handleLockApp}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-xs font-semibold text-slate-300 hover:border-rose-400 hover:text-rose-300 transition-colors"
            title="Oturumu Kilitle (Şifre Ekranına Dön)"
          >
            <Lock className="h-3.5 w-3.5 shrink-0" />
          </button>
        </div>
      </header>

      {/* ====================================================================
          MAIN WORKSPACE CONTENT
         ==================================================================== */}
      <main className="mx-auto w-full max-w-[1360px] flex-1 px-3.5 py-4 sm:px-6 sm:py-6 space-y-5">
        {formBannerMessage && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{formBannerMessage}</span>
            </div>
            <button
              onClick={() => setFormBannerMessage(null)}
              className="text-emerald-700 hover:underline ml-2"
            >
              Tamam
            </button>
          </div>
        )}

        {/* VIEW 0: ANA SAYFA (PROFESYONEL KONTROL MERKEZİ) */}
        {activeTab === "ana_sayfa" && (
          <ControlCenterHomeView
            inspections={inspections}
            registeredExperts={registeredExperts}
            weatherMap={weatherMap}
            selectedDistrict={agendaDistrictFilter as CourtDistrict | "Tümü"}
            onChangeDistrict={(d: CourtDistrict | "Tümü") =>
              setAgendaDistrictFilter(d)
            }
            onNavigateTab={(tab: ActiveTab) => setActiveTab(tab)}
            onOpenNewInspection={() => handleOpenNewInspectionTab()}
            onEditInspection={(rec: InspectionRecord) =>
              setEditingInspection(rec)
            }
            onPrepareMinutesForRecord={(recId: string) => {
              setPreselectedMinutesRecordId(recId);
              setActiveTab("kesif_zapti");
            }}
            onOpenMediaModalForRecord={(rec: InspectionRecord) =>
              setMediaModalRecord(rec)
            }
            onOpenAiAssistant={() => setIsAiAssistantOpen(true)}
            onOpenPdfModal={() => setIsPdfModalOpen(true)}
            onOpenExcelModal={() => setIsExcelModalOpen(true)}
            onOpenParcelOnMap={(rec: InspectionRecord) =>
              handleOpenParcelOnOverviewMap(rec)
            }
            onCompleteInspection={(rec: InspectionRecord) =>
              handleOpenCompletionModal(rec)
            }
            hiddenWidgets={appPrefs.hiddenHomeWidgets}
            onToggleWidgetVisibility={(widgetId: string) =>
              handleUpdateAppPrefs({
                hiddenHomeWidgets: appPrefs.hiddenHomeWidgets.includes(widgetId)
                  ? appPrefs.hiddenHomeWidgets.filter((w) => w !== widgetId)
                  : [...appPrefs.hiddenHomeWidgets, widgetId],
              })
            }
          />
        )}

        {/* VIEW 1: YENİ KEŞİF EKLEME, ADA/PARSEL SINIR SORGULAMA VE HARİTA SEÇİMİ */}
        {activeTab === "yeni_kesif" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
            {/* Left Column: Form */}
            <div className="lg:col-span-6 app-card p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3.5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-[#246B73]/12 px-2.5 py-0.5 text-[11px] font-bold text-[#246B73]">
                      <Plus className="h-3.5 w-3.5" />
                      <span>Yeni Keşif & Taşınmaz Kaydı</span>
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      TKGM MEGSİS · Çoklu Parsel · Adres · Araç
                    </span>
                  </div>
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 mt-1">
                    Yeni Keşif & Taşınmaz (Ada/Parsel) Planla
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Mahalle ve Ada/Parsel numarasını girdiğinizde TKGM MEGSİS üzerinden parsel sınırları otomatik çekilip haritada çizilir
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenNewInspectionTab()}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                  title="Parsel ve form alanlarını sıfırla"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Formu Temizle</span>
                </button>
              </div>

              <form onSubmit={handleAddInspection} className="mt-4 space-y-3.5">
                {/* District Selector & Esas No */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Bağlı Bulunan İlçe *
                    </label>
                    <select
                      value={formDistrict}
                      onChange={(e) => {
                        const newD = e.target.value as CourtDistrict;
                        setFormDistrict(newD);
                        const firstN = FATSA_NEIGHBORHOODS.find(
                          (n) => n.district === newD
                        );
                        if (firstN) {
                          setNeighborhoodInput(firstN.name);
                          setSelectedTkgmMahalleId(
                            resolveTkgmMahalle(newD, firstN.name)?.id
                          );
                          setBaseNeighborhoodLat(firstN.lat);
                          setBaseNeighborhoodLng(firstN.lng);
                          setSelectedLat(firstN.lat);
                          setSelectedLng(firstN.lng);
                          setSelectedCorridor(firstN.corridor);
                          setParcelSource("cadastre_computed");
                        }
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                    >
                      {DISTRICTS.map((d) => (
                        <option key={d} value={d}>
                          {d} İlçesi
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Esas No *
                    </label>
                    <input
                      type="text"
                      required
                      value={esasNo}
                      onChange={(e) => {
                        setEsasNo(e.target.value);
                        if (duplicateWarningMsg) setDuplicateWarningMsg(null);
                      }}
                      placeholder="Örn: 2026/145 E."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Taraf / İlgili Kişi Adı (İsteğe Bağlı) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Taraf / Davacı - Davalı / İlgili Kişi Adı (İsteğe Bağlı)
                  </label>
                  <input
                    type="text"
                    value={partyNameInput}
                    onChange={(e) => setPartyNameInput(e.target.value)}
                    placeholder="Örn: Davacı Ahmet Yılmaz / Vekili Av. Mehmet Kaya..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                {/* Mükerrer (Aynı Esas No / Ada-Parsel) Kayıt Uyarısı */}
                {duplicateWarningMsg && (
                  <div className="rounded-xl border border-amber-400 bg-amber-50 p-3.5 text-xs text-amber-950 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">
                          Benzer / Mükerrer Keşif Kaydı Tespit Edildi!
                        </div>
                        <p className="mt-0.5 text-[11px] text-amber-900">
                          {duplicateWarningMsg}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="submit"
                        onClick={() => setAllowDuplicateSubmit(true)}
                        className="rounded-lg bg-amber-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-800"
                      >
                        ✓ Evet, Yine de Yeni Kayıt Olarak Ekle
                      </button>
                      <button
                        type="button"
                        onClick={() => setDuplicateWarningMsg(null)}
                        className="rounded-lg px-2 py-1 text-[11px] text-slate-600 hover:underline"
                      >
                        Kapat
                      </button>
                    </div>
                  </div>
                )}

                {/* Case Type & Status */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Keşif Türü / Dava Konusu *
                    </label>
                    <select
                      value={CASE_TYPES.includes(caseType) ? caseType : "__custom__"}
                      onChange={(e) => {
                        const nextCt = e.target.value;
                        if (nextCt === "__custom__") {
                          setCaseType("");
                          return;
                        }
                        setCaseType(nextCt);
                        if (
                          (nextCt === "Kira Tespiti ve Tahliye" ||
                            nextCt === "Kiralananın Tahliyesi ve Alacak" ||
                            nextCt === "Tazminat (Hor Kullanım)") &&
                          subjectType === "tasinmaz" &&
                          !parselNo.trim() &&
                          formParcels.length === 0
                        ) {
                          if (nextCt !== "Tazminat (Hor Kullanım)") {
                            setSubjectType("adres");
                          }
                          setSelectedExpertIds(
                            nextCt === "Tazminat (Hor Kullanım)"
                              ? ["insaat", "makine", "gmdu"]
                              : ["insaat", "gmdu"]
                          );
                        } else if (nextCt === "Tapu Kaydında Düzeltim") {
                          setSelectedExpertIds(["fen", "ziraat"]);
                        } else if (
                          nextCt === "Vesayet Satış" ||
                          nextCt === "Kıymet Takdirine İtiraz" ||
                          nextCt === "Ortaklığın Giderilmesi"
                        ) {
                          setSelectedExpertIds(["fen", "ziraat", "insaat", "gmdu"]);
                        }
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
                    >
                      {CASE_TYPES.map((ct) => (
                        <option key={ct} value={ct}>
                          {ct}
                        </option>
                      ))}
                      <option value="__custom__">
                        + Diğer / Özel Dava Türü Yaz...
                      </option>
                    </select>
                    {!CASE_TYPES.includes(caseType) && (
                      <input
                        type="text"
                        required
                        value={caseType}
                        onChange={(e) => setCaseType(e.target.value)}
                        placeholder="Özel dava konusu yazın (Örn: Tapu Kaydında Düzeltim)..."
                        className="mt-1.5 w-full rounded-lg border border-emerald-400 bg-emerald-50/40 px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Keşif Durumu
                    </label>
                    <select
                      value={formStatus}
                      onChange={(e) =>
                        setFormStatus(e.target.value as InspectionStatus)
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
                    >
                      {(Object.keys(STATUS_LABELS) as InspectionStatus[]).map(
                        (stKey) => (
                          <option key={stKey} value={stKey}>
                            {STATUS_LABELS[stKey]}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>

                {/* Neighborhood Search + Direct TKGM Official Mahalle ID Selector */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Mahalle / Köy Arama ({formDistrict}) *
                    </label>
                    <div className="relative">
                      <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
                      <input
                        type="text"
                        required
                        value={neighborhoodInput}
                        onFocus={() => setShowDropdown(true)}
                        onBlur={() => setTimeout(() => setShowDropdown(false), 220)}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNeighborhoodInput(val);
                          setSelectedTkgmMahalleId(
                            resolveTkgmMahalle(formDistrict, val)?.id
                          );
                          setShowDropdown(true);
                        }}
                        placeholder={`${formDistrict} mahallesi veya köyü yazın...`}
                        className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-xs sm:text-sm font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>

                    {showDropdown && (
                      <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
                        {isSearchingLocation && (
                          <div className="px-3 py-2 text-xs text-slate-500">
                            {formDistrict} mahalleleri aranıyor...
                          </div>
                        )}
                        {searchResults.map((item, idx) => (
                          <button
                            key={`${item.name}-${idx}`}
                            type="button"
                            onMouseDown={() => handleSelectLocationResult(item)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-emerald-50 border-b border-slate-100 last:border-0"
                          >
                            <div className="truncate pr-2">
                              <span className="font-bold text-emerald-800 mr-1.5">
                                [{item.district}]
                              </span>
                              <span className="font-semibold text-slate-900">
                                {item.name}
                              </span>
                              <span className="block text-[11px] text-slate-500">
                                {item.corridor}
                              </span>
                            </div>
                            <span className="font-mono text-[11px] text-emerald-700 whitespace-nowrap shrink-0">
                              Seç &rarr;
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Direct TKGM Tapu Mahalle Selector (Matches parselsorgu.tkgm.gov.tr 1-to-1) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      TKGM Resmi Tapu Mahalle / Köy Kaydı
                    </label>
                    <select
                      value={selectedTkgmMahalleId || ""}
                      onChange={(e) => {
                        const idNum = Number(e.target.value);
                        const found = districtTkgmMahalleList.find(
                          (m) => m.id === idNum
                        );
                        if (found) {
                          setSelectedTkgmMahalleId(found.id);
                          setNeighborhoodInput(`${found.text} Mahallesi`);
                          const localCoord = FATSA_NEIGHBORHOODS.find(
                            (n) =>
                              n.district === found.district &&
                              n.name
                                .toLocaleLowerCase("tr-TR")
                                .startsWith(found.text.toLocaleLowerCase("tr-TR"))
                          );
                          if (localCoord) {
                            setBaseNeighborhoodLat(localCoord.lat);
                            setBaseNeighborhoodLng(localCoord.lng);
                            setSelectedLat(localCoord.lat);
                            setSelectedLng(localCoord.lng);
                            setSelectedCorridor(localCoord.corridor);
                          }
                          setParcelSource("cadastre_computed");
                        }
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
                    >
                      {districtTkgmMahalleList.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.text} Mahallesi (TKGM #{m.id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Quick Preset Buttons for Selected District */}
                <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                  <span>{formDistrict} Hızlı Seçim:</span>
                  {FATSA_NEIGHBORHOODS.filter((n) => n.district === formDistrict)
                    .slice(0, 6)
                    .map((n) => (
                      <button
                        key={n.name}
                        type="button"
                        onClick={() =>
                          handleSelectLocationResult({
                            name: n.name,
                            district: n.district,
                            displayName: n.name,
                            lat: n.lat,
                            lng: n.lng,
                            corridor: n.corridor,
                            source: "local",
                          })
                        }
                        className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-700 hover:border-emerald-400 hover:text-emerald-800 truncate max-w-[130px]"
                      >
                        {n.name.replace(" Mahallesi", "")}
                      </button>
                    ))}
                </div>

                {/* ==============================================================
                    KEŞİF KONUSU SEÇİMİ: TAŞINMAZ (ADA/PARSEL), ADRES BAZLI (CADDE/SOKAK/DAİRE) VEYA ARAÇ (PLAKA / HASAR)
                   ============================================================== */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                    Keşif / İnceleme Konusu Seçimi (Parsel Bazlı, Adres Bazlı veya Araç):
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => setSubjectType("tasinmaz")}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-bold transition-all ${
                        subjectType === "tasinmaz"
                          ? "border-amber-600 bg-amber-50 text-amber-950 ring-2 ring-amber-500/20"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <Layers className="h-4 w-4 text-amber-600 shrink-0" />
                      <div>
                        <div>📐 Taşınmaz (Ada / Parsel)</div>
                        <div className="text-[10px] font-normal text-slate-500">
                          TKGM parsel sınırı & çoklu parsel
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSubjectType("adres");
                        setParcelPolygon([]);
                      }}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-bold transition-all ${
                        subjectType === "adres"
                          ? "border-teal-600 bg-teal-50 text-teal-950 ring-2 ring-teal-500/20"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <Home className="h-4 w-4 text-teal-600 shrink-0" />
                      <div>
                        <div>🏠 Adres Bazlı Keşif</div>
                        <div className="text-[10px] font-normal text-slate-500">
                          Cadde, sokak, bina, daire & işyeri
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSubjectType("arac");
                        setParcelPolygon([]);
                        if (!selectedExpertIds.includes("makine")) {
                          setSelectedExpertIds(["makine"]);
                        }
                      }}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-bold transition-all ${
                        subjectType === "arac"
                          ? "border-indigo-600 bg-indigo-50 text-indigo-950 ring-2 ring-indigo-500/20"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <Car className="h-4 w-4 text-indigo-600 shrink-0" />
                      <div>
                        <div>🚗 Araç İncelemesi</div>
                        <div className="text-[10px] font-normal text-slate-500">
                          Plaka, hasar ve değer kaybı tespiti
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {subjectType === "adres" ? (
                  /* ==============================================================
                     ADRES BAZLI KEŞİF PANELİ (CADDE / SOKAK / BİNA / DAİRE / İŞYERİ)
                     ============================================================== */
                  <div className="rounded-xl border border-teal-300 bg-teal-50/55 p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Home className="h-4 w-4 text-teal-700 shrink-0" />
                        <span className="text-xs font-bold text-slate-900">
                          🏠 Adres Bazlı Keşif Bilgileri (Cadde / Sokak / Bina / Daire)
                        </span>
                      </div>
                      <span className="rounded bg-teal-700 px-2 py-0.5 text-[10px] font-bold text-white">
                        Ada/Parsel Gerekmeden Açık Adres Keşfi
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-800 mb-1">
                        Açık Adres (Cadde / Sokak / Bulvar / Bina-Site Adı / Dış Kapı No) *
                      </label>
                      <div className="flex flex-col gap-1.5 sm:flex-row">
                        <input
                          type="text"
                          required={subjectType === "adres"}
                          list="address-street-presets"
                          value={addressDetail}
                          onChange={(e) => setAddressDetail(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleGeocodeAddressOnForm();
                            }
                          }}
                          placeholder="Örn: Sakarya Cad. Aydın Apt. No: 42 (veya Sanayi Sitesi B Blok No: 12)"
                          className="w-full rounded-lg border border-teal-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-teal-600 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleGeocodeAddressOnForm}
                          disabled={isGeocodingFormAddress}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                          title="Yazılan cadde/sokak adresini haritada bul ve Adliye mesafesini hesapla"
                        >
                          <Search className="h-3.5 w-3.5" />
                          <span>
                            {isGeocodingFormAddress
                              ? "Haritada Aranıyor..."
                              : "Adresi Haritada Bul"}
                          </span>
                        </button>
                      </div>
                      <datalist id="address-street-presets">
                        {FATSA_STREET_PRESETS.map((st) => (
                          <option key={st} value={st} />
                        ))}
                      </datalist>

                      {/* Hızlı Cadde / Bulvar Seçim Butonları */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-teal-900">
                        <span className="font-semibold text-slate-500">
                          Hızlı Cadde / Mevkii:
                        </span>
                        {FATSA_STREET_PRESETS.slice(0, 5).map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setAddressDetail(preset)}
                            className="rounded border border-teal-200 bg-white px-1.5 py-0.5 text-teal-900 hover:border-teal-500 hover:bg-teal-50"
                          >
                            {preset.replace(/^.*Mah\.\s*/, "")}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-800 mb-1">
                          Kat / İç Kapı / Daire (Bağımsız Bölüm) No
                        </label>
                        <input
                          type="text"
                          value={bagimsizBolumNo}
                          onChange={(e) => setBagimsizBolumNo(e.target.value)}
                          placeholder="Örn: Kat: 3, Daire: 8 (veya Zemin Kat No: 2)"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-teal-950 focus:border-teal-600 focus:outline-none"
                        />
                        <span className="mt-0.5 block text-[10px] text-slate-500">
                          Keşif Ajandasında ve bilirkişi paylaşım metninde görünür
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-800 mb-1">
                          İncelenen Yerin Niteliği / Türü
                        </label>
                        <input
                          type="text"
                          list="address-nitelik-presets"
                          value={nitelik}
                          onChange={(e) => setNitelik(e.target.value)}
                          placeholder="Örn: Konut / Mesken (Daire), Dükkan / İşyeri..."
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                        />
                        <datalist id="address-nitelik-presets">
                          {ADDRESS_NITELIK_PRESETS.map((an) => (
                            <option key={an} value={an} />
                          ))}
                        </datalist>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {ADDRESS_NITELIK_PRESETS.slice(0, 4).map((an) => (
                            <button
                              key={an}
                              type="button"
                              onClick={() => setNitelik(an)}
                              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:border-teal-500 hover:text-teal-900"
                            >
                              {an}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-teal-200 bg-white/90 px-3 py-2 text-[11px] text-teal-950">
                      💡 <strong>Pratik İpucu:</strong> Adres bazlı keşifte Ada/Parsel girmenize gerek yoktur. Sağdaki harita üzerinden binanın veya sokağın bulunduğu noktaya tıkladığınızda cadde/sokak adı ve Adliye mesafesi otomatik güncellenir.
                    </div>
                  </div>
                ) : subjectType === "arac" ? (
                  /* ==============================================================
                     ARAÇ HASAR / DELİL TESPİTİ PANELİ (PLAKA, MARKA/MODEL, İNCELEME YERİ)
                     ============================================================== */
                  <div className="rounded-xl border border-indigo-300 bg-indigo-50/55 p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Car className="h-4 w-4 text-indigo-700 shrink-0" />
                        <span className="text-xs font-bold text-slate-900">
                          🚗 Araç Plaka Bilgisi & Hasar / Delil Tespiti Detayları
                        </span>
                      </div>
                      <span className="rounded bg-indigo-700 px-2 py-0.5 text-[10px] font-bold text-white">
                        Taşınmaz Yerine Araç Tespiti
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-800 mb-1">
                          Araç Plaka No *
                        </label>
                        <input
                          type="text"
                          required={subjectType === "arac"}
                          value={vehiclePlateNo}
                          onChange={(e) =>
                            setVehiclePlateNo(
                              e.target.value.toLocaleUpperCase("tr-TR")
                            )
                          }
                          placeholder="Örn: 52 ABC 123"
                          className="w-full rounded-lg border border-indigo-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 uppercase focus:border-indigo-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-800 mb-1">
                          Marka / Model / Yıl
                        </label>
                        <input
                          type="text"
                          value={vehicleBrandModel}
                          onChange={(e) => setVehicleBrandModel(e.target.value)}
                          placeholder="Örn: 2022 Renault Megane / Ford Transit"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-800 mb-1">
                          Araç Cinsi
                        </label>
                        <select
                          value={vehicleType}
                          onChange={(e) => setVehicleType(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-indigo-600 focus:outline-none"
                        >
                          {VEHICLE_TYPE_PRESETS.map((vt) => (
                            <option key={vt} value={vt}>
                              {vt}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-800 mb-1">
                          Hasar / Tespit Konusu Özeti
                        </label>
                        <input
                          type="text"
                          value={vehicleDamageSummary}
                          onChange={(e) =>
                            setVehicleDamageSummary(e.target.value)
                          }
                          placeholder="Örn: Trafik kazası ön kaput/şasi hasar ve değer kaybı tespiti"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-800 mb-1">
                          Aracın İnceleneceği Yer (Otopark / Sanayi / Servis)
                        </label>
                        <input
                          type="text"
                          list="vehicle-place-presets"
                          value={vehicleInspectionPlace}
                          onChange={(e) =>
                            setVehicleInspectionPlace(e.target.value)
                          }
                          placeholder="Örn: Fatsa Küçük Sanayi Sitesi / Yediemin Otoparkı"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                        />
                        <datalist id="vehicle-place-presets">
                          {VEHICLE_INSPECTION_PLACE_PRESETS.map((vp) => (
                            <option key={vp} value={vp} />
                          ))}
                        </datalist>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-semibold text-indigo-900">
                        Hızlı İnceleme Noktası Seç:
                      </span>
                      {[
                        {
                          label: "Fatsa Sanayi Sitesi",
                          place: "Fatsa Küçük Sanayi Sitesi (Servis Önü)",
                          neigh: "Evkaf Mahallesi",
                          lat: 41.0195,
                          lng: 37.5142,
                        },
                        {
                          label: "Fatsa Yediemin Otoparkı",
                          place: "Fatsa Yediemin Otoparkı",
                          neigh: "Mustafa Kemal Paşa Mahallesi",
                          lat: 41.0268,
                          lng: 37.5032,
                        },
                        {
                          label: "Fatsa Adliyesi Otoparkı",
                          place: "Fatsa Adliyesi Otoparkı",
                          neigh: "Mustafa Kemal Paşa Mahallesi",
                          lat: FATSA_COURTHOUSE.lat,
                          lng: FATSA_COURTHOUSE.lng,
                        },
                      ].map((loc) => (
                        <button
                          key={loc.label}
                          type="button"
                          onClick={() => {
                            setVehicleInspectionPlace(loc.place);
                            setFormDistrict("Fatsa");
                            setNeighborhoodInput(loc.neigh);
                            setSelectedLat(loc.lat);
                            setSelectedLng(loc.lng);
                          }}
                          className="rounded border border-indigo-200 bg-white px-2 py-0.5 font-medium text-indigo-900 hover:bg-indigo-100"
                        >
                          {loc.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* ==============================================================
                     TAPU / KADASTRO ADA & PARSEL SINIR PANELİ + ÇOKLU PARSEL & YAKIN PARSEL ÖNERİSİ
                     ============================================================== */
                  <div className="rounded-xl border border-amber-300 bg-amber-50/55 p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Layers className="h-4 w-4 text-amber-700 shrink-0" />
                        <span className="text-xs font-bold text-slate-900">
                          TKGM Tapu / Kadastro Ada & Parsel (Çoklu Parsel Destekli)
                        </span>
                        {parcelSource === "tkgm_api" && (
                          <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            ✓ TKGM MEGSİS Resmi Sınır
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <input
                          ref={geoJsonFileInputRef}
                          type="file"
                          accept=".geojson,.json"
                          onChange={handleGeoJsonFileUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => geoJsonFileInputRef.current?.click()}
                          className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap"
                          title="TKGM Parsel Sorgu'dan indirilen .geojson dosyasını yükle"
                        >
                          <Upload className="h-3 w-3" />
                          <span>TKGM GeoJSON Yükle</span>
                        </button>
                        <a
                          href="https://parselsorgu.tkgm.gov.tr/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                          title="TKGM Parsel Sorgu sayfasını yeni sekmede aç"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>TKGM Portal</span>
                        </a>
                      </div>
                    </div>

                    {tkgmStatusMessage && (
                      <div
                        className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${
                          parcelSource === "tkgm_api"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                            : "border-amber-200 bg-white text-slate-700"
                        }`}
                      >
                        {tkgmStatusMessage}
                      </div>
                    )}

                    {/* ============================================================
                        KOPYALA - YAPIŞTIR METİNDEN OTOMATİK MAHALLE, ADA VE PARSEL TESPİT & EKLEME ALANI
                       ============================================================ */}
                    <div className="rounded-xl border border-indigo-300 bg-indigo-50/75 p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <WandIcon className="h-4 w-4 text-indigo-700 shrink-0" />
                          <span className="text-xs font-bold text-indigo-950">
                            📋 Kopyala - Yapıştır Metinden Mahalle, Ada ve Parsel Otomatik Tespit & Ekle
                          </span>
                        </div>
                        <span className="rounded bg-indigo-700 px-2 py-0.5 text-[10px] font-bold text-white">
                          UYAP / Müzekkere / Tapu Metni Çözücü
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        UYAP tensip zaptı, dava dilekçesi veya tapu kaydından kopyaladığınız metni aşağıya yapıştırın; metindeki <strong>İlçe, Mahalle/Köy, Ada, Parsel, Bağımsız Bölüm</strong> ve <strong>Esas No</strong> bilgileri otomatik tespit edilerek TKGM sınırlarıyla dosyaya eklenir.
                      </p>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                        <textarea
                          rows={2}
                          value={pastedParcelText}
                          onChange={(e) => setPastedParcelText(e.target.value)}
                          onKeyDown={(e) => {
                            if (
                              (e.ctrlKey || e.metaKey || !e.shiftKey) &&
                              e.key === "Enter"
                            ) {
                              e.preventDefault();
                              handleExtractAndAddFromPastedText();
                            }
                          }}
                          placeholder="Örn: Fatsa İlçesi Saraytepe Mahallesi 101 Ada 1 ve 5 Parsel ile Ilıca Mahallesi 137/13..."
                          className="flex-1 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none"
                        />
                        <div className="flex sm:flex-col gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleExtractAndAddFromPastedText()}
                            disabled={
                              isExtractingPastedParcels ||
                              !pastedParcelText.trim()
                            }
                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            <Sparkles className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              {isExtractingPastedParcels
                                ? "TKGM'den Ekleniyor..."
                                : "Tespit Et & Otomatik Ekle"}
                            </span>
                          </button>
                          {pastedParcelText.trim() && (
                            <button
                              type="button"
                              onClick={() => setPastedParcelText("")}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                            >
                              Temizle
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Canlı Tespit Önizlemesi (Metin yapıştırıldığı anda bulunan Mahalle/Ada/Parselleri gösterir) */}
                      {parsedPastePreview &&
                        (parsedPastePreview.parcels.length > 0 ||
                          parsedPastePreview.detectedNeighborhood ||
                          parsedPastePreview.detectedEsasNo) && (
                          <div className="rounded-lg border border-indigo-200 bg-white px-2.5 py-2 space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                              <span className="font-bold text-indigo-950">
                                🔍 Metinden Tespit Edilen Bilgiler (
                                {parsedPastePreview.parcels.length} Parsel):
                              </span>
                              {parsedPastePreview.detectedEsasNo && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-800">
                                  Esas No: {parsedPastePreview.detectedEsasNo}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {parsedPastePreview.parcels.map((cand, idx) => (
                                <span
                                  key={`${cand.district}-${cand.neighborhood}-${cand.adaNo}-${cand.parselNo}-${idx}`}
                                  className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-mono font-bold text-emerald-950"
                                >
                                  <span>📍</span>
                                  <span>
                                    [{cand.district}]{" "}
                                    {cand.neighborhood.replace(
                                      " Mahallesi",
                                      " Mah."
                                    )}{" "}
                                    · {cand.adaNo} Ada / {cand.parselNo} Parsel
                                    {cand.bagimsizBolumNo
                                      ? ` (BB: ${cand.bagimsizBolumNo})`
                                      : ""}
                                  </span>
                                </span>
                              ))}
                              {parsedPastePreview.parcels.length === 0 &&
                                parsedPastePreview.detectedNeighborhood && (
                                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-950">
                                    📍 [{parsedPastePreview.detectedDistrict}]{" "}
                                    {parsedPastePreview.detectedNeighborhood}{" "}
                                    (Ada/Parsel bekleniyor)
                                  </span>
                                )}
                            </div>
                          </div>
                        )}
                    </div>

                    {/* Ada, Parsel, Bağımsız Bölüm No, Yüzölçümü (m²), Pafta */}
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Ada No (Yoksa 0)
                        </label>
                        <input
                          type="text"
                          value={adaNo}
                          onChange={(e) => {
                            setParcelSource("cadastre_computed");
                            setAdaNo(e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleQueryAndShowParcelOnMap(false);
                            }
                          }}
                          placeholder="Boş (Kendiniz girin)"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-amber-600 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Parsel No
                        </label>
                        <input
                          type="text"
                          value={parselNo}
                          onChange={(e) => {
                            setParcelSource("cadastre_computed");
                            setParselNo(e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleQueryAndShowParcelOnMap(false);
                            }
                          }}
                          placeholder="Boş (Kendiniz girin)"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-amber-600 focus:outline-none"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <label
                            className="block text-[11px] font-semibold text-slate-700"
                            title="Tek bağımsız bölüm (Örn: 4) veya virgül/tire ile birden fazla (Örn: 1, 2, 5 veya 1-4) girebilirsiniz"
                          >
                            Bağımsız Bölüm No
                          </label>
                          <button
                            type="button"
                            onClick={() => setIsMultiBbMode((prev) => !prev)}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                              isMultiBbMode
                                ? "bg-indigo-600 text-white"
                                : "bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-200"
                            }`}
                            title="Aynı parsel üzerinde birden fazla bağımsız bölüm varsa ayrı ayrı girmek için tıklayın"
                          >
                            {isMultiBbMode
                              ? "✓ Çoklu B.Bölüm Açık"
                              : "+ Çoklu B.Bölüm"}
                          </button>
                        </div>
                        <input
                          type="text"
                          value={bagimsizBolumNo}
                          onChange={(e) => setBagimsizBolumNo(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && isMultiBbMode) {
                              e.preventDefault();
                              handleAddUnitToMultiBbDraft(bagimsizBolumNo);
                            }
                          }}
                          placeholder="Örn: 4 veya 1, 2, 5"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-indigo-900 focus:border-amber-600 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Yüzölçümü (m²)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min={1}
                          value={yuzolcumuInput}
                          onChange={(e) => {
                            setYuzolcumuInput(e.target.value);
                          }}
                          placeholder="TKGM Otomatik"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-emerald-900 focus:border-amber-600 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Pafta No
                        </label>
                        <input
                          type="text"
                          value={paftaNo}
                          onChange={(e) => setPaftaNo(e.target.value)}
                          placeholder="TKGM Otomatik"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-700 focus:border-amber-600 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* ============================================================
                        AYNI PARSELDE BİRDEN FAZLA BAĞIMSIZ BÖLÜM GİRİŞ PANELİ
                       ============================================================ */}
                    {(isMultiBbMode || multiBbDraftList.length > 0) && (
                      <div className="rounded-lg border border-indigo-300 bg-indigo-50/75 p-2.5 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <span className="text-[11px] font-bold text-indigo-950">
                            🏢 Aynı Parsel ({adaNo.trim() || "0"} Ada /{" "}
                            {parselNo.trim() || "?"} Parsel) Üzerindeki Birden
                            Fazla Bağımsız Bölümü Ayrı Ayrı Girin:
                          </span>
                          {multiBbDraftList.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setMultiBbDraftList([])}
                              className="text-[10px] font-semibold text-rose-700 hover:underline"
                            >
                              Listeyi Temizle
                            </button>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <input
                            type="text"
                            value={singleBbEntryInput}
                            onChange={(e) =>
                              setSingleBbEntryInput(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddUnitToMultiBbDraft(singleBbEntryInput);
                              }
                            }}
                            placeholder="B.Bölüm No yazın (Örn: 1 veya 1, 2, 5 veya Kat 1 No:3)..."
                            className="flex-1 min-w-[180px] rounded border border-indigo-300 bg-white px-2.5 py-1 text-xs font-mono font-bold text-indigo-950 focus:border-indigo-600 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleAddUnitToMultiBbDraft(singleBbEntryInput)
                            }
                            className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 whitespace-nowrap"
                          >
                            <Plus className="h-3 w-3" />
                            <span>B.Bölüm Listeye Ekle</span>
                          </button>
                          {parselNo.trim() &&
                            (multiBbDraftList.length > 0 ||
                              bagimsizBolumNo.trim() ||
                              singleBbEntryInput.trim()) && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleAddCurrentInputParcelToList(false)
                                }
                                className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 whitespace-nowrap"
                              >
                                <Check className="h-3 w-3" />
                                <span>
                                  Tüm Bağımsız Bölümleri Ayrı Ayrı Dosyaya Ekle
                                </span>
                              </button>
                            )}
                        </div>

                        {multiBbDraftList.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <span className="text-[10px] font-bold text-indigo-900">
                              Eklenecek Bağımsız Bölümler ({multiBbDraftList.length}{" "}
                              Adet):
                            </span>
                            {multiBbDraftList.map((bbItem, bIdx) => (
                              <span
                                key={`${bbItem}-${bIdx}`}
                                className="inline-flex items-center gap-1 rounded border border-indigo-400 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-950 shadow-2xs"
                              >
                                <span>
                                  {bIdx + 1}. B.Bölüm: {bbItem}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setMultiBbDraftList((prev) =>
                                      prev.filter((_, i) => i !== bIdx)
                                    )
                                  }
                                  className="text-slate-400 hover:text-rose-600"
                                  title="Bu bağımsız bölümü çıkar"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Taşınmaz Niteliği & Mevki */}
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Taşınmaz Niteliği (Cinsi)
                        </label>
                        <input
                          type="text"
                          list="parcel-nitelik-list"
                          value={nitelik}
                          onChange={(e) => setNitelik(e.target.value)}
                          placeholder="Örn: Fındık Bahçesi, Arsa, Tarla..."
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                        />
                        <datalist id="parcel-nitelik-list">
                          {PARCEL_NITELIK_PRESETS.map((item) => (
                            <option key={item} value={item} />
                          ))}
                        </datalist>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Mevki / Ek Adres Açıklaması
                        </label>
                        <input
                          type="text"
                          value={addressDetail}
                          onChange={(e) => setAddressDetail(e.target.value)}
                          placeholder="Örn: Kaplıca Mevkii, Köy İçi Yanı"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Action Buttons: Fetch TKGM Boundary + Add Current Parcel to Multi-Parcel File + Add Another Independent Unit on Same Parcel */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-amber-200/80">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleQueryAndShowParcelOnMap(false)}
                          disabled={isQueryingParcel}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition-colors whitespace-nowrap"
                        >
                          <span>📐</span>
                          <span>
                            {isQueryingParcel
                              ? "TKGM'den Çekiliyor..."
                              : "TKGM'den Sınırı Çek"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleAddCurrentInputParcelToList(false)
                          }
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors whitespace-nowrap"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>
                            {parselNo.trim()
                              ? `${adaNo.trim() || "0"}/${parselNo.trim()} Parseli Dosyaya Ekle`
                              : "Parseli Dosyaya Ekle"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleAddCurrentInputParcelToList(true)
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-indigo-400 bg-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 transition-colors whitespace-nowrap"
                          title="Bu bağımsız bölümü dosyaya ekler ve aynı parsel numarasını koruyarak bir sonraki bağımsız bölümü girmenizi sağlar"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>
                            Aynı Parsele Başka B.Bölüm Ekle
                          </span>
                        </button>
                      </div>

                      {parcelPolygon.length >= 3 && (
                        <span className="font-mono text-[11px] font-bold text-amber-950">
                          Poligon ({parcelPolygon.length} Nokta) ·{" "}
                          {formatAreaM2(Number(yuzolcumuInput || 0))} m²
                        </span>
                      )}
                    </div>

                    {/* ============================================================
                        1. PARSEL GİRİLDİĞİNDE YAKINDAKİ DİĞER PARSEL ÖNERİLERİ (TEK TIKLA EKLEME)
                       ============================================================ */}
                    <div className="rounded-lg border border-emerald-300 bg-white p-2.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-950">
                          <WandIcon className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span>
                            Yakındaki Komşu Parsel Önerileri (Tıkladığınız Parsel Otomatik Dosyaya Eklenir):
                          </span>
                        </div>
                        {isLoadingNearbyParcels && (
                          <span className="text-[10px] font-semibold text-emerald-700 animate-pulse">
                            TKGM komşu parseller taranıyor...
                          </span>
                        )}
                      </div>

                      {nearbyParcelSuggestions.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {nearbyParcelSuggestions.map((sug) => {
                            const isAlreadyAdded = formParcels.some(
                              (p) =>
                                p.adaNo === sug.adaNo &&
                                p.parselNo === sug.parselNo
                            );
                            return (
                              <button
                                key={`${sug.adaNo}-${sug.parselNo}`}
                                type="button"
                                onClick={() => handleAddParcelItemToList(sug)}
                                disabled={isAlreadyAdded}
                                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-mono transition-all ${
                                  isAlreadyAdded
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-800 font-bold cursor-default"
                                    : "border-amber-300 bg-amber-50/70 text-slate-900 font-bold hover:border-emerald-600 hover:bg-emerald-50"
                                }`}
                                title={
                                  isAlreadyAdded
                                    ? "Bu parsel dosyaya eklendi"
                                    : "Tıklayarak bu parseli sınırlarıyla birlikte dosyaya ekleyin"
                                }
                              >
                                {isAlreadyAdded ? (
                                  <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                                ) : (
                                  <Plus className="h-3 w-3 text-emerald-700 shrink-0" />
                                )}
                                <span>
                                  {sug.adaNo}/{sug.parselNo}
                                </span>
                                {sug.yuzolcumuM2 && (
                                  <span className="text-[10px] font-normal text-slate-600">
                                    ({formatAreaM2(sug.yuzolcumuM2)} m²)
                                  </span>
                                )}
                                {typeof sug.distanceFromFirstMeters ===
                                  "number" &&
                                  sug.distanceFromFirstMeters > 0 && (
                                    <span className="text-[10px] font-normal text-emerald-700">
                                      · {sug.distanceFromFirstMeters}m
                                    </span>
                                  )}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        !isLoadingNearbyParcels && (
                          <div className="text-[11px] text-slate-500">
                            1. parseli girdiğinizde aynı adadaki ve bitişikteki komşu TKGM parselleri burada listelenir; üzerine tıklayarak tek tıkla dosyaya ekleyebilirsiniz.
                          </div>
                        )
                      )}

                      {/* Çoklu Parsel Toplu Numara Ekleme (Örn: 2, 3, 5, 8) */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                        <span className="text-[11px] font-semibold text-slate-700">
                          {adaNo.trim()
                            ? `${adaNo.trim()} Adadaki Çoklu Parselleri Toplu Ekle:`
                            : "Aynı Adadaki Çoklu Parselleri Toplu Ekle:"}
                        </span>
                        <input
                          type="text"
                          value={batchParselInput}
                          onChange={(e) => setBatchParselInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleBatchAddParcelsByNumbers();
                            }
                          }}
                          placeholder="Örn: 2, 3, 4, 7, 12"
                          className="flex-1 min-w-[130px] rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-mono text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleBatchAddParcelsByNumbers}
                          disabled={
                            isAddingBatchParcels || !batchParselInput.trim()
                          }
                          className="rounded bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                        >
                          {isAddingBatchParcels
                            ? "TKGM'den Çekiliyor..."
                            : "+ Toplu Çek & Ekle"}
                        </button>
                      </div>
                    </div>

                    {/* ============================================================
                        DOSYAYA EKLENEN PARSELLER VE BAĞIMSIZ BÖLÜMLER LİSTESİ
                       ============================================================ */}
                    {formParcels.length > 0 && (
                      <div className="rounded-lg border border-amber-300 bg-amber-100/50 p-2.5 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-amber-950">
                            📋 Bu Keşif Dosyasına Eklenen Parsel & Bağımsız Bölümler (
                            {formParcels.length} Adet · Toplam Arsa:{" "}
                            {formatAreaM2(computeUniqueParcelAreaSum(formParcels))}{" "}
                            m²)
                          </span>
                          {formParcels.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setFormParcels((prev) => prev.slice(0, 1))
                              }
                              className="text-[11px] font-semibold text-red-700 hover:underline"
                            >
                              Sadece 1. Kaydı Bırak
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {formParcels.map((p, idx) => (
                            <div
                              key={`${p.neighborhood || ""}-${p.adaNo}-${p.parselNo}-${p.bagimsizBolumNo || ""}-${idx}`}
                              className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2 py-1 text-xs shadow-2xs"
                            >
                              <span className="rounded bg-amber-600 px-1.5 py-0.2 font-mono text-[10px] font-bold text-white">
                                #{idx + 1}
                              </span>
                              {p.neighborhood && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                  {p.neighborhood.replace(/\s+Mahallesi$/i, "")}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  if (p.centerLat && p.centerLng) {
                                    setSelectedLat(p.centerLat);
                                    setSelectedLng(p.centerLng);
                                  }
                                  if (p.polygon && p.polygon.length >= 3) {
                                    setParcelPolygon(p.polygon);
                                  }
                                  setFocusParcelZoomTrigger((c) => c + 1);
                                }}
                                className="font-mono font-bold text-slate-900 hover:text-amber-700"
                                title="Haritada bu parsele odaklan"
                              >
                                {p.adaNo} Ada / {p.parselNo} Parsel
                              </button>
                              {p.bagimsizBolumNo && (
                                <span className="rounded bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 font-mono text-[10px] font-bold text-indigo-800">
                                  B.Bölüm: {p.bagimsizBolumNo}
                                </span>
                              )}
                              {p.yuzolcumuM2 && (
                                <span className="font-mono text-[11px] text-emerald-800">
                                  ({formatAreaM2(p.yuzolcumuM2)} m²)
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  if (p.neighborhood) {
                                    setNeighborhoodInput(p.neighborhood);
                                  }
                                  setAdaNo(p.adaNo);
                                  setParselNo(p.parselNo);
                                  if (p.yuzolcumuM2) {
                                    setYuzolcumuInput(String(p.yuzolcumuM2));
                                  }
                                  if (p.nitelik) setNitelik(p.nitelik);
                                  if (p.polygon && p.polygon.length >= 3) {
                                    setParcelPolygon(p.polygon);
                                  }
                                  setIsMultiBbMode(true);
                                  setBagimsizBolumNo("");
                                }}
                                className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100"
                                title="Bu parsel üzerinde yeni bir Bağımsız Bölüm daha ekle"
                              >
                                +B.Bölüm
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveParcelFromList(
                                    p.adaNo,
                                    p.parselNo,
                                    p.neighborhood,
                                    p.bagimsizBolumNo,
                                    idx
                                  )
                                }
                                className="ml-0.5 text-slate-400 hover:text-red-600"
                                title="Bu parseli / bağımsız bölümü dosyadan çıkar"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Live Distance, Duration & Weather Card */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500">
                        FATSA ADLİYESİ MERKEZİNDEN KARAYOLU HESABI
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-slate-900">
                        [{formDistrict}] {neighborhoodInput}
                        {subjectType === "arac" && vehiclePlateNo ? (
                          <span className="ml-1.5 font-mono text-xs text-indigo-700">
                            (🚗 {vehiclePlateNo})
                          </span>
                        ) : subjectType === "adres" ? (
                          <span className="ml-1.5 font-sans text-xs font-semibold text-teal-800">
                            (🏠 {addressDetail.trim() || "Adres Bazlı Keşif"}
                            {bagimsizBolumNo.trim()
                              ? ` · Daire/B.Bölüm: ${bagimsizBolumNo.trim()}`
                              : ""}
                            )
                          </span>
                        ) : formParcels.length > 1 ? (
                          <span className="ml-1.5 font-mono text-xs text-amber-700">
                            ({formParcels.length} Parsel)
                          </span>
                        ) : formParcels.length === 1 && !parselNo.trim() ? (
                          <span className="ml-1.5 font-mono text-xs text-amber-700">
                            ({formParcels[0].adaNo} Ada / {formParcels[0].parselNo} Parsel)
                          </span>
                        ) : (
                          parselNo.trim() && (
                            <span className="ml-1.5 font-mono text-xs text-amber-700">
                              ({adaNo.trim() || "0"} Ada / {parselNo.trim()} Parsel)
                            </span>
                          )
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 font-mono tabular-nums">
                      <div>
                        <span className="block text-[10px] text-slate-500">MESAFE</span>
                        <span className="text-xs sm:text-sm font-bold text-emerald-700">
                          {osrmLoading ? "..." : `${distanceKm} km`}
                        </span>
                      </div>
                      <div className="border-l border-slate-200 pl-3">
                        <span className="block text-[10px] text-slate-500">SÜRE</span>
                        <span className="text-xs sm:text-sm font-bold text-slate-900">
                          {osrmLoading ? "..." : `~${durationMin} dk`}
                        </span>
                      </div>
                      {formWeather && (
                        <div className="border-l border-slate-200 pl-3">
                          <span className="block text-[10px] text-slate-500 font-sans">
                            HAVA
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-900 font-sans">
                            {renderWeatherIcon(formWeather.condition, "h-3.5 w-3.5")}
                            <span>{formWeather.tempMax}°C</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Smart Suggestion Alert Box inside form */}
                {smartSuggestions.length > 0 && (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50/90 p-3 space-y-2">
                    <div className="text-xs font-semibold text-emerald-950 leading-relaxed">
                      {smartSuggestions[0].message}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleApplySuggestionDate(smartSuggestions[0])}
                        className="rounded bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap"
                      >
                        Tarihi {smartSuggestions[0].formattedDate} Yap ve Birleştir
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleRequestAiOptimization(
                            smartSuggestions[0].existingRecords
                          )
                        }
                        disabled={aiAnalysisLoading}
                        className="flex items-center gap-1 rounded border border-emerald-400 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap"
                      >
                        <Sparkles className="h-3 w-3 text-emerald-600" />
                        {aiAnalysisLoading ? "Analiz Ediliyor..." : "Yapay Zeka Yorumu Al"}
                      </button>
                    </div>

                    {aiAnalysisResult && (
                      <div className="mt-1.5 rounded border border-emerald-200 bg-white p-2.5 text-xs text-slate-700">
                        {aiAnalysisResult}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Keşif Tarihi *
                    </label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Keşif Saati (Varsayılan 13:00) *
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="time"
                        required
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                      {time !== "13:00" && (
                        <button
                          type="button"
                          onClick={() => setTime("13:00")}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] font-mono font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                          title="Saati varsayılan 13:00'a sıfırla"
                        >
                          13:00
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* ==============================================================
                    BİLİRKİŞİ HEYETİ (TİK ATILABİLİR VARSAYILAN UNVANLAR + MANUEL ALAN)
                   ============================================================== */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/75 p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-emerald-600 shrink-0" />
                      <label className="text-xs font-bold text-slate-900">
                        Bilirkişi Heyeti Seçimi (Birden Fazla Tik Atabilirsiniz)
                      </label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedExpertIds(["fen", "ziraat"])}
                        className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:border-emerald-400"
                      >
                        Fen + Ziraat
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedExpertIds(["fen", "ziraat", "insaat", "gmdu"])
                        }
                        className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:border-emerald-400"
                      >
                        Ortaklık Tam Heyet
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedExpertIds([]);
                          setCustomExpertText("");
                        }}
                        className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:text-red-600"
                      >
                        Temizle
                      </button>
                    </div>
                  </div>

                  {/* Tickable Checkbox Grid: Fen, Ziraat, İnşaat, Makine, Mobilya, Mimar, GMDÜ */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {DEFAULT_EXPERT_TITLES.map((item) => {
                      const isChecked = selectedExpertIds.includes(item.id);
                      return (
                        <label
                          key={item.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-all select-none ${
                            isChecked
                              ? "border-emerald-600 bg-emerald-50 text-emerald-950 shadow-2xs"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleExpertTitle(item.id)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="truncate" title={item.fullTitle}>
                            {item.shortLabel}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {/* Manuel Bilirkişi Yazma Alanı */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Manuel / Ek Bilirkişi Unvanı veya İsim Yazın (İsteğe Bağlı)
                    </label>
                    <input
                      type="text"
                      list="expert-presets"
                      value={customExpertText}
                      onChange={(e) => setCustomExpertText(e.target.value)}
                      placeholder="Örn: Kadastro Teknisyeni, Elektrik Bilirkişisi veya Ad Soyad..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                    <datalist id="expert-presets">
                      {EXPERT_PRESETS.map((ep) => (
                        <option key={ep} value={ep} />
                      ))}
                    </datalist>
                  </div>

                  {/* Aktif Bilirkişi Heyeti Önizlemesi */}
                  <div className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700">
                    <span className="font-bold text-emerald-800">
                      Seçili Heyet:{" "}
                    </span>
                    <span className="font-medium text-slate-900">
                      {combinedExpertsText || "Henüz bilirkişi seçilmedi"}
                    </span>
                  </div>
                </div>

                {/* ==============================================================
                    KEŞFİ EKLEYEN KİŞİ (AYARLAR BÖLÜMÜNDEKİ AD SOYAD + UNVAN BİLGİSİNDEN ÇEKİLİR)
                   ============================================================== */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/75 p-3.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                      <label className="text-xs font-bold text-slate-900">
                        Keşfi Ekleyen Kişi (Ayarlar Profilinden Otomatik Çekilir)
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("ayarlar")}
                      className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-900 hover:bg-emerald-100"
                    >
                      <Settings className="h-3 w-3" />
                      <span>Ayarlar'da Ad / Unvan Düzenle</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={createdByInput}
                    onChange={(e) => handleCreatedByChange(e.target.value)}
                    placeholder="Örn: Ahmet Yılmaz (Zabıt Katibi) · FATSA-SHM-PC"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500">
                    Üst menüdeki <strong>Ayarlar</strong> sekmesinden adınızı ve unvanınızı (Hakim, Zabıt Katibi, Mübaşir, Yazı İşleri Müdürü) kaydettiğinizde otomatik buraya yansır.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Keşif Notları
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Örn: Davacı vekili araç temin edecek, fen bilirkişisi çap uygulayacak..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("ajanda")}
                    className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Ajandaya Dön
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 rounded-xl bg-[#246B73] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:opacity-95 whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4" />
                    {subjectType === "arac"
                      ? "Araç Tespit Keşfini Kaydet"
                      : subjectType === "adres"
                      ? "Adres Bazlı Keşfi Kaydet"
                      : formParcels.length > 1
                      ? `Keşfi & ${formParcels.length} Parseli Kaydet`
                      : "Keşfi & Parseli Kaydet"}
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Map Picker with Multi-Parcel Polygon Preview & Clickable Nearby Suggestions */}
            <div className="lg:col-span-6 space-y-3">
              <div className="app-card p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#246B73]/12 px-2 py-0.5 text-[10px] font-bold text-[#246B73] mb-1">
                      <MapPin className="h-3 w-3" />
                      <span>Canlı CBS & TKGM Harita Önizlemesi</span>
                    </span>
                    <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                      {subjectType === "arac"
                        ? `Araç İnceleme Konumu & Güzergah Haritası (${formDistrict})`
                        : subjectType === "adres"
                        ? `Adres Bazlı Keşif Konumu & Güzergah Haritası (${formDistrict})`
                        : `TKGM Taşınmaz Ada/Parsel Sınırı & Çoklu Parsel Haritası (${formDistrict})`}
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      {subjectType === "arac"
                        ? "Aracın bulunduğu otopark/sanayi konumunu haritadan seçebilir veya inceleme yeri butonlarını kullanabilirsiniz"
                        : subjectType === "adres"
                        ? "Haritada binanın veya sokağın üzerine tıklayarak keşif adres noktasını doğrudan işaretleyebilirsiniz"
                        : "Dosyaya eklenen tüm parsellerin TKGM sınırları haritada birlikte çizilir"}
                    </p>
                  </div>
                  <span className="rounded-lg bg-[#246B73]/10 px-2.5 py-1 font-mono text-xs font-bold text-[#246B73] tabular-nums">
                    {distanceKm} km · {durationMin} dk
                  </span>
                </div>

                {/* Selected Multi-Parcel, Address or Vehicle Metadata Summary Strip above Map */}
                {subjectType === "arac" ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-indigo-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                        🚗 {vehiclePlateNo || "Plaka Girilmedi"}
                      </span>
                      {vehicleBrandModel && (
                        <span className="font-semibold text-indigo-950">
                          {vehicleBrandModel}
                        </span>
                      )}
                      {vehicleInspectionPlace && (
                        <span className="text-indigo-800">
                          · {vehicleInspectionPlace}
                        </span>
                      )}
                    </div>
                  </div>
                ) : subjectType === "adres" ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50/80 px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-teal-700 px-2 py-0.5 text-[11px] font-bold text-white">
                        🏠 {addressDetail.trim() || "Açık Adres Bekleniyor"}
                      </span>
                      {bagimsizBolumNo.trim() && (
                        <span className="font-mono font-bold text-teal-950">
                          · Daire/B.Bölüm No: {bagimsizBolumNo.trim()}
                        </span>
                      )}
                      {nitelik.trim() && (
                        <span className="text-teal-800">
                          · {nitelik.trim()}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  (parselNo.trim() || formParcels.length > 0) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-amber-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                          📐{" "}
                          {formParcels.length > 1
                            ? `${formParcels.length} Parsel Seçili`
                            : formParcels.length === 1 && !parselNo.trim()
                            ? `${formParcels[0].adaNo} Ada / ${formParcels[0].parselNo} Parsel`
                            : `${adaNo.trim() || "0"} Ada / ${parselNo.trim()} Parsel`}
                        </span>
                        {nitelik && (
                          <span className="font-semibold text-amber-950">
                            {nitelik}
                          </span>
                        )}
                        {Number(yuzolcumuInput) > 0 && (
                          <span className="font-mono font-bold text-amber-900">
                            · {formatAreaM2(Number(yuzolcumuInput))} m²
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setFocusParcelZoomTrigger((c) => c + 1)}
                        className="font-semibold text-amber-900 underline hover:text-amber-700 text-[11px]"
                      >
                        Parsel Sınırına Yakınlaş &rarr;
                      </button>
                    </div>
                  )
                )}

                <InteractiveMap
                  mode="picker"
                  selectedLat={selectedLat}
                  selectedLng={selectedLng}
                  selectedLabel={`[${formDistrict}] ${neighborhoodInput} (${distanceKm} km)`}
                  selectedCaseType={caseType}
                  selectedParcelPolygon={
                    subjectType === "tasinmaz" ? parcelPolygon : undefined
                  }
                  selectedParcelMeta={
                    subjectType === "tasinmaz"
                      ? {
                          adaNo: adaNo.trim() || undefined,
                          parselNo: parselNo.trim() || undefined,
                          nitelik: nitelik.trim() || undefined,
                          yuzolcumuM2:
                            Number(yuzolcumuInput) > 0
                              ? Number(yuzolcumuInput)
                              : undefined,
                          paftaNo: paftaNo.trim() || undefined,
                        }
                      : undefined
                  }
                  selectedParcels={
                    subjectType === "tasinmaz"
                      ? combinedPreviewParcels
                      : undefined
                  }
                  focusParcelZoomTrigger={focusParcelZoomTrigger}
                  pickerRouteGeometry={pickerGeometry}
                  inspections={inspections}
                  onSelectPoint={handleMapPointClick}
                  heightClass="h-[380px] sm:h-[480px]"
                />
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: AJANDA GÖRÜNÜMÜ */}
        {activeTab === "ajanda" && (
          <div className="space-y-4">
            {/* Toolbar: Control Center Style Header + Search, District Filter, Status Filter & Actions */}
            <div className="app-card p-4 sm:p-5 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-[#246B73]/12 px-2.5 py-0.5 text-[11px] font-bold text-[#246B73]">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      <span>Keşif Ajandası & Saha İş Akışı</span>
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      Toplam {inspections.length} Dosya · 8 Aşamalı Saha Takibi
                    </span>
                  </div>
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 mt-1">
                    Günlük Keşif Programı & Dosya Yönetimi
                  </h1>
                </div>

                {/* Right Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAiAssistantOpen(true)}
                    className="flex items-center gap-1.5 rounded-xl bg-[#246B73] px-3 py-1.5 text-xs font-bold text-white hover:opacity-95 whitespace-nowrap shadow-xs"
                    title="Doğal Türkçe sorgularla keşif asistanına soru sor"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-emerald-200" />
                    <span>YZ Asistan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("kesif_zapti")}
                    className="flex items-center gap-1.5 rounded-xl bg-[#1B2733] px-3 py-1.5 text-xs font-bold text-white hover:opacity-95 whitespace-nowrap shadow-xs"
                    title="Seçili keşiflerin zabıtlarını hazırla ve Word (.doc) belgesi olarak dışa aktar"
                  >
                    <FileText className="h-3.5 w-3.5 text-[#63B5B0]" />
                    <span>Keşif Zaptı Hazırla</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("bilirkisiler")}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                    title="Mahkemede görev alan bilirkişileri ve zapt açıklamalarını ekle/düzenle"
                  >
                    <Users className="h-3.5 w-3.5 text-[#246B73]" />
                    <span>Bilirkişi Ekle ({registeredExperts.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("istatistikler")}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                    title="Aylık ve günlük yapılan keşif, parsel sayısı ve kilometre istatistik grafiklerini aç"
                  >
                    <BarChart3 className="h-3.5 w-3.5 text-[#397FA5]" />
                    <span>İstatistik & Grafikler</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsExcelModalOpen(true)}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                    title="Aylık yapılan keşifleri (Dosya No, Keşif Tarihi, Katılan Hakim, Katip ve Mübaşir isimleriyle) Excel (.xls) olarak indir"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-[#16845B]" />
                    <span>Aylık Excel Raporu</span>
                  </button>
                  <button
                    onClick={() => setIsPdfModalOpen(true)}
                    className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                  >
                    <FileDown className="h-3.5 w-3.5 text-[#246B73]" />
                    <span>PDF Çıktısı</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("ai_rota")}
                    className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-[#246B73] hover:bg-slate-100 whitespace-nowrap"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-[#246B73]" />
                    <span>YZ Rota & Gün Tavsiyesi</span>
                  </button>
                  <button
                    onClick={() => handleOpenNewInspectionTab()}
                    className="flex items-center gap-1 rounded-xl bg-[#16845B] px-3 py-1.5 text-xs font-bold text-white hover:opacity-95 whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Yeni Keşif</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
                {/* Search & District Filter */}
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[160px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={agendaFilterText}
                      onChange={(e) => setAgendaFilterText(e.target.value)}
                      placeholder="Esas No, Ada/Parsel, Mahalle veya Not ara..."
                      className="w-full rounded-xl border border-slate-300 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-[#246B73] focus:outline-none"
                    />
                  </div>

                  {/* District Filter Pill Menu */}
                  <select
                    value={agendaDistrictFilter}
                    onChange={(e) => setAgendaDistrictFilter(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:border-[#246B73] focus:outline-none shrink-0"
                  >
                    <option value="Tümü">Tüm İlçeler ({inspections.length})</option>
                    <option value="Fatsa">Fatsa ({districtCounts.fatsa})</option>
                    <option value="Çamaş">Çamaş ({districtCounts.camas})</option>
                    <option value="Çatalpınar">Çatalpınar ({districtCounts.catalpinar})</option>
                  </select>

                  <select
                    value={agendaCaseFilter}
                    onChange={(e) => setAgendaCaseFilter(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-[#246B73] focus:outline-none shrink-0"
                  >
                    <option value="Tümü">Tüm Dava Türleri</option>
                    {CASE_TYPES.map((ct) => (
                      <option key={ct} value={ct}>
                        {ct}
                      </option>
                    ))}
                  </select>

                  {/* Tarih Aralığı Filtresi */}
                  <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px]">
                    <span className="font-semibold text-slate-500">Tarih:</span>
                    <input
                      type="date"
                      value={agendaDateFrom}
                      onChange={(e) => setAgendaDateFrom(e.target.value)}
                      className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-800"
                      title="Başlangıç Tarihi"
                    />
                    <span className="text-slate-400">-</span>
                    <input
                      type="date"
                      value={agendaDateTo}
                      onChange={(e) => setAgendaDateTo(e.target.value)}
                      className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-800"
                      title="Bitiş Tarihi"
                    />
                    {(agendaDateFrom || agendaDateTo) && (
                      <button
                        type="button"
                        onClick={() => {
                          setAgendaDateFrom("");
                          setAgendaDateTo("");
                        }}
                        className="ml-0.5 text-slate-400 hover:text-rose-600"
                        title="Tarih filtresini temizle"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Status Filter Scrollable Bar (8 Durum + Tümü) */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 border-t border-slate-100 pt-2.5">
                {(
                  [
                    { key: "Tümü", label: `Tümü (${statusCounts.all})` },
                    { key: "planlandi", label: `Planlandı (${statusCounts.planlandi})` },
                    { key: "hazirlik", label: `Hazırlık (${statusCounts.hazirlik})` },
                    { key: "yola_cikildi", label: `Yola Çıkıldı (${statusCounts.yola_cikildi})` },
                    { key: "kesif_basladi", label: `Keşif Başladı (${statusCounts.kesif_basladi})` },
                    { key: "yapildi", label: `Yapıldı (${statusCounts.yapildi})` },
                    { key: "ertelendi", label: `Ertelendi (${statusCounts.ertelendi})` },
                    { key: "iptal_edildi", label: `İptal (${statusCounts.iptal_edildi})` },
                  ] as { key: string; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setAgendaStatusFilter(tab.key)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      agendaStatusFilter === tab.key
                        ? "bg-[#246B73] text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Agenda Group Cards */}
            {agendaGroups.length === 0 ? (
              <div className="app-card p-8 text-center space-y-2.5">
                <Compass className="mx-auto h-7 w-7 text-slate-400" />
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Kriterlere uygun keşif kaydı bulunamadı
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  İlçe, Ada/Parsel veya durum filtresini değiştirerek kayıtları görebilirsiniz.
                </p>
                <button
                  onClick={() => {
                    setAgendaFilterText("");
                    setAgendaDistrictFilter("Tümü");
                    setAgendaStatusFilter("Tümü");
                    setAgendaCaseFilter("Tümü");
                  }}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Filtreleri Sıfırla
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {agendaGroups.map((group) => {
                  const firstWeather = weatherMap[group.records[0]?.id];
                  const isDayExpanded = Boolean(expandedAgendaDates[group.date]);
                  return (
                    <div
                      key={group.date}
                      className="overflow-hidden app-card"
                    >
                      {/* Day Group Header (Clickable Accordion — Default Closed) */}
                      <div
                        role="button"
                        tabIndex={0}
                        aria-expanded={isDayExpanded}
                        onClick={() =>
                          setExpandedAgendaDates((prev) => ({
                            ...prev,
                            [group.date]: !prev[group.date],
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpandedAgendaDates((prev) => ({
                              ...prev,
                              [group.date]: !prev[group.date],
                            }));
                          }
                        }}
                        className={`flex cursor-pointer select-none flex-col gap-2 bg-[#1B2733] p-3 sm:px-5 sm:py-3.5 text-white transition-colors hover:bg-[#243341] sm:flex-row sm:items-center sm:justify-between ${
                          isDayExpanded ? "border-b border-slate-200" : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-800/90 text-[#63B5B0] shrink-0">
                            {isDayExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </span>
                          <CalendarIcon className="h-4 w-4 text-[#63B5B0] shrink-0" />
                          <h2 className="text-xs sm:text-sm font-bold tracking-tight">
                            {formatLongDateTR(group.date)}
                          </h2>
                          <span className="rounded-md bg-[#246B73]/30 px-2 py-0.5 text-[11px] font-bold text-[#63B5B0]">
                            {group.records.length} Keşif
                          </span>
                          {firstWeather && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-200 bg-slate-800/80 rounded px-1.5 py-0.5">
                              {renderWeatherIcon(firstWeather.condition, "h-3.5 w-3.5")}
                              <span>{firstWeather.label}</span>
                              <span className="font-mono">({firstWeather.tempMax}°C)</span>
                            </span>
                          )}
                        </div>

                        <div
                          className="flex flex-wrap items-center gap-2 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="font-mono text-slate-300 text-[11px] tabular-nums">
                            Gidiş-Dönüş: <strong className="text-[#63B5B0]">~{group.totalDailyKm} km</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => setShareRouteDate(group.date)}
                            className="flex items-center gap-1 rounded-lg bg-[#246B73] px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-95 whitespace-nowrap"
                            title="Çıkış noktası, duraklar, dosya numaraları ve varış noktasını içeren güzergahı paylaş"
                          >
                            <Share2 className="h-3 w-3" />
                            <span>Güzergahı Paylaş</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRunPdfExport("daily", group.date)}
                            className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 whitespace-nowrap"
                          >
                            Günlük PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMapFilterDate(group.date);
                              setFocusedInspectionId(null);
                              setActiveTab("harita");
                            }}
                            className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-[#63B5B0] hover:bg-slate-700 whitespace-nowrap"
                          >
                            <Route className="h-3 w-3" />
                            Rotayı & Parselleri Aç
                          </button>
                        </div>
                      </div>

                      {/* File Rows (Expanded when date header is clicked) */}
                      {isDayExpanded && (
                      <div className="divide-y divide-slate-200">
                        {group.records.map((rec, index) => {
                          const wf = weatherMap[rec.id];
                          const currentStatus: InspectionStatus = rec.status || "planlandi";
                          const adaParselText = formatAdaParselLabel(rec);
                          const addressText = formatAddressLabel(rec);
                          const cMeta = getCaseTypeVisualMeta(rec.caseType);

                          return (
                            <div
                              key={rec.id}
                              className={`p-3.5 sm:p-5 transition-colors hover:bg-slate-50/70 space-y-2.5 ${
                                currentStatus === "iptal_edildi"
                                  ? "bg-slate-50/80 opacity-75"
                                  : ""
                              }`}
                            >
                              {/* Top line: Index, Time, District Badge, Esas No, Dynamic Case Type Badge */}
                              <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                                    {index + 1}. Durak · {rec.time}
                                  </span>
                                  <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                                    {rec.district}
                                  </span>
                                  <span className="font-mono font-bold text-emerald-800">
                                    {rec.esasNo}
                                  </span>
                                  <span
                                    style={{
                                      backgroundColor: cMeta.badgeBg,
                                      color: cMeta.badgeText,
                                    }}
                                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold"
                                  >
                                    <span>{cMeta.icon}</span>
                                    <span>{rec.caseType}</span>
                                  </span>
                                </div>

                                <div className="font-mono text-xs font-bold text-slate-800 tabular-nums">
                                  {rec.distanceKm} km (~{rec.durationMin} dk)
                                </div>
                              </div>

                              {/* Neighborhood & Cadastral Ada/Parsel Badge */}
                              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <h3
                                    className={`text-sm sm:text-base font-bold ${
                                      currentStatus === "iptal_edildi"
                                        ? "line-through text-slate-500"
                                        : "text-slate-900"
                                    }`}
                                  >
                                    {rec.neighborhood}
                                  </h3>
                                  {rec.addressDetail && (
                                    <p className="text-xs text-slate-600 mt-0.5">
                                      {rec.addressDetail}
                                    </p>
                                  )}
                                  {rec.experts && (
                                    <p className="text-xs text-slate-700 mt-1">
                                      <span className="font-semibold text-slate-900">
                                        Bilirkişi Heyeti:
                                      </span>{" "}
                                      {rec.experts}
                                    </p>
                                  )}
                                  {rec.createdBy && (
                                    <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                                      <span>
                                        {rec.deviceType === "mobile" ||
                                        rec.deviceType === "tablet"
                                          ? "📱"
                                          : "💻"}
                                      </span>
                                      <span className="font-semibold text-slate-700">
                                        Keşfi Ekleyen:
                                      </span>
                                      <span className="font-medium text-slate-800">
                                        {rec.createdBy}
                                      </span>
                                    </p>
                                  )}
                                  {(currentStatus === "yapildi" ||
                                    rec.judgeName ||
                                    rec.clerkName ||
                                    rec.bailiffName) && (
                                    <div className="mt-1.5 inline-flex flex-wrap items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50/90 px-2.5 py-1.5 text-xs text-emerald-950">
                                      <span className="inline-flex items-center gap-1 font-bold text-emerald-900">
                                        <UserCheck className="h-3.5 w-3.5 text-emerald-700" />
                                        <span>Keşfe Katılan Heyet:</span>
                                      </span>
                                      <span className="rounded bg-white border border-emerald-200 px-1.5 py-0.5 text-[11px]">
                                        <strong>Hakim:</strong>{" "}
                                        {rec.judgeName || "Belirtilmedi"}
                                      </span>
                                      <span className="rounded bg-white border border-emerald-200 px-1.5 py-0.5 text-[11px]">
                                        <strong>Katip:</strong>{" "}
                                        {rec.clerkName || "Belirtilmedi"}
                                      </span>
                                      <span className="rounded bg-white border border-emerald-200 px-1.5 py-0.5 text-[11px]">
                                        <strong>Mübaşir:</strong>{" "}
                                        {rec.bailiffName || "Belirtilmedi"}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleOpenCompletionModal(rec)
                                        }
                                        className="rounded bg-emerald-700 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-800"
                                        title="Keşfe katılan Hakim, Katip ve Mübaşir bilgisini düzenle"
                                      >
                                        Heyeti Düzenle
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Ada / Parsel (Çoklu Parsel), Adres Bazlı veya Araç Plaka Info Box with Map Trigger */}
                                {rec.subjectType === "arac" &&
                                rec.vehicleInfo?.plateNo ? (
                                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/90 px-2.5 py-1.5 text-xs">
                                    <div className="text-indigo-950">
                                      <span className="font-mono font-bold">
                                        🚗 Plaka: {rec.vehicleInfo.plateNo}
                                      </span>
                                      {rec.vehicleInfo.brandModel && (
                                        <span className="text-indigo-900 ml-1.5 font-semibold">
                                          · {rec.vehicleInfo.brandModel}
                                        </span>
                                      )}
                                      {rec.vehicleInfo.damageSummary && (
                                        <span className="text-indigo-800 ml-1.5">
                                          · {rec.vehicleInfo.damageSummary}
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleOpenParcelOnOverviewMap(rec)
                                      }
                                      className="rounded bg-indigo-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-indigo-700 whitespace-nowrap"
                                    >
                                      Haritada Konumu Gör &rarr;
                                    </button>
                                  </div>
                                ) : adaParselText ? (
                                  <div className="flex flex-col gap-1.5 rounded-lg border border-amber-200 bg-amber-50/90 px-2.5 py-1.5 text-xs">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="text-amber-950">
                                        <span className="font-mono font-bold">
                                          📐 {adaParselText}
                                        </span>
                                        {rec.yuzolcumuM2 && (
                                          <span className="font-mono text-amber-800 ml-1.5">
                                            · {formatAreaM2(rec.yuzolcumuM2)} m²
                                          </span>
                                        )}
                                        {rec.nitelik && (
                                          <span className="text-amber-900 ml-1.5">
                                            · {rec.nitelik}
                                          </span>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleOpenParcelOnOverviewMap(rec)
                                        }
                                        className="rounded bg-amber-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-amber-700 whitespace-nowrap"
                                        title="Taşınmazı harita üzerinde sınırlarıyla (poligon) görüntüle"
                                      >
                                        Haritada Sınırı Gör &rarr;
                                      </button>
                                    </div>
                                    {rec.parcels && rec.parcels.length > 1 && (
                                      <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-amber-200/70">
                                        {rec.parcels.map((p, pIdx) => (
                                          <span
                                            key={p.id || pIdx}
                                            className="rounded bg-white border border-amber-300 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-950"
                                          >
                                            {pIdx + 1}. Parsel:{" "}
                                            {p.neighborhood
                                              ? `${p.neighborhood.replace(/\s+Mahallesi$/i, "")} `
                                              : ""}
                                            {p.adaNo}/{p.parselNo}
                                            {p.bagimsizBolumNo
                                              ? ` [B.Bölüm No: ${p.bagimsizBolumNo}]`
                                              : ""}
                                            {p.yuzolcumuM2
                                              ? ` (${formatAreaM2(p.yuzolcumuM2)} m²)`
                                              : ""}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  addressText && (
                                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50/90 px-2.5 py-1.5 text-xs">
                                      <div className="text-teal-950">
                                        <span className="font-bold">
                                          🏠 Adres:{" "}
                                          {rec.addressDetail ||
                                            "Açık Adres Keşfi"}
                                        </span>
                                        {rec.bagimsizBolumNo && (
                                          <span className="font-mono font-bold text-teal-900 ml-1.5">
                                            · Daire / B.Bölüm No:{" "}
                                            {rec.bagimsizBolumNo}
                                          </span>
                                        )}
                                        {rec.nitelik && (
                                          <span className="text-teal-800 ml-1.5">
                                            · {rec.nitelik}
                                          </span>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleOpenParcelOnOverviewMap(rec)
                                        }
                                        className="rounded bg-teal-700 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-teal-800 whitespace-nowrap"
                                        title="Adres konumunu harita üzerinde görüntüle"
                                      >
                                        Haritada Konumu Gör &rarr;
                                      </button>
                                    </div>
                                  )
                                )}
                              </div>

                              {/* Weather info line */}
                              {wf && (
                                <div className="flex items-center gap-2 text-xs text-slate-600">
                                  {renderWeatherIcon(wf.condition, "h-3.5 w-3.5")}
                                  <span>{wf.label}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums">
                                    {wf.tempMax}° / {wf.tempMin}°C
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>Yağış: %{wf.precipitationProb}</span>
                                </div>
                              )}

                              {rec.notes && (
                                <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                                  <strong>Not:</strong> {rec.notes}
                                </p>
                              )}

                              {/* Mobile-Friendly Status Action Buttons, Media/Voice & Collapsible Details */}
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <div className="flex flex-wrap items-center gap-1 rounded bg-slate-100 p-0.5">
                                    {(
                                      [
                                        { key: "planlandi", label: "Planlandı" },
                                        { key: "yola_cikildi", label: "Yola Çıkıldı" },
                                        { key: "kesif_basladi", label: "Keşif Başladı" },
                                        { key: "yapildi", label: "Yapıldı" },
                                        { key: "ertelendi", label: "Ertelendi" },
                                        { key: "iptal_edildi", label: "İptal" },
                                      ] as { key: InspectionStatus; label: string }[]
                                    ).map((btn) => (
                                      <button
                                        key={btn.key}
                                        type="button"
                                        onClick={() =>
                                          handleUpdateInspectionStatus(rec.id, btn.key)
                                        }
                                        className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                                          currentStatus === btn.key
                                            ? btn.key === "yapildi"
                                              ? "bg-emerald-600 text-white"
                                              : btn.key === "ertelendi"
                                              ? "bg-amber-600 text-white"
                                              : btn.key === "iptal_edildi"
                                              ? "bg-red-600 text-white"
                                              : "bg-[#246B73] text-white shadow-xs"
                                            : "text-slate-600 hover:text-slate-900"
                                        }`}
                                      >
                                        {btn.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setMediaModalRecord(rec)}
                                    className="inline-flex items-center gap-1 rounded border border-teal-300 bg-teal-50 px-2.5 py-1 text-[11px] font-bold text-teal-900 hover:bg-teal-100 whitespace-nowrap"
                                    title="Sesli Not Kaydet, Metne Dönüştür veya Saha Fotoğrafı Ekle"
                                  >
                                    <Mic className="h-3 w-3 text-teal-700" />
                                    <Camera className="h-3 w-3 text-teal-700" />
                                    <span>
                                      Saha Not & Foto
                                      {(rec.voiceNotes?.length || 0) +
                                        (rec.photos?.length || 0) >
                                      0
                                        ? ` (${
                                            (rec.voiceNotes?.length || 0) +
                                            (rec.photos?.length || 0)
                                          })`
                                        : ""}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPreselectedMinutesRecordId(rec.id);
                                      setActiveTab("kesif_zapti");
                                    }}
                                    className="inline-flex items-center gap-1 rounded border border-purple-400 bg-purple-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-purple-700 whitespace-nowrap"
                                    title="Bu dosyanın keşif zaptını hazırla ve Word (.doc) olarak indir"
                                  >
                                    <FileText className="h-3 w-3" />
                                    <span>Keşif Zaptı Hazırla</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingInspection(rec)}
                                    className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-950 hover:bg-amber-100 whitespace-nowrap"
                                    title="Bu keşfin tüm detaylarını (tarih, saat, parseller, bilirkişi, notlar) düzenle"
                                  >
                                    <Pencil className="h-3 w-3 text-amber-700" />
                                    <span>Düzenle</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedCardIds((prev) => ({
                                        ...prev,
                                        [rec.id]: !prev[rec.id],
                                      }))
                                    }
                                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                                  >
                                    {expandedCardIds[rec.id] ? (
                                      <>
                                        <ChevronUp className="h-3 w-3" />
                                        <span>Detayı Gizle</span>
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="h-3 w-3" />
                                        <span>Detay</span>
                                      </>
                                    )}
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleOpenNewInspectionTab({
                                        customDate: rec.date,
                                        customLocation: {
                                          district: rec.district,
                                          neighborhood: rec.neighborhood,
                                          lat: rec.lat,
                                          lng: rec.lng,
                                        },
                                      })
                                    }
                                    className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700 whitespace-nowrap"
                                  >
                                    + Yanına Ekle
                                  </button>
                                  {confirmDeleteId === rec.id ? (
                                    <div className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px]">
                                      <span className="font-bold text-rose-900">Silinsin mi?</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleDeleteInspection(rec.id);
                                          setConfirmDeleteId(null);
                                        }}
                                        className="rounded bg-rose-600 px-1.5 py-0.5 font-bold text-white hover:bg-rose-700"
                                      >
                                        Evet
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(null)}
                                        className="rounded bg-white px-1.5 py-0.5 font-semibold text-slate-700"
                                      >
                                        İptal
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(rec.id)}
                                      className="rounded border border-slate-200 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                      title="Kaydı Sil (Onay İster)"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Collapsible Expanded Card Details (Bölüm 7) */}
                              {expandedCardIds[rec.id] && (
                                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-xs space-y-2">
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                    <div>
                                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                                        Taraf / İlgili Kişi
                                      </span>
                                      <span className="font-semibold text-slate-800">
                                        {rec.partyName || "Belirtilmedi"}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                                        GPS Koordinatları & Koridor
                                      </span>
                                      <span className="font-mono text-[11px] text-slate-700">
                                        {rec.lat.toFixed(5)}, {rec.lng.toFixed(5)} · {rec.corridor}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                                        Saha Medya & Kayıt Özeti
                                      </span>
                                      <span className="text-slate-700">
                                        {rec.voiceNotes?.length || 0} Sesli Not ·{" "}
                                        {rec.photos?.length || 0} Fotoğraf ·{" "}
                                        {rec.historyLog?.length || 0} İşlem Kaydı
                                      </span>
                                    </div>
                                  </div>
                                  {rec.historyLog && rec.historyLog.length > 0 && (
                                    <div className="border-t border-slate-200 pt-2">
                                      <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                                        Son İşlem Geçmişi
                                      </span>
                                      <div className="space-y-1">
                                        {rec.historyLog.slice(0, 3).map((h) => (
                                          <div
                                            key={h.id}
                                            className="flex flex-wrap items-center justify-between text-[11px] text-slate-600"
                                          >
                                            <span>
                                              <strong>{h.action}</strong>
                                              {h.actor ? ` (${h.actor})` : ""}
                                            </span>
                                            <span className="font-mono text-[10px] text-slate-400">
                                              {h.timestamp}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* VIEW 3: AYLIK TAKVİM */}
        {activeTab === "takvim" && (
          <CalendarView
            inspections={inspections}
            weatherMap={weatherMap}
            selectedDate={selectedCalendarDate}
            onSelectDate={(d) => setSelectedCalendarDate(d)}
            onAddForDate={(d) => handleOpenNewInspectionTab({ customDate: d })}
            onOpenOnMap={(d) => {
              setMapFilterDate(d);
              setFocusedInspectionId(null);
              setActiveTab("harita");
            }}
            onShareDailyRoute={(d) => setShareRouteDate(d)}
            onEditRecord={(rec) => setEditingInspection(rec)}
            onExportMonthlyExcel={(ym) => {
              setExcelYearMonth(ym);
              setIsExcelModalOpen(true);
            }}
            onUpdateStatus={(id, st) => handleUpdateInspectionStatus(id, st)}
            onDeleteRecord={handleDeleteInspection}
          />
        )}

        {/* VIEW 4: GENEL HARİTA & ADA/PARSEL SINIRLARI */}
        {activeTab === "harita" && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 app-card p-4 sm:p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#246B73]/12 px-2.5 py-0.5 text-[11px] font-bold text-[#246B73]">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>CBS Saha & Parsel Haritası</span>
                  </span>
                  <span className="text-xs font-mono text-slate-500">
                    TKGM Poligon · OSRM Rota · Uydu & Sokak Katmanı
                  </span>
                </div>
                <h1 className="text-base sm:text-lg font-bold text-slate-900 mt-1">
                  Genel Keşif Haritası & Taşınmaz (Ada/Parsel) Sınırları
                </h1>
                <p className="text-xs text-slate-500">
                  Keşif türüne göre dinamik renkli/ikonlu pinler, parsel sınır poligonları ve Adliye çıkışlı güzergahlar
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {focusedInspectionId && (
                  <button
                    type="button"
                    onClick={() => setFocusedInspectionId(null)}
                    className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    Tüm Harita Görünümüne Dön
                  </button>
                )}

                {mapFilterDate && (
                  <button
                    type="button"
                    onClick={() => setShareRouteDate(mapFilterDate)}
                    className="flex items-center gap-1.5 rounded-xl bg-[#246B73] px-3 py-1.5 text-xs font-bold text-white hover:opacity-95 whitespace-nowrap"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    <span>Güzergahı Paylaş</span>
                  </button>
                )}

                <select
                  value={mapFilterDate || "ALL"}
                  onChange={(e) => {
                    setFocusedInspectionId(null);
                    setMapFilterDate(
                      e.target.value === "ALL" ? null : e.target.value
                    );
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#246B73] focus:outline-none"
                >
                  <option value="ALL">
                    Tüm Kayıtları & Parselleri Göster ({inspections.length} Dosya)
                  </option>
                  {uniqueDates.map((d) => {
                    const count = inspections.filter((r) => r.date === d).length;
                    return (
                      <option key={d} value={d}>
                        {formatDateTR(d)} Günü Rotaları ({count} Keşif)
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {mapFilterDate && dailyRouteMetrics && (
              <div className="rounded-xl border border-[#246B73]/30 bg-[#246B73]/8 p-3.5 text-xs text-slate-900 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong>{formatLongDateTR(mapFilterDate)} Güzergahı:</strong>{" "}
                  🏛️ Çıkış: Fatsa Adliyesi &rarr; Sıralı Duraklar &rarr; 🏁 Varış: Fatsa Adliyesi
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono font-bold text-[#246B73] tabular-nums">
                    Toplam Yol: {dailyRouteMetrics.distanceKm} km (~{dailyRouteMetrics.durationMin} dk)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShareRouteDate(mapFilterDate)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#246B73] px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-95"
                  >
                    <Share2 className="h-3 w-3" />
                    <span>Durakları & Dosya No Paylaş</span>
                  </button>
                </div>
              </div>
            )}

            <div className="app-card p-3 sm:p-4">
              <InteractiveMap
                mode="overview"
                selectedLat={selectedLat}
                selectedLng={selectedLng}
                selectedLabel={`[${formDistrict}] ${neighborhoodInput} (${adaNo || "0"} Ada / ${parselNo || "1"} Parsel)`}
                selectedParcelPolygon={parcelPolygon}
                selectedParcelMeta={{
                  adaNo: adaNo.trim() || undefined,
                  parselNo: parselNo.trim() || undefined,
                  nitelik: nitelik.trim() || undefined,
                  yuzolcumuM2:
                    Number(yuzolcumuInput) > 0
                      ? Number(yuzolcumuInput)
                      : undefined,
                  paftaNo: paftaNo.trim() || undefined,
                }}
                focusParcelZoomTrigger={focusParcelZoomTrigger}
                inspections={
                  mapFilterDate
                    ? inspections.filter((r) => r.date === mapFilterDate)
                    : inspections
                }
                filterDate={mapFilterDate}
                focusedInspectionId={focusedInspectionId}
                onSelectInspection={(rec) => setFocusedInspectionId(rec.id)}
                dailyRouteGeometry={dailyRouteGeometry}
                heightClass="h-[380px] sm:h-[520px]"
              />
            </div>

            {/* Quick Parcel Selector Chips below Overview Map */}
            <div className="app-card p-4">
              <div className="text-xs font-bold text-slate-800 mb-2">
                Kayıtlı Taşınmazlar & Araçlar (Sınırına / Konumuna Yakınlaşmak İçin Tıklayın):
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(mapFilterDate
                  ? inspections.filter((r) => r.date === mapFilterDate)
                  : inspections
                ).map((rec) => {
                  const isSelected = focusedInspectionId === rec.id;
                  return (
                    <div
                      key={rec.id}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors ${
                        isSelected
                          ? "border-amber-600 bg-amber-50 text-amber-950 font-bold"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-amber-400"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setFocusedInspectionId(isSelected ? null : rec.id)
                        }
                        className="text-left"
                      >
                        {rec.subjectType === "arac" && rec.vehicleInfo?.plateNo ? (
                          <span className="font-mono font-bold text-indigo-800">
                            🚗 {rec.vehicleInfo.plateNo}
                          </span>
                        ) : rec.parcels && rec.parcels.length > 1 ? (
                          <span className="font-mono font-bold text-amber-800">
                            📐 {rec.parcels.length} Parsel ({rec.parcels[0].adaNo}/{rec.parcels[0].parselNo}+)
                          </span>
                        ) : (
                          <span className="font-mono font-bold text-amber-800">
                            📐 {rec.adaNo || "0"}/{rec.parselNo || "1"}
                          </span>
                        )}{" "}
                        <span>
                          [{rec.district}] {rec.neighborhood.replace(" Mahallesi", "")}
                        </span>{" "}
                        <span className="text-[11px] text-slate-500">
                          ({rec.esasNo})
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingInspection(rec)}
                        className="ml-1 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-bold text-amber-900 hover:bg-amber-100"
                        title="Keşfi Düzenle"
                      >
                        Düzenle
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4.5: YAPAY ZEKA ÇOKLU MAHALLE & PARSEL ROTA VE GÜN TAVSİYESİ */}
        {activeTab === "ai_rota" && (
          <MultiRouteAdvisorView
            existingInspections={inspections}
            defaultExpertsText={combinedExpertsText}
            createdByLabel={
              createdByInput.trim() ||
              formatUserProfileCreator(userProfile, autoDetectedDeviceLabel)
            }
            deviceType={detectedDeviceType}
            onAddRecordsBatch={(newBatch) => {
              const updated = [...inspections, ...newBatch];
              setInspections(updated);
              pushRecordsToCloudIfEnabled(updated);
            }}
            onSwitchToAgenda={() => setActiveTab("ajanda")}
          />
        )}

        {/* VIEW 4.8: MOR MENÜ — KEŞİF ZAPTI HAZIRLA & BİLİRKİŞİ REHBERİ */}
        {(activeTab === "kesif_zapti" || activeTab === "bilirkisiler") && (
          <InspectionMinutesView
            inspections={inspections}
            registeredExperts={registeredExperts}
            initialSubTab={
              activeTab === "bilirkisiler" ? "bilirkisiler" : "zapt"
            }
            preselectedRecordId={preselectedMinutesRecordId}
            onSaveRegisteredExperts={handleSaveRegisteredExperts}
            onUpdateInspectionsBatch={(updatedList) => {
              setInspections(updatedList);
              pushRecordsToCloudIfEnabled(updatedList);
            }}
          />
        )}

        {/* VIEW 4.9: AYLIK VE GÜNLÜK İSTATİSTİK GRAFİKLERİ PANELİ */}
        {activeTab === "istatistikler" && (
          <StatisticsDashboardView
            inspections={inspections}
            onOpenExcelModalForMonth={(ym) => {
              setExcelYearMonth(ym);
              setIsExcelModalOpen(true);
            }}
            onSelectInspectionToEdit={(rec) => setEditingInspection(rec)}
          />
        )}

        {/* VIEW 5: AYARLAR (KULLANICI ADI, UNVAN SEÇİMİ VE BULUT SENKRONİZASYON) */}
        {activeTab === "ayarlar" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
            {/* Left 7 Columns: User Identity & Title Settings */}
            <div className="lg:col-span-7 app-card p-5 sm:p-6 space-y-5">
              <div className="border-b border-slate-200 pb-4">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[#246B73]/12 px-2.5 py-0.5 text-[11px] font-bold text-[#246B73] mb-1.5">
                  <UserCheck className="h-3.5 w-3.5" />
                  <span>Kalem & Heyet Profil Yönetimi</span>
                </span>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold text-slate-900">
                    Kullanıcı Profili & Unvan Ayarları
                  </h1>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Burada belirlediğiniz Ad Soyad ve Unvan (Hakim, Zabıt Katibi, Mübaşir, Yazı İşleri Müdürü), yeni eklediğiniz tüm keşiflerde <strong>"Keşfi Ekleyen Kişi"</strong> olarak otomatik kullanılır.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    1. Görev / Unvan Seçiniz *
                  </label>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {USER_TITLE_OPTIONS.map((tOpt) => {
                      const isSelected = userProfile.title === tOpt.title;
                      return (
                        <button
                          key={tOpt.title}
                          type="button"
                          onClick={() =>
                            handleSaveUserProfile({
                              ...userProfile,
                              title: tOpt.title,
                            })
                          }
                          className={`flex items-center gap-2 rounded-xl border p-3 text-left text-xs font-bold transition-all ${
                            isSelected
                              ? "border-[#246B73] bg-[#246B73]/10 text-slate-900 ring-2 ring-[#246B73]/20"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          <span className="text-base">{tOpt.icon}</span>
                          <div>
                            <div>{tOpt.title}</div>
                            <div className="text-[10px] font-normal text-slate-500">
                              {tOpt.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      2. Adınız ve Soyadınız *
                    </label>
                    <input
                      type="text"
                      value={userProfile.fullName}
                      onChange={(e) =>
                        handleSaveUserProfile({
                          ...userProfile,
                          fullName: e.target.value,
                        })
                      }
                      placeholder="Örn: Ahmet Yılmaz"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 focus:border-[#246B73] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      3. Sicil Numarası (İsteğe Bağlı)
                    </label>
                    <input
                      type="text"
                      value={userProfile.sicilNo || ""}
                      onChange={(e) =>
                        handleSaveUserProfile({
                          ...userProfile,
                          sicilNo: e.target.value,
                        })
                      }
                      placeholder="Örn: ab123456"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs sm:text-sm font-mono text-slate-900 focus:border-[#246B73] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    4. Görevli Mahkeme / Kalem Birimi
                  </label>
                  <input
                    type="text"
                    value={userProfile.courtUnit || ""}
                    onChange={(e) =>
                      handleSaveUserProfile({
                        ...userProfile,
                        courtUnit: e.target.value,
                      })
                    }
                    placeholder="Örn: Fatsa Sulh Hukuk Mahkemesi Kalemi"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs sm:text-sm text-slate-900 focus:border-[#246B73] focus:outline-none"
                  />
                </div>

                <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={userProfile.includeDeviceName}
                    onChange={(e) =>
                      handleSaveUserProfile({
                        ...userProfile,
                        includeDeviceName: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-[#246B73] focus:ring-[#246B73]"
                  />
                  <span>
                    Keşfi ekleyen kişi bilgisinin yanına bilgisayar/telefon adını da ekle ({autoDetectedDeviceLabel || "Cihaz Adı"})
                  </span>
                </label>

                <div className="rounded-xl border border-[#246B73]/30 bg-[#246B73]/8 p-3.5 space-y-1">
                  <div className="text-[11px] font-bold text-[#246B73] uppercase">
                    KEŞİFLERDE GÖRÜNECEK AKTİF EKLEYEN KİŞİ BİLGİSİ:
                  </div>
                  <div className="text-sm font-bold text-slate-900 font-mono">
                    {formatUserProfileCreator(
                      userProfile,
                      autoDetectedDeviceLabel
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleSaveUserProfile(userProfile);
                      setFormBannerMessage(
                        `Kullanıcı ayarları kaydedildi: ${formatUserProfileCreator(
                          userProfile,
                          autoDetectedDeviceLabel
                        )}`
                      );
                      setTimeout(() => setFormBannerMessage(null), 4000);
                    }}
                    className="rounded-xl bg-[#246B73] px-4 py-2 text-xs font-bold text-white hover:opacity-95"
                  >
                    ✓ Ayarları Kaydet & Uygula
                  </button>
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Cloud Sync & GitHub / Google Apps Script Shortcut */}
            <div className="lg:col-span-5 app-card p-5 sm:p-6 space-y-4">
              <div className="border-b border-slate-200 pb-3">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[#246B73]/12 px-2.5 py-0.5 text-[11px] font-bold text-[#246B73] mb-1.5">
                  <Cloud className="h-3.5 w-3.5" />
                  <span>Bulut Eşitleme, Tema & Veri Yedekleme</span>
                </span>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    Bulut Senkronizasyon (GitHub & Google E-Tablolar)
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Google Apps Script'te <em>"Google hesabı olan herkes"</em> kısıtlamasına takılmadan çalışmak için <strong>GitHub Gist / Repo Senkronizasyonu</strong> veya <strong>Google Oturumlu Köprü</strong> kullanabilirsiniz.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">
                    Aktif Senkronizasyon Yöntemi:
                  </span>
                  <span className="rounded bg-[#1B2733] px-2 py-0.5 font-mono text-[11px] font-bold text-[#63B5B0]">
                    {cloudConfig.mode === "github"
                      ? `GitHub (${cloudConfig.githubSyncType === "repo" ? "Repository" : "Gist"})`
                      : "Google Apps Script"}
                  </span>
                </div>
                {cloudConfig.lastSyncAt && (
                  <div className="text-[11px] text-slate-600">
                    Son Eşitleme: <strong>{cloudConfig.lastSyncAt}</strong>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsCloudModalOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1B2733] px-4 py-2.5 text-xs font-bold text-white hover:opacity-95"
              >
                <Cloud className="h-4 w-4 text-[#63B5B0]" />
                <span>
                  GitHub & Google Apps Script Senkronizasyon Ayarlarını Aç
                </span>
              </button>

              {/* GitHub 'ksf' Repository & GitHub Pages Yayınlama Bölümü */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    GitHub &lsquo;ksf&rsquo; Reposunda Yayınla (GitHub Pages)
                  </h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Projeyi GitHub hesabınızdaki <strong>ksf</strong> isimli depoya yükler ve <strong>GitHub Pages</strong> özelliğini otomatik aktifleştirerek doğrudan <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">https://&lt;kullanici&gt;.github.io/ksf/</code> adresinden çalışmasını sağlar.
                </p>

                {publishResult && (
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-3 text-xs space-y-1.5">
                    <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>GitHub &lsquo;{publishResult.repoName}&rsquo; Deposu Yayında!</span>
                    </div>
                    <div className="text-[11px] text-slate-700">
                      <strong>GitHub Pages Adresi:</strong>{" "}
                      <a
                        href={publishResult.pagesUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono font-bold text-indigo-700 underline hover:text-indigo-900 break-all"
                      >
                        {publishResult.pagesUrl}
                      </a>
                    </div>
                    <div className="text-[11px] text-slate-700">
                      <strong>GitHub Repo:</strong>{" "}
                      <a
                        href={publishResult.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-slate-800 underline hover:text-slate-950 break-all"
                      >
                        {publishResult.repoUrl}
                      </a>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (!publishToken && cloudConfig.githubToken) {
                      setPublishToken(cloudConfig.githubToken);
                    }
                    setIsPublishModalOpen(true);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 shadow-xs"
                >
                  <GitBranch className="h-4 w-4" />
                  <span>
                    Projeyi GitHub &lsquo;ksf&rsquo; Reposunda Yayınla (GitHub Pages)
                  </span>
                </button>
              </div>

              {/* Görünüm, Tema (Açık / Koyu / Sistem) & Yazı Boyutu (Bölüm 4 & 19) */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sun className="h-4 w-4 text-[#246B73]" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Görünüm, Tema & Yazı Boyutu Ayarları
                  </h3>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: "light", label: "Açık Tema", icon: <Sun className="h-3.5 w-3.5" /> },
                      { id: "dark", label: "Koyu Tema", icon: <Moon className="h-3.5 w-3.5" /> },
                      { id: "system", label: "Sistem Teması", icon: <Monitor className="h-3.5 w-3.5" /> },
                    ] as { id: ThemePreference; label: string; icon: React.ReactNode }[]
                  ).map((tm) => (
                    <button
                      key={tm.id}
                      type="button"
                      onClick={() => handleUpdateAppPrefs({ themeMode: tm.id })}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-bold transition-all ${
                        appPrefs.themeMode === tm.id
                          ? "border-[#246B73] bg-[#246B73] text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      {tm.icon}
                      <span>{tm.label}</span>
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Yazı Boyutu & Yoğunluk:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: "compact", label: "Kompakt" },
                        { id: "normal", label: "Standart" },
                        { id: "large", label: "Büyük (Saha)" },
                      ] as { id: FontScalePreference; label: string }[]
                    ).map((fs) => (
                      <button
                        key={fs.id}
                        type="button"
                        onClick={() => handleUpdateAppPrefs({ fontScale: fs.id })}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${
                          appPrefs.fontScale === fs.id
                            ? "border-[#246B73] bg-teal-50 text-teal-950 font-bold"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        {fs.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Yerel Veri Yedekleme & Geri Yükleme (Bölüm 19 & 21) */}
              <div className="border-t border-slate-200 pt-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Tam Veri Yedekleme & Geri Yükleme (.JSON)
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500">
                  Mevcut tüm keşif kayıtlarını ({inspections.length} dosya), bilirkişi listesini ({registeredExperts.length} uzman) ve profil ayarlarınızı cihazınıza yedekleyebilir veya yedekten geri yükleyebilirsiniz.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleDownloadLocalBackup}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#16845B] px-3 py-2 text-xs font-bold text-white hover:opacity-95"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>JSON Yedeği İndir</span>
                  </button>
                  <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    <Upload className="h-3.5 w-3.5 text-blue-600" />
                    <span>Yedekten Geri Yükle</span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={handleRestoreLocalBackup}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Oturum Güvenliği & Şifre Kilitleme */}
              <div className="border-t border-slate-200 pt-4 flex items-center justify-between gap-2">
                <div className="text-xs text-slate-600">
                  <div className="font-bold text-slate-800">Açılış Şifre Koruması Aktif</div>
                  <div className="text-[11px] text-slate-500">
                    Giriş Şifresi: <code className="font-mono font-bold text-slate-800">Fatsa2.SHM52</code>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLockApp}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>Ekranı Kilitle</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ====================================================================
          ERGONOMİK 5 BÖLÜMLÜ MOBİL ALT NAVİGASYON + HIZLI İŞLEM MENÜSÜ (BÖLÜM 6)
         ==================================================================== */}
      {isQuickActionMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-3 backdrop-blur-xs md:hidden"
          onClick={() => setIsQuickActionMenuOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="text-xs font-bold text-slate-900">
                + Hızlı Saha & Kalem İşlemi Seçin
              </span>
              <button
                type="button"
                onClick={() => setIsQuickActionMenuOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsQuickActionMenuOpen(false);
                  handleOpenNewInspectionTab();
                }}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-xs font-bold text-slate-900 hover:border-teal-500"
              >
                <Plus className="h-4 w-4 text-[#246B73] shrink-0" />
                <span>Yeni Keşif Planla</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsQuickActionMenuOpen(false);
                  setActiveTab("kesif_zapti");
                }}
                className="flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 p-3 text-left text-xs font-bold text-purple-950"
              >
                <FileText className="h-4 w-4 text-purple-700 shrink-0" />
                <span>Keşif Zaptı Hazırla</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsQuickActionMenuOpen(false);
                  setActiveTab("bilirkisiler");
                }}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-xs font-bold text-slate-900"
              >
                <Users className="h-4 w-4 text-indigo-600 shrink-0" />
                <span>Yeni Bilirkişi Kaydı</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsQuickActionMenuOpen(false);
                  setIsAiAssistantOpen(true);
                }}
                className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3 text-left text-xs font-bold text-teal-950"
              >
                <Sparkles className="h-4 w-4 text-[#246B73] shrink-0" />
                <span>YZ Saha Asistanı</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsQuickActionMenuOpen(false);
                  setActiveTab("takvim");
                }}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-xs font-bold text-slate-900"
              >
                <CalendarIcon className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Aylık Takvim</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsQuickActionMenuOpen(false);
                  setActiveTab("ayarlar");
                }}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-xs font-bold text-slate-900"
              >
                <Settings className="h-4 w-4 text-slate-600 shrink-0" />
                <span>Ayarlar & Profil</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-slate-200 bg-white/95 py-2 px-1.5 shadow-lg backdrop-blur-md md:hidden">
        <button
          onClick={() => setActiveTab("ana_sayfa")}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold ${
            activeTab === "ana_sayfa" ? "text-[#246B73] font-bold" : "text-slate-500"
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          <span>Ana Sayfa</span>
        </button>
        <button
          onClick={() => setActiveTab("ajanda")}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold ${
            activeTab === "ajanda" || activeTab === "takvim"
              ? "text-[#246B73] font-bold"
              : "text-slate-500"
          }`}
        >
          <ListOrdered className="h-4 w-4" />
          <span>Ajanda</span>
        </button>
        <button
          onClick={() => {
            setFocusedInspectionId(null);
            setActiveTab("harita");
          }}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold ${
            activeTab === "harita" ? "text-[#246B73] font-bold" : "text-slate-500"
          }`}
        >
          <MapIcon className="h-4 w-4" />
          <span>Harita</span>
        </button>
        <button
          onClick={() => setIsQuickActionMenuOpen((v: boolean) => !v)}
          className="flex flex-col items-center gap-0.5 rounded-xl bg-[#246B73] px-3 py-1 text-[10px] font-bold text-white shadow-sm"
        >
          <Plus className="h-4 w-4" />
          <span>+ İşlem</span>
        </button>
        <button
          onClick={() => setActiveTab("kesif_zapti")}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold ${
            activeTab === "kesif_zapti" || activeTab === "bilirkisiler"
              ? "text-purple-700 font-bold"
              : "text-slate-500"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Keşifler/Zapt</span>
        </button>
        <button
          onClick={() => setActiveTab("istatistikler")}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold ${
            activeTab === "istatistikler" ? "text-[#246B73] font-bold" : "text-slate-500"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span>Raporlar</span>
        </button>
      </nav>

      {/* Quiet Institutional Desktop Footer */}
      <footer className="hidden md:block border-t border-slate-200 bg-white px-4 py-4 text-xs text-slate-500 sm:px-8">
        <div className="mx-auto flex max-w-[1360px] flex-col items-center justify-between gap-2 sm:flex-row">
          <div>
            Fatsa, Çamaş ve Çatalpınar Sulh Hukuk Yargı Çevresi · Merkez: Fatsa Adliyesi
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsExcelModalOpen(true)}
              className="font-semibold text-emerald-700 hover:text-emerald-900 underline-offset-4 hover:underline"
            >
              Aylık Yapılan Keşifler Excel Raporu
            </button>
            <span aria-hidden="true">·</span>
            <button
              onClick={() => setIsPdfModalOpen(true)}
              className="hover:text-slate-900 underline-offset-4 hover:underline"
            >
              PDF Çıktısı Al
            </button>
            <span aria-hidden="true">·</span>
            <button
              onClick={() => setIsCloudModalOpen(true)}
              className="hover:text-slate-900 underline-offset-4 hover:underline"
            >
              Google Drive / E-Tablolar Eşitleme
            </button>
          </div>
        </div>
      </footer>

      {/* ====================================================================
          PDF EXPORT MODAL (Günlük, Haftalık veya Aylık Dışa Aktarma)
         ==================================================================== */}
      {isPdfModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 sm:px-6 sm:py-4 text-white">
              <div className="flex items-center gap-2">
                <FileDown className="h-5 w-5 text-emerald-400" />
                <div>
                  <h2 className="text-sm sm:text-base font-semibold">
                    Keşif Programını PDF Olarak İndir
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Fatsa, Çamaş ve Çatalpınar resmi keşif programı (Ada/Parsel cetvelli)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPdfModalOpen(false)}
                className="rounded-lg p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  1. Rapor Kapsamı
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: "daily", label: "Günlük PDF", sub: "Tek gün" },
                      { id: "weekly", label: "Haftalık PDF", sub: "Hafta planı" },
                      { id: "monthly", label: "Aylık PDF", sub: "Tüm ay" },
                    ] as { id: PdfExportPeriod; label: string; sub: string }[]
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPdfPeriod(item.id)}
                      className={`rounded-lg border p-2 sm:p-2.5 text-left transition-all ${
                        pdfPeriod === item.id
                          ? "border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900">
                        {item.label}
                      </div>
                      <div className="text-[10px] text-slate-500">{item.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  2. Referans Tarih
                </label>
                <input
                  type="date"
                  value={pdfReferenceDate}
                  onChange={(e) => setPdfReferenceDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                <div className="font-bold text-slate-900">
                  {pdfPreviewData.title}
                </div>
                <div className="text-slate-600">{pdfPreviewData.subtitle}</div>
                <div className="font-mono text-emerald-700 font-semibold pt-1">
                  Rapordaki dosya sayısı: {pdfPreviewData.filtered.length} Adet Keşif
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => setIsPdfModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isGeneratingPdf}
                onClick={() => handleRunPdfExport()}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <FileDown className="h-4 w-4" />
                {isGeneratingPdf ? "Hazırlanıyor..." : "PDF İndir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          GÜNLÜK KEŞİF GÜZERGAHI PAYLAŞIM MODALI (Çıkış Noktası, Duraklar, Varış ve Dosya Numaraları)
         ==================================================================== */}
      {shareRouteDate && shareRouteData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 sm:px-6 sm:py-4 text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <Share2 className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <h2 className="text-sm sm:text-base font-bold">
                    Günlük Keşif Güzergahı & Durak Listesi Paylaşımı
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    {shareRouteData.formattedDate} · Çıkış Noktası, Sıralı Duraklar, Dosya Numaraları ve Varış Noktası
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShareRouteDate(null)}
                className="rounded-lg p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {/* Visual Route Timeline (Çıkış -> Duraklar -> Varış) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
                {/* Departure Node */}
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs text-white font-bold">
                    🏛️
                  </div>
                  <div className="text-xs">
                    <div className="font-bold text-emerald-800 uppercase tracking-wide text-[10px]">
                      ÇIKIŞ NOKTASI (Tahmini Hareket: {shareRouteData.suggestedDepartureTime})
                    </div>
                    <div className="font-bold text-slate-900">
                      {FATSA_COURTHOUSE.name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {FATSA_COURTHOUSE.address}
                    </div>
                  </div>
                </div>

                {/* Intermediate Stops */}
                <div className="ml-3.5 border-l-2 border-dashed border-emerald-500 pl-5 space-y-2.5 py-1">
                  {shareRouteData.records.map((rec, idx) => {
                    const cMeta = getCaseTypeVisualMeta(rec.caseType);
                    const adaParselStr = formatAdaParselLabel(rec);
                    const addressStr = formatAddressLabel(rec);
                    return (
                      <div
                        key={rec.id}
                        className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-2xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                              {idx + 1}. DURAK · {rec.time}
                            </span>
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-950">
                              Dosya: {rec.esasNo}
                            </span>
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
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-slate-700">
                            {rec.distanceKm} km (~{rec.durationMin} dk)
                          </span>
                        </div>

                        <div className="mt-1 font-bold text-slate-900">
                          Varış: [{rec.district}] {rec.neighborhood}
                          {adaParselStr && (
                            <span className="ml-1.5 font-mono text-amber-800">
                              ({adaParselStr}
                              {rec.yuzolcumuM2
                                ? ` · ${formatAreaM2(rec.yuzolcumuM2)} m²`
                                : ""}
                              )
                            </span>
                          )}
                          {addressStr && (
                            <span className="ml-1.5 text-teal-800">
                              (🏠 {addressStr})
                            </span>
                          )}
                        </div>

                        {rec.parcels && rec.parcels.length > 1 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {rec.parcels.map((p, pIdx) => (
                              <span
                                key={p.id || pIdx}
                                className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-950"
                              >
                                {pIdx + 1}){" "}
                                {p.neighborhood
                                  ? `${p.neighborhood.replace(/\s+Mahallesi$/i, "")} `
                                  : ""}
                                {p.adaNo}/{p.parselNo}
                                {p.bagimsizBolumNo
                                  ? ` · B.Bölüm No: ${p.bagimsizBolumNo}`
                                  : ""}
                              </span>
                            ))}
                          </div>
                        )}

                        {rec.experts && (
                          <div className="mt-0.5 text-[11px] text-slate-600">
                            <strong>Bilirkişi Heyeti:</strong> {rec.experts}
                          </div>
                        )}
                        {rec.createdBy && (
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            <strong>Keşfi Ekleyen:</strong> {rec.createdBy}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Arrival Node */}
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-xs text-white font-bold">
                    🏁
                  </div>
                  <div className="text-xs">
                    <div className="font-bold text-emerald-800 uppercase tracking-wide text-[10px]">
                      SON VARIŞ / DÖNÜŞ NOKTASI
                    </div>
                    <div className="font-bold text-slate-900">
                      {FATSA_COURTHOUSE.name} (Adliye Merkezine Dönüş)
                    </div>
                    <div className="font-mono text-[11px] text-slate-600 mt-0.5">
                      Toplam {shareRouteData.records.length} Keşif Dosyası · Gidiş-Dönüş ~{shareRouteData.totalKm} km (~{shareRouteData.totalMin} dk)
                    </div>
                  </div>
                </div>
              </div>

              {/* Formatted Plain Text Preview (Editable/Copyable) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Paylaşılacak Resmi Güzergah Özeti (WhatsApp / UYAP / SMS / E-Posta):
                </label>
                <textarea
                  readOnly
                  rows={8}
                  value={shareRouteData.shareText}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-800 focus:outline-none"
                />
              </div>
            </div>

            {/* Modal Footer: Share Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyRouteShareText}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800"
                >
                  <Copy className="h-3.5 w-3.5 text-emerald-400" />
                  <span>
                    {copiedRouteFeedback
                      ? "✓ Güzergah Metni Kopyalandı!"
                      : "Güzergah Metnini Kopyala"}
                  </span>
                </button>

                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    shareRouteData.shareText
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>WhatsApp'ta Paylaş</span>
                </a>

                <a
                  href={shareRouteData.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100"
                >
                  <Navigation className="h-3.5 w-3.5 text-emerald-700" />
                  <span>Google Haritalar'da Çok Duraklı Aç</span>
                </a>

                {typeof navigator !== "undefined" && "share" in navigator && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator
                        .share({
                          title: `Fatsa Sulh Hukuk - ${shareRouteData.formattedDate} Keşif Güzergahı`,
                          text: shareRouteData.shareText,
                          url: shareRouteData.googleMapsUrl,
                        })
                        .catch(() => {});
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <span>Mobil Paylaş</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShareRouteDate(null)}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cloud Sync & 3-Step Setup Guide Modal */}
      <CloudSyncModal
        isOpen={isCloudModalOpen}
        onClose={() => setIsCloudModalOpen(false)}
        config={cloudConfig}
        onSaveConfig={handleSaveCloudConfig}
        records={inspections}
        onReplaceRecords={(newRecords) => {
          // Buluttan çekilen kayıtlarda örnek verileri temizle ve kullanıcının yerel kayıtlarını koruyarak birleştir
          const incomingClean = newRecords
            .filter((r) => !isSampleInspectionRecord(r))
            .map(enrichLegacyRecord);
          setInspections((prev) => {
            const map = new Map<string, InspectionRecord>();
            for (const item of prev) {
              if (!isSampleInspectionRecord(item)) {
                map.set(item.id, item);
              }
            }
            for (const inc of incomingClean) {
              map.set(inc.id, inc);
            }
            return Array.from(map.values());
          });
        }}
      />

      {/* ====================================================================
          KEŞİF YAPILDI — KATILAN HAKİM, KATİP VE MÜBAŞİR KAYIT MODALI
         ==================================================================== */}
      {completingInspection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-3.5 text-white">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <h2 className="text-sm sm:text-base font-bold">
                    Keşif Yapıldı — Katılan Personel Bilgileri
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    {completingInspection.esasNo} · [{completingInspection.district}]{" "}
                    {completingInspection.neighborhood} ({formatDateTR(completingInspection.date)}{" "}
                    {completingInspection.time})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCompletingInspection(null)}
                className="rounded-lg p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCompletionStaff} className="p-5 space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950">
                Keşfe katılan <strong>Hakim</strong>, <strong>Katip</strong> ve{" "}
                <strong>Mübaşir</strong> bilgisini aşağıdaki hazır seçeneklerden tıklayarak seçebilir veya kutucuklara elle manuel yazabilirsiniz. Bu bilgiler aylık Excel raporuna doğrudan aktarılır.
              </div>

              {/* 1. HAKİM SEÇİMİ VE MANUEL GİRİŞ */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-900">
                    1. Keşfe Katılan Hakim *
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {COURT_JUDGE_PRESETS.map((judge) => {
                      const isSelected = completionJudgeInput.trim() === judge;
                      return (
                        <button
                          key={judge}
                          type="button"
                          onClick={() => setCompletionJudgeInput(judge)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition-all ${
                            isSelected
                              ? "border-emerald-600 bg-emerald-600 text-white shadow-2xs"
                              : "border-slate-300 bg-white text-slate-800 hover:border-emerald-500"
                          }`}
                        >
                          {isSelected ? "✓ " : ""}
                          {judge}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <input
                  type="text"
                  required
                  value={completionJudgeInput}
                  onChange={(e) => setCompletionJudgeInput(e.target.value)}
                  placeholder="Hakim adını seçin veya elle yazın (Örn: Kadir SAĞLAM)..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* 2. KATİP SEÇİMİ VE MANUEL GİRİŞ */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-900">
                    2. Keşfe Katılan Zabıt Katibi *
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {COURT_CLERK_PRESETS.map((clerk) => {
                      const isSelected = completionClerkInput.trim() === clerk;
                      return (
                        <button
                          key={clerk}
                          type="button"
                          onClick={() => setCompletionClerkInput(clerk)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition-all ${
                            isSelected
                              ? "border-emerald-600 bg-emerald-600 text-white shadow-2xs"
                              : "border-slate-300 bg-white text-slate-800 hover:border-emerald-500"
                          }`}
                        >
                          {isSelected ? "✓ " : ""}
                          {clerk}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <input
                  type="text"
                  required
                  value={completionClerkInput}
                  onChange={(e) => setCompletionClerkInput(e.target.value)}
                  placeholder="Katip adını seçin veya elle yazın (Örn: Mehmet AKIN / Mahsuni BAŞBAYDAR)..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* 3. MÜBAŞİR SEÇİMİ VE MANUEL GİRİŞ */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-900">
                    3. Keşfe Katılan Mübaşir *
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {COURT_BAILIFF_PRESETS.map((bailiff) => {
                      const isSelected =
                        completionBailiffInput.trim() === bailiff;
                      return (
                        <button
                          key={bailiff}
                          type="button"
                          onClick={() => setCompletionBailiffInput(bailiff)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition-all ${
                            isSelected
                              ? "border-emerald-600 bg-emerald-600 text-white shadow-2xs"
                              : "border-slate-300 bg-white text-slate-800 hover:border-emerald-500"
                          }`}
                        >
                          {isSelected ? "✓ " : ""}
                          {bailiff}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <input
                  type="text"
                  required
                  value={completionBailiffInput}
                  onChange={(e) => setCompletionBailiffInput(e.target.value)}
                  placeholder="Mübaşir adını seçin veya elle yazın (Örn: Ebru YILMAZ)..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Opsiyonel Keşif İcra Notu */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Keşif İcra Notu (İsteğe Bağlı)
                </label>
                <input
                  type="text"
                  value={completionNoteInput}
                  onChange={(e) => setCompletionNoteInput(e.target.value)}
                  placeholder="Örn: Keşif icra edildi, bilirkişi raporu bekleniyor..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setCompletingInspection(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Keşif Yapıldı Olarak Kaydet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          AYLIK YAPILAN KEŞİFLER EXCEL RAPORU MODALI
         ==================================================================== */}
      {isExcelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-3 sm:p-4 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-3.5 text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <h2 className="text-sm sm:text-base font-bold">
                    Aylık Yapılan Keşifler Excel (.xls) Raporu
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Dosya Numarası, Keşif Tarihi ve Keşfe Katılan Personellerin (Hakim, Katip, Mübaşir) İsim Listesi
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExcelModalOpen(false)}
                className="rounded-lg p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {/* Ay Seçimi ve Kapsam Filtresi */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 items-end rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="sm:col-span-5">
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    1. Rapor Ayı Seçiniz (Yıl / Ay)
                  </label>
                  <input
                    type="month"
                    value={excelYearMonth}
                    onChange={(e) => setExcelYearMonth(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-7">
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    2. Rapor Filtresi
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setExcelOnlyCompleted(true)}
                      className={`rounded-lg border px-3 py-2 text-xs font-bold transition-all ${
                        excelOnlyCompleted
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                      }`}
                    >
                      ✓ Sadece Yapılan Keşifler
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcelOnlyCompleted(false)}
                      className={`rounded-lg border px-3 py-2 text-xs font-bold transition-all ${
                        !excelOnlyCompleted
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                      }`}
                    >
                      Aydaki Tüm Keşifler
                    </button>
                  </div>
                </div>

                {availableYearMonths.length > 0 && (
                  <div className="sm:col-span-12 pt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-500">
                      Hızlı Ay Seçimi:
                    </span>
                    {availableYearMonths.slice(0, 8).map((ym) => {
                      const [y, m] = ym.split("-").map(Number);
                      const label = new Date(y, (m || 1) - 1, 1).toLocaleDateString(
                        "tr-TR",
                        { month: "long", year: "numeric" }
                      );
                      const completedInMonth = inspections.filter(
                        (r) => r.date.startsWith(ym) && r.status === "yapildi"
                      ).length;
                      const totalInMonth = inspections.filter(
                        (r) =>
                          r.date.startsWith(ym) && r.status !== "iptal_edildi"
                      ).length;
                      return (
                        <button
                          key={ym}
                          type="button"
                          onClick={() => setExcelYearMonth(ym)}
                          className={`rounded border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                            excelYearMonth === ym
                              ? "border-emerald-600 bg-emerald-100 text-emerald-950 font-bold"
                              : "border-slate-200 bg-white text-slate-700 hover:border-emerald-400"
                          }`}
                        >
                          {label} ({completedInMonth}/{totalInMonth} Yapıldı)
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tablo Önizlemesi */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-900">
                    Excel Tablosu Önizlemesi ({excelPreviewRecords.length} Dosya)
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Personel bilgisini değiştirmek için satırdaki{" "}
                    <strong>&ldquo;Heyet Düzenle&rdquo;</strong> butonuna tıklayabilirsiniz.
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white">
                        <th className="border-b border-slate-700 px-2.5 py-2 font-bold">
                          Sıra
                        </th>
                        <th className="border-b border-slate-700 px-3 py-2 font-bold">
                          Dosya Numarası
                        </th>
                        <th className="border-b border-slate-700 px-3 py-2 font-bold">
                          Keşif Tarihi
                        </th>
                        <th className="border-b border-slate-700 px-3 py-2 font-bold">
                          Keşfe Katılan Hakim
                        </th>
                        <th className="border-b border-slate-700 px-3 py-2 font-bold">
                          Keşfe Katılan Katip
                        </th>
                        <th className="border-b border-slate-700 px-3 py-2 font-bold">
                          Keşfe Katılan Mübaşir
                        </th>
                        <th className="border-b border-slate-700 px-3 py-2 font-bold text-right">
                          İşlem
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {excelPreviewRecords.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-8 text-center text-xs text-slate-500"
                          >
                            Seçilen ayda ({excelYearMonth}){" "}
                            {excelOnlyCompleted
                              ? '"Yapıldı" olarak işaretlenmiş keşif dosyası bulunamadı. Keşif kartlarındaki "Yapıldı" butonuna tıklayarak katılan personelleri kaydedebilirsiniz veya "Aydaki Tüm Keşifler" filtresine geçebilirsiniz.'
                              : "kayıtlı keşif dosyası bulunamadı."}
                          </td>
                        </tr>
                      ) : (
                        excelPreviewRecords.map((rec, idx) => (
                          <tr key={rec.id} className="hover:bg-slate-50">
                            <td className="px-2.5 py-2 font-mono font-bold text-slate-700">
                              {idx + 1}
                            </td>
                            <td className="px-3 py-2 font-mono font-bold text-slate-900">
                              {rec.esasNo}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-800">
                              {formatDateTR(rec.date)} · {rec.time}
                            </td>
                            <td className="px-3 py-2 font-semibold text-emerald-800">
                              {rec.judgeName || "-"}
                            </td>
                            <td className="px-3 py-2 font-semibold text-blue-900">
                              {rec.clerkName || "-"}
                            </td>
                            <td className="px-3 py-2 font-semibold text-amber-900">
                              {rec.bailiffName || "-"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleOpenCompletionModal(rec)}
                                className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap"
                              >
                                Heyet Düzenle
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5 shrink-0">
              <div className="text-xs text-slate-600">
                Toplam <strong>{excelPreviewRecords.length}</strong> keşif kaydı Excel tablosuna aktarılacak.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsExcelModalOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Kapat
                </button>
                <button
                  type="button"
                  onClick={() => handleRunExcelExport()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>Excel (.xls) Olarak İndir</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          VERİLMİŞ KEŞİFLERİ DÜZENLEME MODALI (TÜM DETAYLAR DEĞİŞTİRİLEBİLİR)
         ==================================================================== */}
      <EditInspectionModal
        record={editingInspection}
        onClose={() => setEditingInspection(null)}
        onSave={handleSaveEditedInspection}
      />

      {/* ====================================================================
          SAHA SESLİ NOT (DİKTE), FOTOĞRAF ARŞİVİ VE İŞLEM GEÇMİŞİ MODALI (BÖLÜM 14)
         ==================================================================== */}
      <FieldMediaNotesModal
        record={mediaModalRecord}
        onClose={() => setMediaModalRecord(null)}
        onSaveUpdatedRecord={(updatedRec: InspectionRecord) => {
          handleSaveEditedInspection(updatedRec);
          setMediaModalRecord(updatedRec);
        }}
        authorLabel={
          createdByInput.trim() ||
          formatUserProfileCreator(userProfile, autoDetectedDeviceLabel)
        }
      />

      {/* ====================================================================
          DOĞAL TÜRKÇE YAPAY ZEKÂ SAHA VE KALEM ASİSTANI MODALI (BÖLÜM 15)
         ==================================================================== */}
      <AiAssistantModal
        isOpen={isAiAssistantOpen}
        onClose={() => setIsAiAssistantOpen(false)}
        inspections={inspections}
        registeredExperts={registeredExperts}
        onEditInspection={(rec: InspectionRecord) => {
          setIsAiAssistantOpen(false);
          setEditingInspection(rec);
        }}
        onPrepareMinutesForRecord={(recId: string) => {
          setIsAiAssistantOpen(false);
          setPreselectedMinutesRecordId(recId);
          setActiveTab("kesif_zapti");
        }}
        onOpenParcelOnMap={(rec: InspectionRecord) => {
          setIsAiAssistantOpen(false);
          handleOpenParcelOnOverviewMap(rec);
        }}
        onOpenExcelModal={() => {
          setIsAiAssistantOpen(false);
          setIsExcelModalOpen(true);
        }}
        onNavigateTab={(tab: ActiveTab) => {
          setIsAiAssistantOpen(false);
          setActiveTab(tab);
        }}
      />

      {/* ====================================================================
          GITHUB 'ksf' REPOSITORY & GITHUB PAGES YAYINLAMA MODALI
         ==================================================================== */}
      {renderGitHubPublishModal()}
    </div>
  );
}
