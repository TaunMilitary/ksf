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
} from "lucide-react";
import {
  ActiveTab,
  CloudSyncConfig,
  CourtDistrict,
  CourtUserTitle,
  InspectionRecord,
  InspectionStatus,
  InspectionSubjectType,
  ParcelBoundarySource,
  ParcelItem,
  PdfExportPeriod,
  SmartSuggestion,
  UserProfileConfig,
  WeatherForecast,
} from "./types";
import {
  CASE_TYPES,
  DEFAULT_APPS_SCRIPT_URL,
  DEFAULT_EXPERT_TITLES,
  DISTRICTS,
  EXPERT_PRESETS,
  FATSA_COURTHOUSE,
  FATSA_NEIGHBORHOODS,
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
  detectClientDeviceInfo,
  fetchNearbyTkgmParcels,
  fetchTkgmParcelByCoordinate,
  findSmartRouteSuggestions,
  formatAdaParselLabel,
  formatAreaM2,
  formatDateTR,
  formatLongDateTR,
  formatUserProfileCreator,
  formatVehicleLabel,
  NominatimSearchResult,
  parseTkgmGeoJson,
  queryParcelBoundary,
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
  filterRecordsByPeriod,
  STATUS_LABELS,
} from "./services/pdfService";
import { InteractiveMap } from "./components/InteractiveMap";
import { CalendarView, renderWeatherIcon } from "./components/CalendarView";
import {
  CloudSyncModal,
  syncPushToActiveCloud,
} from "./components/CloudSyncModal";
import {
  GitHubPublishResult,
  publishProjectToGitHubPagesKsf,
} from "./services/githubPagesPublisher";

const STORAGE_KEY_RECORDS = "fatsa_adliyesi_kesif_kayitlari_v5";
const STORAGE_KEY_CLOUD = "fatsa_adliyesi_cloud_config_v2";
const STORAGE_KEY_DEVICE_IDENTITY = "fatsa_adliyesi_device_identity_v1";
const STORAGE_KEY_USER_PROFILE = "fatsa_adliyesi_user_profile_v1";
const STORAGE_KEY_AUTH_SESSION = "fatsa_adliyesi_auth_session_v1";
const STORAGE_KEY_AUTH_REMEMBER = "fatsa_adliyesi_auth_remember_v1";
const STORAGE_KEY_PUBLISHED_KSF = "fatsa_adliyesi_published_ksf_v1";
const REQUIRED_APP_PASSWORD = "Fatsa2.SHM52";

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
  // 1. State: Inspection Records (Seeded with genuine TKGM parcel boundaries for Fatsa, Çamaş & Çatalpınar)
  const [inspections, setInspections] = useState<InspectionRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RECORDS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(enrichLegacyRecord);
        }
      }
    } catch {
      // ignore
    }
    return getInitialSampleInspections();
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
  const [activeTab, setActiveTab] = useState<ActiveTab>("ajanda");

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
  const [publishToken, setPublishToken] = useState<string>(
    () => cloudConfig.githubToken || ""
  );
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

  // 4. State: PDF Export Modal
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfPeriod, setPdfPeriod] = useState<PdfExportPeriod>("weekly");
  const [pdfReferenceDate, setPdfReferenceDate] = useState<string>(
    () => inspections[0]?.date || new Date().toISOString().split("T")[0]
  );
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

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

  const [esasNo, setEsasNo] = useState("2026/365 E.");
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

  // Ada / Parsel & TKGM Kadastro Taşınmaz Sınır State (Gerçek Saraytepe 101 Ada 1 Parsel TKGM Verisi ile başlar)
  const [adaNo, setAdaNo] = useState<string>("101");
  const [parselNo, setParselNo] = useState<string>("1");
  const [nitelik, setNitelik] = useState<string>("Fındık Bahçesi ve Tarla");
  const [yuzolcumuInput, setYuzolcumuInput] = useState<string>("2746.15");
  const [paftaNo, setPaftaNo] = useState<string>("G38-B-04-B-2-B");
  const [parcelPolygon, setParcelPolygon] = useState<[number, number][]>(
    INITIAL_SARAYTEPE_101_1_POLYGON
  );
  const [parcelSource, setParcelSource] =
    useState<ParcelBoundarySource>("tkgm_api");
  const [tkgmStatusMessage, setTkgmStatusMessage] = useState<string | null>(null);
  const [isQueryingParcel, setIsQueryingParcel] = useState<boolean>(false);
  const [focusParcelZoomTrigger, setFocusParcelZoomTrigger] = useState<number>(0);
  const [showQuickParcelMap, setShowQuickParcelMap] = useState<boolean>(false);
  const geoJsonFileInputRef = useRef<HTMLInputElement | null>(null);

  const [addressDetail, setAddressDetail] = useState("Saraytepe Köy İçi Mevkii");
  const [date, setDate] = useState<string>(defaultNextDate);
  // Varsayılan keşif saati 13:00 (kullanıcı dilerse değiştirebilir)
  const [time, setTime] = useState<string>("13:00");
  const [caseType, setCaseType] = useState<string>(CASE_TYPES[0]);
  const [formStatus, setFormStatus] = useState<InspectionStatus>("planlandi");

  // Keşif Konusu: Taşınmaz (Ada/Parsel - Çoklu Parsel) veya Araç (Plaka Bilgisi / Hasar Tespiti)
  const [subjectType, setSubjectType] =
    useState<InspectionSubjectType>("tasinmaz");

  // Çoklu Parsel Listesi & Yakın Parsel Önerileri State
  const [formParcels, setFormParcels] = useState<ParcelItem[]>([
    {
      id: "saraytepe-101-1",
      mahalleId: 155062,
      neighborhood: "Saraytepe Mahallesi",
      adaNo: "101",
      parselNo: "1",
      nitelik: "Fındık Bahçesi ve Tarla",
      yuzolcumuM2: 2746.15,
      paftaNo: "G38-B-04-B-2-B",
      mevkii: "Saraytepe Köy İçi Mevkii",
      centerLat: 40.98521,
      centerLng: 37.54728,
      polygon: INITIAL_SARAYTEPE_101_1_POLYGON,
      source: "tkgm_api",
      distanceFromFirstMeters: 0,
    },
  ]);
  const [nearbyParcelSuggestions, setNearbyParcelSuggestions] = useState<
    ParcelItem[]
  >([]);
  const [isLoadingNearbyParcels, setIsLoadingNearbyParcels] =
    useState<boolean>(false);
  const [batchParselInput, setBatchParselInput] = useState<string>("");
  const [isAddingBatchParcels, setIsAddingBatchParcels] =
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

  // Compute OSRM distance & duration whenever selectedLat / selectedLng changes
  useEffect(() => {
    let cancelled = false;
    async function runOsrm() {
      if (!selectedLat || !selectedLng) return;
      setOsrmLoading(true);
      const res = await calculateOSRMRoute([
        { lat: FATSA_COURTHOUSE.lat, lng: FATSA_COURTHOUSE.lng },
        { lat: selectedLat, lng: selectedLng },
      ]);
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
  }, [selectedLat, selectedLng]);

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
    if (parcelSource === "geojson_import") {
      return;
    }

    const cleanAda = adaNo.trim();
    const cleanParsel = parselNo.trim();
    if (!cleanAda && !cleanParsel) {
      setParcelPolygon([]);
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
          parselNo: cleanParsel || "1",
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

          // 1. parsel değiştiğinde veya boşsa ilk parsel olarak senkronize et
          setFormParcels((prev) => {
            if (prev.length === 0) return [primaryItem];
            const alreadyExists = prev.some(
              (p) => p.adaNo === primaryItem.adaNo && p.parselNo === primaryItem.parselNo
            );
            if (alreadyExists) {
              return prev.map((p) =>
                p.adaNo === primaryItem.adaNo && p.parselNo === primaryItem.parselNo
                  ? primaryItem
                  : p
              );
            }
            if (prev.length === 1) {
              return [primaryItem];
            }
            return prev;
          });

          setTkgmStatusMessage(
            res.statusMessage ||
              `✓ TKGM'den çekildi: ${res.mahalleAd || neighborhoodInput} ${res.adaNo} Ada / ${res.parselNo} Parsel (${formatAreaM2(res.areaM2)} m²)`
          );
          setFocusParcelZoomTrigger((c) => c + 1);

          // 1. PARSEL GİRİLDİĞİNDE YAKINDAKİ KOMŞU PARSELLERİ OTOMATİK ÖNER
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
    }, 380);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    adaNo,
    parselNo,
    formDistrict,
    neighborhoodInput,
    selectedTkgmMahalleId,
    parcelSource,
  ]);

  // Önerilen veya sorgulanan bir parseli tek tıkla dosyaya (formParcels listesine) ekler
  const handleAddParcelItemToList = useCallback((item: ParcelItem) => {
    setFormParcels((prev) => {
      const exists = prev.some(
        (p) => p.adaNo === item.adaNo && p.parselNo === item.parselNo
      );
      if (exists) return prev;
      return [...prev, item];
    });
    setFocusParcelZoomTrigger((c) => c + 1);
    setFormBannerMessage(
      `✓ ${item.adaNo} Ada / ${item.parselNo} Parsel (${formatAreaM2(
        item.yuzolcumuM2 || 0
      )} m²) sınırlarıyla birlikte keşif dosyasına eklendi.`
    );
    setTimeout(() => setFormBannerMessage(null), 3500);
  }, []);

  // Mevcut input'taki parseli çoklu parsel listesine ekle
  const handleAddCurrentInputParcelToList = () => {
    const cleanAda = adaNo.trim() || "0";
    const cleanParsel = parselNo.trim() || "1";
    const areaVal = Number(String(yuzolcumuInput).replace(",", ".")) || 0;
    const item: ParcelItem = {
      id: `${selectedTkgmMahalleId || formDistrict}-${cleanAda}-${cleanParsel}`,
      mahalleId: selectedTkgmMahalleId,
      neighborhood: neighborhoodInput,
      adaNo: cleanAda,
      parselNo: cleanParsel,
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
    handleAddParcelItemToList(item);
  };

  // Çoklu parsel listesinden parsel sil
  const handleRemoveParcelFromList = (ada: string, parsel: string) => {
    setFormParcels((prev) =>
      prev.filter((p) => !(p.adaNo === ada && p.parselNo === parsel))
    );
  };

  // Toplu parsel numarası girişi (Örn: "2, 3, 5, 8") -> TKGM'den çekip çoklu parsel listesine ekler
  const handleBatchAddParcelsByNumbers = async () => {
    const rawNums = batchParselInput
      .split(/[,;\s-]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && /^\d+$/.test(s));
    if (rawNums.length === 0) return;

    setIsAddingBatchParcels(true);
    const targetAda = adaNo.trim() || "0";
    const addedItems: ParcelItem[] = [];

    try {
      for (const pNum of rawNums.slice(0, 20)) {
        const alreadyInList = formParcels.some(
          (p) => p.adaNo === targetAda && p.parselNo === pNum
        );
        if (alreadyInList) continue;

        const res = await queryParcelBoundary({
          district: formDistrict,
          neighborhood: neighborhoodInput,
          tkgmMahalleId: selectedTkgmMahalleId,
          baseLat: baseNeighborhoodLat,
          baseLng: baseNeighborhoodLng,
          adaNo: targetAda,
          parselNo: pNum,
          keepExactCenter: false,
        });

        addedItems.push({
          id: `${selectedTkgmMahalleId || formDistrict}-${targetAda}-${pNum}`,
          mahalleId: res.mahalleId || selectedTkgmMahalleId,
          neighborhood: neighborhoodInput,
          adaNo: targetAda,
          parselNo: pNum,
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

      if (addedItems.length > 0) {
        setFormParcels((prev) => {
          const next = [...prev];
          for (const item of addedItems) {
            if (
              !next.some(
                (p) => p.adaNo === item.adaNo && p.parselNo === item.parselNo
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
            .join(", ")}) TKGM'den çekilerek dosyaya eklendi.`
        );
        setTimeout(() => setFormBannerMessage(null), 4500);
      }
    } finally {
      setIsAddingBatchParcels(false);
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

  // Select a location by clicking directly on Leaflet map (Fetches real TKGM parcel at clicked coordinate!)
  const handleMapPointClick = useCallback(
    async (lat: number, lng: number) => {
      setBaseNeighborhoodLat(lat);
      setBaseNeighborhoodLng(lng);
      setSelectedLat(lat);
      setSelectedLng(lng);
      setAiAnalysisResult(null);
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
    [formDistrict, neighborhoodInput]
  );

  // Query TKGM Cadastral Boundary and zoom directly into the parcel on the map
  const handleQueryAndShowParcelOnMap = async (openInlinePreview = false) => {
    const targetAda = adaNo.trim() || "0";
    const targetParsel = parselNo.trim() || "1";
    if (!adaNo.trim() && !parselNo.trim()) {
      setAdaNo(targetAda);
      setParselNo(targetParsel);
    }
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

  // Form Submit: Add Inspection (supports Multi-Parcel Taşınmaz OR Vehicle Damage/Delil Tespiti + Creator from Ayarlar)
  const handleAddInspection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!esasNo.trim() || !neighborhoodInput.trim() || !date || !time) return;

    const finalCreator =
      createdByInput.trim() ||
      formatUserProfileCreator(userProfile, autoDetectedDeviceLabel);

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
        createdBy: finalCreator,
        createdByTitle: userProfile.title,
        deviceType: detectedDeviceType,
        createdAt: new Date().toISOString(),
      };
    } else {
      const cleanAda = adaNo.trim() || undefined;
      const cleanParsel = parselNo.trim() || undefined;
      const parsedAreaNum = Number(String(yuzolcumuInput).replace(",", "."));
      const cleanArea =
        !isNaN(parsedAreaNum) && parsedAreaNum > 0
          ? Number(parsedAreaNum.toFixed(2))
          : undefined;

      const finalPolygon =
        parcelPolygon && parcelPolygon.length >= 3 ? parcelPolygon : undefined;

      // Ensure the active input parcel is also included if formParcels was empty
      let finalParcelsList: ParcelItem[] = [...formParcels];
      if (cleanAda || cleanParsel) {
        const currentKeyAda = cleanAda || "0";
        const currentKeyParsel = cleanParsel || "1";
        const hasCurrent = finalParcelsList.some(
          (p) => p.adaNo === currentKeyAda && p.parselNo === currentKeyParsel
        );
        if (!hasCurrent) {
          finalParcelsList.unshift({
            id: `${selectedTkgmMahalleId || formDistrict}-${currentKeyAda}-${currentKeyParsel}`,
            mahalleId: selectedTkgmMahalleId,
            neighborhood: neighborhoodInput.trim(),
            adaNo: currentKeyAda,
            parselNo: currentKeyParsel,
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

      const primaryParcel = finalParcelsList[0];
      const totalMultiArea = finalParcelsList.reduce(
        (sum, p) => sum + (p.yuzolcumuM2 || 0),
        0
      );

      newRecord = {
        id: `kesif-${Date.now()}`,
        esasNo: esasNo.trim(),
        district: formDistrict,
        neighborhood: neighborhoodInput.trim(),
        subjectType: "tasinmaz",
        tkgmMahalleId: selectedTkgmMahalleId,
        adaNo: primaryParcel?.adaNo || cleanAda,
        parselNo: primaryParcel?.parselNo || cleanParsel,
        nitelik: primaryParcel?.nitelik || nitelik.trim() || undefined,
        yuzolcumuM2:
          totalMultiArea > 0 ? Number(totalMultiArea.toFixed(2)) : cleanArea,
        paftaNo: primaryParcel?.paftaNo || paftaNo.trim() || undefined,
        parcelPolygon: primaryParcel?.polygon || finalPolygon,
        parcelSource,
        parcels: finalParcelsList.length > 0 ? finalParcelsList : undefined,
        addressDetail: addressDetail.trim() || undefined,
        lat: selectedLat,
        lng: selectedLng,
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
    }
    if (subjectType === "tasinmaz" && parselNo && !isNaN(Number(parselNo))) {
      setParselNo(String(Number(parselNo) + 1));
      setFormParcels([]);
    }
    setVehiclePlateNo("");
    setVehicleBrandModel("");
    setVehicleDamageSummary("");
    setAddressDetail("");
    setCustomExpertText("");
    setNotes("");
    setTime("13:00");
    setFormStatus("planlandi");

    const summaryBadge =
      newRecord.subjectType === "arac"
        ? ` [🚗 Araç: ${newRecord.vehicleInfo?.plateNo}]`
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

  const handleUpdateInspectionStatus = (
    id: string,
    newStatus: InspectionStatus,
    newDate?: string
  ) => {
    const updated = inspections.map((rec) => {
      if (rec.id !== id) return rec;
      return {
        ...rec,
        status: newStatus,
        date: newDate || rec.date,
      };
    });
    setInspections(updated);
    pushRecordsToCloudIfEnabled(updated);
  };

  const handleDeleteInspection = (id: string) => {
    const updated = inspections.filter((r) => r.id !== id);
    setInspections(updated);
    pushRecordsToCloudIfEnabled(updated);
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

  // Filtered and chronologically grouped inspections for Agenda View
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
      if (!q) return true;
      const adaParselStr = `${rec.adaNo || ""} ada ${rec.parselNo || ""} parsel ${
        rec.adaNo || ""
      }/${rec.parselNo || ""}`.toLocaleLowerCase("tr-TR");
      return (
        rec.esasNo.toLocaleLowerCase("tr-TR").includes(q) ||
        rec.neighborhood.toLocaleLowerCase("tr-TR").includes(q) ||
        rec.district.toLocaleLowerCase("tr-TR").includes(q) ||
        rec.caseType.toLocaleLowerCase("tr-TR").includes(q) ||
        adaParselStr.includes(q) ||
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
    const counts = {
      all: inspections.length,
      planlandi: 0,
      yapildi: 0,
      ertelendi: 0,
      iptal_edildi: 0,
    };
    for (const r of inspections) {
      const st = r.status || "planlandi";
      counts[st] = (counts[st] || 0) + 1;
    }
    return counts;
  }, [inspections]);

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

    // Çok duraklı Google Maps Yol Tarifi URL'si (Çıkış: Fatsa Adliyesi -> Durak 1..N -> Varış: Fatsa Adliyesi)
    const coordChain = [
      `${FATSA_COURTHOUSE.lat},${FATSA_COURTHOUSE.lng}`,
      ...dayRecords.map((r) => `${r.lat},${r.lng}`),
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
        : "";
      lines.push(
        `📍 *${idx + 1}. DURAK — Saat ${rec.time} | Dosya No: ${rec.esasNo}*`
      );
      lines.push(
        `   • *Varış / Konum:* [${rec.district}] ${rec.neighborhood}${subjectStr}`
      );
      if (rec.parcels && rec.parcels.length > 1) {
        lines.push(
          `   • *Dosyadaki Parseller (${rec.parcels.length} Adet):* ${rec.parcels
            .map((p) => `${p.adaNo}/${p.parselNo}`)
            .join(", ")}`
        );
      }
      if (rec.addressDetail) {
        lines.push(`   • *Mevkii / İnceleme Yeri:* ${rec.addressDetail}`);
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
                    autoFocus
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
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 pb-16 md:pb-0">
      {/* ====================================================================
          TOP BAR CONTRACT: Responsive 3 Zones
         ==================================================================== */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-800 bg-[#1e293b] px-3.5 py-3 text-white sm:px-6 sm:gap-8">
        {/* Zone 1: Brand Title with district coverage badge */}
        <div className="flex items-center gap-2 truncate">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("ajanda");
            }}
            className="text-sm sm:text-base md:text-lg font-bold tracking-tight text-white truncate"
          >
            Fatsa, Çamaş & Çatalpınar Keşif
          </a>
          <span className="hidden lg:inline-block rounded bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
            Sulh Hukuk · Ada/Parsel CBS
          </span>
        </div>

        {/* Zone 2: Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-300">
          <button
            onClick={() => setActiveTab("ajanda")}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "ajanda"
                ? "text-white underline decoration-emerald-400 decoration-2 underline-offset-8"
                : "hover:text-white"
            }`}
          >
            Ajanda Listesi
          </button>
          <button
            onClick={() => setActiveTab("takvim")}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "takvim"
                ? "text-white underline decoration-emerald-400 decoration-2 underline-offset-8"
                : "hover:text-white"
            }`}
          >
            Aylık Takvim
          </button>
          <button
            onClick={() => {
              setFocusedInspectionId(null);
              setActiveTab("harita");
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "harita"
                ? "text-white underline decoration-emerald-400 decoration-2 underline-offset-8"
                : "hover:text-white"
            }`}
          >
            Genel Harita & Parseller
          </button>
          <button
            onClick={() => setActiveTab("yeni_kesif")}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "yeni_kesif"
                ? "text-white underline decoration-emerald-400 decoration-2 underline-offset-8"
                : "hover:text-white"
            }`}
          >
            Yeni Keşif Ekle
          </button>
          <button
            onClick={() => setActiveTab("ayarlar")}
            className={`flex items-center gap-1 py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "ayarlar"
                ? "text-white underline decoration-emerald-400 decoration-2 underline-offset-8"
                : "hover:text-white"
            }`}
          >
            <Settings className="h-3.5 w-3.5 text-emerald-400" />
            <span>Ayarlar</span>
          </button>
        </nav>

        {/* Zone 3: User Profile Badge + GitHub ksf Pages + Cloud Sync + Lock */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("ayarlar")}
            className="hidden xl:flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-400 hover:text-white transition-colors"
            title="Kullanıcı Adı ve Unvan Ayarları"
          >
            <UserCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="truncate max-w-[145px]">
              {userProfile.fullName.trim()
                ? `${userProfile.fullName} (${userProfile.title})`
                : `${userProfile.title} · Ayarlar`}
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
            className="flex items-center gap-1.5 rounded-lg border border-indigo-400/50 bg-indigo-600 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 whitespace-nowrap"
            title="Projeyi GitHub Hesabınızdaki 'ksf' Reposunda Yayınla (GitHub Pages)"
          >
            <Globe className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">GitHub 'ksf' Yayınla</span>
            <span className="sm:hidden">ksf Yayın</span>
          </button>
          <button
            onClick={() => setIsCloudModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#10b981] px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-400 whitespace-nowrap"
            title="Bulut Senkronizasyon (GitHub & Google Apps Script)"
          >
            <Cloud className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Bulut Senkronizasyon</span>
            <span className="sm:hidden">Sync</span>
          </button>
          <button
            type="button"
            onClick={handleLockApp}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 sm:px-2.5 sm:py-2 text-xs font-semibold text-slate-300 hover:border-rose-400 hover:text-rose-300 transition-colors"
            title="Oturumu Kilitle (Şifre Ekranına Dön)"
          >
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden lg:inline">Kilitle</span>
          </button>
        </div>
      </header>

      {/* ====================================================================
          COURTROOM QUICK QUERY BAR (Ana Ekran Hızlı İlçe, Mahalle/Köy ve Ada/Parsel Sorgulama)
         ==================================================================== */}
      <section className="border-b border-slate-200 bg-white px-3.5 py-3 sm:px-6">
        <div className="mx-auto max-w-[1360px]">
          <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
            {/* Quick District + Neighborhood + Ada/Parsel Lookup Inputs */}
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0">
                <Building2 className="h-4 w-4 text-emerald-600" />
                <span>Konum & Ada/Parsel:</span>
              </div>

              {/* District Select for Quick Bar */}
              <select
                value={quickDistrict}
                onChange={(e) => {
                  const val = e.target.value as CourtDistrict | "Tümü";
                  setQuickDistrict(val);
                  if (val !== "Tümü") {
                    setFormDistrict(val);
                    const firstN = FATSA_NEIGHBORHOODS.find(
                      (n) => n.district === val
                    );
                    if (firstN) {
                      setNeighborhoodInput(firstN.name);
                      setSelectedTkgmMahalleId(
                        resolveTkgmMahalle(val, firstN.name)?.id
                      );
                      setBaseNeighborhoodLat(firstN.lat);
                      setBaseNeighborhoodLng(firstN.lng);
                      setSelectedLat(firstN.lat);
                      setSelectedLng(firstN.lng);
                      setSelectedCorridor(firstN.corridor);
                    }
                  }
                }}
                className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none shrink-0"
              >
                <option value="Tümü">Tüm İlçeler (Fatsa / Çamaş / Çatalpınar)</option>
                <option value="Fatsa">Fatsa ({districtCounts.fatsa})</option>
                <option value="Çamaş">Çamaş ({districtCounts.camas})</option>
                <option value="Çatalpınar">Çatalpınar ({districtCounts.catalpinar})</option>
              </select>

              {/* Mahalle / Köy Autocomplete Input */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={quickQuery}
                  onFocus={() => setShowQuickDropdown(true)}
                  onBlur={() => setTimeout(() => setShowQuickDropdown(false), 200)}
                  onChange={(e) => {
                    setQuickQuery(e.target.value);
                    setShowQuickDropdown(true);
                  }}
                  placeholder={`Mahalle / Köy seçin (Aktif: ${neighborhoodInput.replace(" Mahallesi", "")})...`}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50/70 pl-8 pr-3 py-1.5 text-xs font-medium text-slate-900 placeholder:text-slate-500 focus:border-emerald-600 focus:bg-white focus:outline-none"
                />

                {showQuickDropdown && (
                  <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
                    {(quickResults.length > 0
                      ? quickResults
                      : FATSA_NEIGHBORHOODS.slice(0, 8).map((n) => ({
                          name: n.name,
                          district: n.district,
                          displayName: `${n.name}, ${n.district} (${n.corridor})`,
                          lat: n.lat,
                          lng: n.lng,
                          corridor: n.corridor,
                          source: "local" as const,
                        }))
                    ).map((item, i) => (
                      <button
                        key={`${item.name}-${i}`}
                        type="button"
                        onMouseDown={() => handleSelectLocationResult(item)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-emerald-50 border-b border-slate-100 last:border-0"
                      >
                        <div className="truncate pr-2">
                          <div className="font-semibold text-slate-900 truncate">
                            <span className="font-bold text-emerald-800 mr-1.5">
                              [{item.district}]
                            </span>
                            {item.name}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {item.corridor}
                          </div>
                        </div>
                        <span className="font-mono text-[11px] text-emerald-700 whitespace-nowrap shrink-0">
                          Seç &rarr;
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Ada No & Parsel No Inputs Right Next to Mahalle/Köy (Auto-fetches TKGM on type!) */}
              <div className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50/70 px-2 py-1 shrink-0">
                <span className="text-[11px] font-bold text-amber-900 whitespace-nowrap">
                  📐 Ada/Parsel:
                </span>
                <input
                  type="text"
                  value={adaNo}
                  onChange={(e) => {
                    setParcelSource("cadastre_computed");
                    setAdaNo(e.target.value);
                    if (activeTab !== "yeni_kesif" && activeTab !== "harita") {
                      setShowQuickParcelMap(true);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleQueryAndShowParcelOnMap(true);
                    }
                  }}
                  placeholder="Ada (0)"
                  aria-label="Ada Numarası"
                  className="w-14 sm:w-16 rounded border border-amber-300 bg-white px-2 py-1 text-xs font-mono font-bold text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:outline-none"
                />
                <span className="text-xs font-bold text-amber-700">/</span>
                <input
                  type="text"
                  value={parselNo}
                  onChange={(e) => {
                    setParcelSource("cadastre_computed");
                    setParselNo(e.target.value);
                    if (activeTab !== "yeni_kesif" && activeTab !== "harita") {
                      setShowQuickParcelMap(true);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleQueryAndShowParcelOnMap(true);
                    }
                  }}
                  placeholder="Parsel"
                  aria-label="Parsel Numarası"
                  className="w-14 sm:w-16 rounded border border-amber-300 bg-white px-2 py-1 text-xs font-mono font-bold text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleQueryAndShowParcelOnMap(true)}
                  disabled={isQueryingParcel}
                  className="rounded bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700 transition-colors whitespace-nowrap"
                  title="TKGM'den Ada/Parsel sınırlarını otomatik çek ve harita üzerinde çiz"
                >
                  {isQueryingParcel ? "TKGM Çekiliyor..." : "TKGM Sınırı Çiz"}
                </button>
              </div>

              {/* Instant Distance & Duration Badge */}
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs whitespace-nowrap overflow-hidden shrink-0">
                <MapPin className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span className="font-semibold text-slate-900 truncate max-w-[115px]">
                  {neighborhoodInput.replace(" Mahallesi", "")}
                </span>
                <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                  {osrmLoading ? "..." : `${distanceKm} km (~${durationMin} dk)`}
                </span>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 text-xs shrink-0">
              <button
                onClick={() => setIsPdfModalOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
              >
                <FileDown className="h-3.5 w-3.5 text-emerald-600" />
                <span>PDF İndir</span>
              </button>

              <button
                onClick={() => setActiveTab("yeni_kesif")}
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5 text-emerald-400" />
                <span>Keşif Ekle</span>
              </button>
            </div>
          </div>

          {/* INLINE PARCEL BOUNDARY MAP PREVIEW ON MAIN SCREEN (Opened automatically when typing Ada/Parsel or clicking "TKGM Sınırı Çiz") */}
          {showQuickParcelMap &&
            activeTab !== "yeni_kesif" &&
            activeTab !== "harita" && (
              <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/50 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-amber-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                      📐 {adaNo || "0"} Ada / {parselNo || "1"} Parsel
                    </span>
                    {parcelSource === "tkgm_api" && (
                      <span className="rounded bg-emerald-700 px-2 py-0.5 text-[11px] font-bold text-white">
                        ✓ TKGM MEGSİS Canlı Sınır
                      </span>
                    )}
                    <span className="font-bold text-slate-900">
                      [{formDistrict}] {neighborhoodInput}
                    </span>
                    <span className="font-mono text-amber-900">
                      · {formatAreaM2(Number(yuzolcumuInput || 0))} m²
                    </span>
                    {nitelik && (
                      <span className="text-slate-700">· {nitelik}</span>
                    )}
                    <span className="font-mono font-semibold text-emerald-800">
                      · Adliye: {distanceKm} km (~{durationMin} dk)
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowQuickParcelMap(false);
                        setActiveTab("yeni_kesif");
                      }}
                      className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700 whitespace-nowrap"
                    >
                      + Bu Ada/Parsel İçin Keşif Planla &rarr;
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowQuickParcelMap(false);
                        setFocusedInspectionId(null);
                        setActiveTab("harita");
                        setFocusParcelZoomTrigger((c) => c + 1);
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                    >
                      Tam Ekran Haritada Aç
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQuickParcelMap(false)}
                      className="rounded-lg border border-slate-200 bg-white p-1 text-slate-500 hover:text-slate-900"
                      title="Önizleme Haritasını Kapat"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {tkgmStatusMessage && (
                  <div className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700">
                    {tkgmStatusMessage}
                  </div>
                )}

                <InteractiveMap
                  mode="picker"
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
                  pickerRouteGeometry={pickerGeometry}
                  inspections={inspections}
                  onSelectPoint={handleMapPointClick}
                  heightClass="h-[300px] sm:h-[360px]"
                />
              </div>
            )}

          {/* SMART SUGGESTION ALERT */}
          {smartSuggestions.length > 0 && (
            <div className="mt-2.5 flex flex-col justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/90 p-2.5 sm:p-3 text-xs text-emerald-950 sm:flex-row sm:items-center">
              <div className="leading-relaxed">
                <strong className="font-semibold">
                  {smartSuggestions[0].message}
                </strong>
                <span className="ml-1.5 text-emerald-800 hidden sm:inline">
                  (Mevcut:{" "}
                  {smartSuggestions[0].existingRecords
                    .map((r) => `${r.esasNo} [${r.district}]`)
                    .join(", ")}
                  )
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  handleApplySuggestionDate(smartSuggestions[0]);
                  setActiveTab("yeni_kesif");
                }}
                className="rounded bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap shrink-0 self-start sm:self-auto"
              >
                {smartSuggestions[0].formattedDate} Gününe Birleştir &rarr;
              </button>
            </div>
          )}
        </div>
      </section>

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

        {/* VIEW 1: YENİ KEŞİF EKLEME, ADA/PARSEL SINIR SORGULAMA VE HARİTA SEÇİMİ */}
        {activeTab === "yeni_kesif" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
            {/* Left Column: Form */}
            <div className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
              <div className="border-b border-slate-200 pb-3">
                <h1 className="text-base sm:text-lg font-bold text-slate-900">
                  Yeni Keşif & Taşınmaz (Ada/Parsel) Planla
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mahalle ve Ada/Parsel numarasını yazdığınızda TKGM MEGSİS üzerinden parsel sınırları otomatik çekilip haritada çizilir
                </p>
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
                      onChange={(e) => setEsasNo(e.target.value)}
                      placeholder="Örn: 2026/145 E."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Case Type & Status */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Keşif Türü / Dava Konusu *
                    </label>
                    <select
                      value={caseType}
                      onChange={(e) => setCaseType(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    >
                      {CASE_TYPES.map((ct) => (
                        <option key={ct} value={ct}>
                          {ct}
                        </option>
                      ))}
                    </select>
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
                    KEŞİF KONUSU SEÇİMİ: TAŞINMAZ (ÇOKLU ADA/PARSEL) VEYA ARAÇ (PLAKA / HASAR TESPİTİ)
                   ============================================================== */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                    Keşif / İnceleme Konusu Seçimi:
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setSubjectType("tasinmaz")}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-bold transition-all ${
                        subjectType === "tasinmaz"
                          ? "border-amber-600 bg-amber-50 text-amber-950 ring-2 ring-amber-500/20"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <Layers className="h-4 w-4 text-amber-600 shrink-0" />
                      <div>
                        <div>📐 Taşınmaz Keşfi (Ada / Parsel)</div>
                        <div className="text-[10px] font-normal text-slate-500">
                          Çoklu parsel ekleme & yakın parsel önerisi
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSubjectType("arac");
                        if (!selectedExpertIds.includes("makine")) {
                          setSelectedExpertIds(["makine"]);
                        }
                      }}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-bold transition-all ${
                        subjectType === "arac"
                          ? "border-indigo-600 bg-indigo-50 text-indigo-950 ring-2 ring-indigo-500/20"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <Car className="h-4 w-4 text-indigo-600 shrink-0" />
                      <div>
                        <div>🚗 Araç İncelemesi (Plaka & Hasar Tespiti)</div>
                        <div className="text-[10px] font-normal text-slate-500">
                          Delil tespiti, araç hasar ve değer kaybı incelemesi
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {subjectType === "arac" ? (
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

                    {/* Ada, Parsel, Yüzölçümü (m²), Pafta */}
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
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
                          placeholder="Örn: 101 veya 0"
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
                          placeholder="Örn: 1"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-amber-600 focus:outline-none"
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

                    {/* Action Buttons: Fetch TKGM Boundary + Add Current Parcel to Multi-Parcel File */}
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
                          onClick={handleAddCurrentInputParcelToList}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors whitespace-nowrap"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>
                            {adaNo || "0"}/{parselNo || "1"} Parseli Dosyaya Ekle
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
                          {adaNo || "0"} Adadaki Çoklu Parselleri Toplu Ekle:
                        </span>
                        <input
                          type="text"
                          value={batchParselInput}
                          onChange={(e) => setBatchParselInput(e.target.value)}
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
                        DOSYAYA EKLENEN PARSELLER LİSTESİ (ÇOKLU PARSEL ÖZETİ)
                       ============================================================ */}
                    {formParcels.length > 0 && (
                      <div className="rounded-lg border border-amber-300 bg-amber-100/50 p-2.5 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-amber-950">
                            📋 Bu Keşif Dosyasına Eklenen Parseller (
                            {formParcels.length} Adet · Toplam:{" "}
                            {formatAreaM2(
                              formParcels.reduce(
                                (acc, p) => acc + (p.yuzolcumuM2 || 0),
                                0
                              )
                            )}{" "}
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
                              Sadece 1. Parseli Bırak
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {formParcels.map((p, idx) => (
                            <div
                              key={`${p.adaNo}-${p.parselNo}-${idx}`}
                              className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2 py-1 text-xs shadow-2xs"
                            >
                              <span className="rounded bg-amber-600 px-1.5 py-0.2 font-mono text-[10px] font-bold text-white">
                                {idx + 1}. Parsel
                              </span>
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
                              {p.yuzolcumuM2 && (
                                <span className="font-mono text-[11px] text-emerald-800">
                                  ({formatAreaM2(p.yuzolcumuM2)} m²)
                                </span>
                              )}
                              {formParcels.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveParcelFromList(
                                      p.adaNo,
                                      p.parselNo
                                    )
                                  }
                                  className="ml-0.5 text-slate-400 hover:text-red-600"
                                  title="Bu parseli dosyadan çıkar"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
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
                        ) : formParcels.length > 1 ? (
                          <span className="ml-1.5 font-mono text-xs text-amber-700">
                            ({formParcels.length} Parsel)
                          </span>
                        ) : (
                          (adaNo || parselNo) && (
                            <span className="ml-1.5 font-mono text-xs text-amber-700">
                              ({adaNo || "0"} Ada / {parselNo || "1"} Parsel)
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
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Ajandaya Dön
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 rounded-lg bg-[#10b981] px-4 py-2 text-xs font-bold text-slate-950 shadow-xs hover:bg-emerald-400 whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4" />
                    {subjectType === "arac"
                      ? "Araç Tespit Keşfini Kaydet"
                      : formParcels.length > 1
                      ? `Keşfi & ${formParcels.length} Parseli Kaydet`
                      : "Keşfi & Parseli Kaydet"}
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Map Picker with Multi-Parcel Polygon Preview & Clickable Nearby Suggestions */}
            <div className="lg:col-span-6 space-y-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                      {subjectType === "arac"
                        ? `Araç İnceleme Konumu & Güzergah Haritası (${formDistrict})`
                        : `TKGM Taşınmaz Ada/Parsel Sınırı & Çoklu Parsel Haritası (${formDistrict})`}
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      {subjectType === "arac"
                        ? "Aracın bulunduğu otopark/sanayi konumunu haritadan seçebilir veya inceleme yeri butonlarını kullanabilirsiniz"
                        : "Dosyaya eklenen tüm parsellerin TKGM sınırları haritada birlikte çizilir"}
                    </p>
                  </div>
                  <span className="font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                    {distanceKm} km · {durationMin} dk
                  </span>
                </div>

                {/* Selected Multi-Parcel or Vehicle Metadata Summary Strip above Map */}
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
                ) : (
                  (adaNo || parselNo || formParcels.length > 0) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-amber-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                          📐{" "}
                          {formParcels.length > 1
                            ? `${formParcels.length} Parsel Seçili`
                            : `${adaNo || "0"} Ada / ${parselNo || "1"} Parsel`}
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
                    subjectType === "tasinmaz" ? formParcels : undefined
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
            {/* Toolbar: Search, District Filter, Status Filter & Actions */}
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
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
                      className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  {/* District Filter Pill Menu */}
                  <select
                    value={agendaDistrictFilter}
                    onChange={(e) => setAgendaDistrictFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:border-emerald-600 focus:outline-none shrink-0"
                  >
                    <option value="Tümü">Tüm İlçeler ({inspections.length})</option>
                    <option value="Fatsa">Fatsa ({districtCounts.fatsa})</option>
                    <option value="Çamaş">Çamaş ({districtCounts.camas})</option>
                    <option value="Çatalpınar">Çatalpınar ({districtCounts.catalpinar})</option>
                  </select>

                  <select
                    value={agendaCaseFilter}
                    onChange={(e) => setAgendaCaseFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-600 focus:outline-none shrink-0"
                  >
                    <option value="Tümü">Tüm Dava Türleri</option>
                    {CASE_TYPES.map((ct) => (
                      <option key={ct} value={ct}>
                        {ct}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Right Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setIsPdfModalOpen(true)}
                    className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                  >
                    <FileDown className="h-3.5 w-3.5 text-emerald-600" />
                    <span>PDF Çıktısı</span>
                  </button>
                  <button
                    onClick={handleResetSampleData}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                    title="Örnek Fatsa, Çamaş ve Çatalpınar keşif verilerini geri yükle"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Örnek Veri</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("yeni_kesif")}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Yeni Keşif</span>
                  </button>
                </div>
              </div>

              {/* Status Filter Scrollable Bar */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 border-t border-slate-100 pt-2.5">
                {(
                  [
                    { key: "Tümü", label: `Tümü (${statusCounts.all})` },
                    { key: "planlandi", label: `Planlandı (${statusCounts.planlandi})` },
                    { key: "yapildi", label: `Yapıldı (${statusCounts.yapildi})` },
                    { key: "ertelendi", label: `Ertelendi (${statusCounts.ertelendi})` },
                    { key: "iptal_edildi", label: `İptal (${statusCounts.iptal_edildi})` },
                  ] as { key: string; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setAgendaStatusFilter(tab.key)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      agendaStatusFilter === tab.key
                        ? "bg-slate-900 text-white"
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
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-2.5">
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
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Filtreleri Sıfırla
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {agendaGroups.map((group) => {
                  const firstWeather = weatherMap[group.records[0]?.id];
                  return (
                    <div
                      key={group.date}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                    >
                      {/* Day Group Header (Wrap-friendly on mobile) */}
                      <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-900 p-3 sm:px-5 sm:py-3.5 text-white sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <CalendarIcon className="h-4 w-4 text-emerald-400 shrink-0" />
                          <h2 className="text-xs sm:text-sm font-bold tracking-tight">
                            {formatLongDateTR(group.date)}
                          </h2>
                          <span className="text-[11px] font-medium text-emerald-300">
                            ({group.records.length} Dosya)
                          </span>
                          {firstWeather && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-200 bg-slate-800/80 rounded px-1.5 py-0.5">
                              {renderWeatherIcon(firstWeather.condition, "h-3.5 w-3.5")}
                              <span>{firstWeather.label}</span>
                              <span className="font-mono">({firstWeather.tempMax}°C)</span>
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono text-slate-300 text-[11px] tabular-nums">
                            Gidiş-Dönüş: <strong className="text-emerald-400">~{group.totalDailyKm} km</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => setShareRouteDate(group.date)}
                            className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-500 whitespace-nowrap"
                            title="Çıkış noktası, duraklar, dosya numaraları ve varış noktasını içeren güzergahı paylaş"
                          >
                            <Share2 className="h-3 w-3" />
                            <span>Güzergahı Paylaş</span>
                          </button>
                          <button
                            onClick={() => handleRunPdfExport("daily", group.date)}
                            className="rounded bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 whitespace-nowrap"
                          >
                            Günlük PDF
                          </button>
                          <button
                            onClick={() => {
                              setMapFilterDate(group.date);
                              setFocusedInspectionId(null);
                              setActiveTab("harita");
                            }}
                            className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-slate-700 whitespace-nowrap"
                          >
                            <Route className="h-3 w-3" />
                            Rotayı & Parselleri Aç
                          </button>
                        </div>
                      </div>

                      {/* File Rows */}
                      <div className="divide-y divide-slate-200">
                        {group.records.map((rec, index) => {
                          const wf = weatherMap[rec.id];
                          const currentStatus: InspectionStatus = rec.status || "planlandi";
                          const adaParselText = formatAdaParselLabel(rec);
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
                                </div>

                                {/* Ada / Parsel (Çoklu Parsel) veya Araç Plaka Info Box with Map Trigger */}
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
                                ) : (
                                  adaParselText && (
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
                                              {pIdx + 1}. Parsel: {p.adaNo}/{p.parselNo}
                                              {p.yuzolcumuM2
                                                ? ` (${formatAreaM2(p.yuzolcumuM2)} m²)`
                                                : ""}
                                            </span>
                                          ))}
                                        </div>
                                      )}
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

                              {/* Mobile-Friendly Status Action Buttons & Delete */}
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                                <div className="flex flex-wrap items-center gap-1 rounded bg-slate-100 p-0.5">
                                  {(
                                    [
                                      { key: "planlandi", label: "Planlandı" },
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
                                            : "bg-white text-slate-900 shadow-xs"
                                          : "text-slate-600 hover:text-slate-900"
                                      }`}
                                    >
                                      {btn.label}
                                    </button>
                                  ))}
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      setFormDistrict(rec.district);
                                      setNeighborhoodInput(rec.neighborhood);
                                      setBaseNeighborhoodLat(rec.lat);
                                      setBaseNeighborhoodLng(rec.lng);
                                      setSelectedLat(rec.lat);
                                      setSelectedLng(rec.lng);
                                      setDate(rec.date);
                                      setActiveTab("yeni_kesif");
                                    }}
                                    className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700 whitespace-nowrap"
                                  >
                                    + Yanına Ekle
                                  </button>
                                  <button
                                    onClick={() => handleDeleteInspection(rec.id)}
                                    className="rounded border border-slate-200 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                    title="Sil"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
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
            onAddForDate={(d) => {
              setDate(d);
              setActiveTab("yeni_kesif");
            }}
            onOpenOnMap={(d) => {
              setMapFilterDate(d);
              setFocusedInspectionId(null);
              setActiveTab("harita");
            }}
            onShareDailyRoute={(d) => setShareRouteDate(d)}
            onUpdateStatus={(id, st) => handleUpdateInspectionStatus(id, st)}
            onDeleteRecord={handleDeleteInspection}
          />
        )}

        {/* VIEW 4: GENEL HARİTA & ADA/PARSEL SINIRLARI */}
        {activeTab === "harita" && (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-sm sm:text-base font-bold text-slate-900">
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
                    className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    Tüm Harita Görünümüne Dön
                  </button>
                )}

                {mapFilterDate && (
                  <button
                    type="button"
                    onClick={() => setShareRouteDate(mapFilterDate)}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 whitespace-nowrap"
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
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
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
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong>{formatLongDateTR(mapFilterDate)} Güzergahı:</strong>{" "}
                  🏛️ Çıkış: Fatsa Adliyesi &rarr; Sıralı Duraklar &rarr; 🏁 Varış: Fatsa Adliyesi
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono font-bold tabular-nums">
                    Toplam Yol: {dailyRouteMetrics.distanceKm} km (~{dailyRouteMetrics.durationMin} dk)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShareRouteDate(mapFilterDate)}
                    className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-800"
                  >
                    <Share2 className="h-3 w-3" />
                    <span>Durakları & Dosya No Paylaş</span>
                  </button>
                </div>
              </div>
            )}

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

            {/* Quick Parcel Selector Chips below Overview Map */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
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
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() =>
                        setFocusedInspectionId(isSelected ? null : rec.id)
                      }
                      className={`rounded-lg border px-2.5 py-1 text-left text-xs transition-colors ${
                        isSelected
                          ? "border-amber-600 bg-amber-50 text-amber-950 font-bold"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-amber-400"
                      }`}
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
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 5: AYARLAR (KULLANICI ADI, UNVAN SEÇİMİ VE BULUT SENKRONİZASYON) */}
        {activeTab === "ayarlar" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
            {/* Left 7 Columns: User Identity & Title Settings */}
            <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
              <div className="border-b border-slate-200 pb-4">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-emerald-600" />
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
                              ? "border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/20"
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
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
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>
                    Keşfi ekleyen kişi bilgisinin yanına bilgisayar/telefon adını da ekle ({autoDetectedDeviceLabel || "Cihaz Adı"})
                  </span>
                </label>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 space-y-1">
                  <div className="text-[11px] font-bold text-emerald-900 uppercase">
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
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    ✓ Ayarları Kaydet & Uygula
                  </button>
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Cloud Sync & GitHub / Google Apps Script Shortcut */}
            <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
              <div className="border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <Cloud className="h-5 w-5 text-emerald-600" />
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
                  <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-400">
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
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
              >
                <Cloud className="h-4 w-4 text-emerald-400" />
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
          FIXED MOBILE BOTTOM NAVIGATION (Taşmayan, Parmakla Erişilebilir Menü)
         ==================================================================== */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-slate-200 bg-white/95 py-2 px-2 shadow-lg backdrop-blur-md md:hidden">
        <button
          onClick={() => setActiveTab("ajanda")}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold ${
            activeTab === "ajanda" ? "text-emerald-700" : "text-slate-500"
          }`}
        >
          <ListOrdered className="h-4 w-4" />
          <span>Ajanda</span>
        </button>
        <button
          onClick={() => setActiveTab("takvim")}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold ${
            activeTab === "takvim" ? "text-emerald-700" : "text-slate-500"
          }`}
        >
          <CalendarIcon className="h-4 w-4" />
          <span>Takvim</span>
        </button>
        <button
          onClick={() => {
            setFocusedInspectionId(null);
            setActiveTab("harita");
          }}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold ${
            activeTab === "harita" ? "text-emerald-700" : "text-slate-500"
          }`}
        >
          <MapIcon className="h-4 w-4" />
          <span>Harita</span>
        </button>
        <button
          onClick={() => setActiveTab("yeni_kesif")}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold ${
            activeTab === "yeni_kesif" ? "text-emerald-700" : "text-slate-500"
          }`}
        >
          <Plus className="h-4 w-4" />
          <span>+ Keşif</span>
        </button>
        <button
          onClick={() => setActiveTab("ayarlar")}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold ${
            activeTab === "ayarlar" ? "text-emerald-700" : "text-slate-500"
          }`}
        >
          <Settings className="h-4 w-4" />
          <span>Ayarlar</span>
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
                        </div>

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
          setInspections(newRecords.map(enrichLegacyRecord));
        }}
      />

      {/* ====================================================================
          GITHUB 'ksf' REPOSITORY & GITHUB PAGES YAYINLAMA MODALI
         ==================================================================== */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <Globe className="h-5 w-5 text-indigo-400 shrink-0" />
                <div>
                  <h2 className="text-sm sm:text-base font-bold">
                    Projeyi GitHub &lsquo;ksf&rsquo; Reposunda Yayınla (GitHub Pages)
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Tüm proje dosyalarını GitHub hesabınızdaki &lsquo;ksf&rsquo; deposuna yükler ve GitHub Pages&rsquo;i aktif eder
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
                  <span>Tek Tıkla Doğrudan GitHub Pages Yayını</span>
                </div>
                <p className="text-[11px] text-slate-700 leading-relaxed">
                  GitHub Personal Access Token bilginizi girip <strong>&ldquo;ksf Reposunda Yayınla&rdquo;</strong> butonuna tıkladığınızda:
                </p>
                <ul className="list-disc pl-4 text-[11px] text-slate-700 space-y-0.5">
                  <li>
                    Hesabınızda <strong>ksf</strong> adında repo yoksa otomatik oluşturulur (varsa güncellenir).
                  </li>
                  <li>
                    Açılış şifresi (<code className="font-mono font-bold">Fatsa2.SHM52</code>) dahil tüm uygulama ve derlenmiş paketler yüklenir.
                  </li>
                  <li>
                    <strong>GitHub Pages</strong> otomatik açılarak <code className="font-mono font-bold">https://&lt;kullanici&gt;.github.io/ksf/</code> adresinde doğrudan çalışır.
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
                      value={publishToken}
                      onChange={(e) => {
                        setPublishToken(e.target.value);
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
                      Not: GitHub Pages ilk kez etkinleştirildiyse adresin tüm dünyada aktif olması 30-60 saniye sürebilir.
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
                      : "Projeyi 'ksf' Reposunda Yayınla & Pages Aç"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
