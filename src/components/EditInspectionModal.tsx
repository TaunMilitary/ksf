import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  Save,
  Plus,
  Trash2,
  Layers,
  Car,
  Home,
  Users,
  UserCheck,
  MapPin,
  RefreshCw,
  Check,
  Sparkles,
  Search,
} from "lucide-react";
import {
  CourtDistrict,
  InspectionRecord,
  InspectionStatus,
  InspectionSubjectType,
  ParcelItem,
} from "../types";
import {
  ADDRESS_NITELIK_PRESETS,
  CASE_TYPES,
  DEFAULT_EXPERT_TITLES,
  DISTRICTS,
  EXPERT_PRESETS,
  FATSA_COURTHOUSE,
  FATSA_NEIGHBORHOODS,
  FATSA_STREET_PRESETS,
  PARCEL_NITELIK_PRESETS,
  VEHICLE_INSPECTION_PLACE_PRESETS,
  VEHICLE_TYPE_PRESETS,
} from "../data/fatsaData";
import {
  resolveTkgmMahalle,
  TKGM_MAHALLE_LIST,
} from "../data/tkgmMahalleData";
import {
  calculateOSRMRoute,
  extractRecordLocationStops,
  fetchNearbyTkgmParcels,
  formatAreaM2,
  geocodeStreetAddressInDistrict,
  getRecordUniqueNeighborhoods,
  queryParcelBoundary,
} from "../services/geoService";
import { STATUS_LABELS } from "../services/pdfService";

interface EditInspectionModalProps {
  record: InspectionRecord | null;
  onClose: () => void;
  onSave: (updatedRecord: InspectionRecord) => void;
}

export const EditInspectionModal: React.FC<EditInspectionModalProps> = ({
  record,
  onClose,
  onSave,
}) => {
  const [esasNo, setEsasNo] = useState("");
  const [district, setDistrict] = useState<CourtDistrict>("Fatsa");
  const [neighborhood, setNeighborhood] = useState("");
  const [tkgmMahalleId, setTkgmMahalleId] = useState<number | undefined>(
    undefined
  );
  const [corridor, setCorridor] = useState<string>("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("13:00");
  const [caseType, setCaseType] = useState<string>(CASE_TYPES[0]);
  const [status, setStatus] = useState<InspectionStatus>("planlandi");
  const [subjectType, setSubjectType] =
    useState<InspectionSubjectType>("tasinmaz");

  // Çoklu Parsel Listesi (Mevcut parselleri düzenleme, silme ve yeni parsel ekleme)
  const [parcels, setParcels] = useState<ParcelItem[]>([]);
  const [newAdaNo, setNewAdaNo] = useState("");
  const [newParselNo, setNewParselNo] = useState("");
  const [newBagimsizBolumNo, setNewBagimsizBolumNo] = useState("");
  const [newNitelik, setNewNitelik] = useState("");
  const [newYuzolcumu, setNewYuzolcumu] = useState("");
  const [newPaftaNo, setNewPaftaNo] = useState("");
  const [isQueryingTkgm, setIsQueryingTkgm] = useState(false);
  const [updatingParcelIdx, setUpdatingParcelIdx] = useState<number | null>(
    null
  );
  const [tkgmMessage, setTkgmMessage] = useState<string | null>(null);
  const [nearbySuggestions, setNearbySuggestions] = useState<ParcelItem[]>([]);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);

  // Araç Bilgileri
  const [plateNo, setPlateNo] = useState("");
  const [brandModel, setBrandModel] = useState("");
  const [vehicleType, setVehicleType] = useState(VEHICLE_TYPE_PRESETS[0]);
  const [chassisNo, setChassisNo] = useState("");
  const [damageSummary, setDamageSummary] = useState("");
  const [inspectionPlace, setInspectionPlace] = useState(
    VEHICLE_INSPECTION_PLACE_PRESETS[0]
  );

  // Adres, Bilirkişi, Notlar, Ekleyen Kişi ve Mesafe/Koordinat
  const [addressDetail, setAddressDetail] = useState("");
  const [addressBbNo, setAddressBbNo] = useState("");
  const [addressNitelik, setAddressNitelik] = useState("");
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);
  const [expertsText, setExpertsText] = useState("");
  const [notes, setNotes] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [lat, setLat] = useState<number>(FATSA_COURTHOUSE.lat);
  const [lng, setLng] = useState<number>(FATSA_COURTHOUSE.lng);
  const [distanceKm, setDistanceKm] = useState<number>(5);
  const [durationMin, setDurationMin] = useState<number>(10);
  const [routeGeometry, setRouteGeometry] = useState<
    [number, number][] | undefined
  >(undefined);
  const [isRecalculatingRoute, setIsRecalculatingRoute] = useState(false);

  // Kayıt açıldığında tüm mevcut değerleri doldur
  useEffect(() => {
    if (!record) return;
    setEsasNo(record.esasNo || "");
    setDistrict(record.district || "Fatsa");
    setNeighborhood(record.neighborhood || "");
    const resolvedMah =
      record.tkgmMahalleId ||
      resolveTkgmMahalle(record.district || "Fatsa", record.neighborhood || "")
        ?.id;
    setTkgmMahalleId(resolvedMah);
    setCorridor(record.corridor || "");
    setDate(record.date || "");
    setTime(record.time || "13:00");
    setCaseType(record.caseType || CASE_TYPES[0]);
    setStatus(record.status || "planlandi");
    setSubjectType(record.subjectType || "tasinmaz");

    // Mevcut parselleri yükle (Eğer parcels dizisi varsa onu, yoksa tekil adaNo/parselNo'yu listeye al)
    if (record.parcels && record.parcels.length > 0) {
      setParcels(
        record.parcels.map((p, idx) => ({
          ...p,
          bagimsizBolumNo:
            p.bagimsizBolumNo ||
            (idx === 0 ? record.bagimsizBolumNo : undefined),
        }))
      );
    } else if (record.adaNo || record.parselNo) {
      setParcels([
        {
          id: `${resolvedMah || record.district}-${record.adaNo || "0"}-${
            record.parselNo || "1"
          }`,
          mahalleId: resolvedMah,
          neighborhood: record.neighborhood,
          adaNo: record.adaNo || "0",
          parselNo: record.parselNo || "",
          bagimsizBolumNo: record.bagimsizBolumNo,
          nitelik: record.nitelik,
          yuzolcumuM2: record.yuzolcumuM2,
          paftaNo: record.paftaNo,
          mevkii: record.addressDetail,
          centerLat: record.lat,
          centerLng: record.lng,
          polygon: record.parcelPolygon,
          source: record.parcelSource,
        },
      ]);
    } else {
      setParcels([]);
    }

    setNewAdaNo("");
    setNewParselNo("");
    setNewBagimsizBolumNo("");
    setNewNitelik("");
    setNewYuzolcumu("");
    setNewPaftaNo("");
    setTkgmMessage(null);
    setNearbySuggestions([]);

    setPlateNo(record.vehicleInfo?.plateNo || "");
    setBrandModel(record.vehicleInfo?.brandModel || "");
    setVehicleType(record.vehicleInfo?.vehicleType || VEHICLE_TYPE_PRESETS[0]);
    setChassisNo(record.vehicleInfo?.chassisOrEngineNo || "");
    setDamageSummary(record.vehicleInfo?.damageSummary || "");
    setInspectionPlace(
      record.vehicleInfo?.inspectionPlace || VEHICLE_INSPECTION_PLACE_PRESETS[0]
    );

    setAddressDetail(record.addressDetail || "");
    setAddressBbNo(record.bagimsizBolumNo || "");
    setAddressNitelik(record.nitelik || "");
    setExpertsText(record.experts || "");
    setNotes(record.notes || "");
    setCreatedBy(record.createdBy || "");
    setLat(record.lat || FATSA_COURTHOUSE.lat);
    setLng(record.lng || FATSA_COURTHOUSE.lng);
    setDistanceKm(record.distanceKm || 5);
    setDurationMin(record.durationMin || 10);
    setRouteGeometry(record.routeGeometry);
  }, [record]);

  const districtTkgmMahalleList = useMemo(() => {
    return TKGM_MAHALLE_LIST.filter((m) => m.district === district).sort(
      (a, b) => a.text.localeCompare(b.text, "tr-TR")
    );
  }, [district]);

  if (!record) return null;

  // OSRM Mesafe & Süre Yeniden Hesapla (Dosyada birden fazla mahalle varsa tüm mahalleleri kapsayan rota çıkarır)
  const recalculateDistanceForCoords = async (
    targetLat: number,
    targetLng: number,
    customParcels?: ParcelItem[],
    customNeighborhood?: string
  ) => {
    setIsRecalculatingRoute(true);
    try {
      const activeParcels = customParcels ?? parcels;
      const activeNeighborhood = customNeighborhood ?? neighborhood;
      const stops = extractRecordLocationStops({
        district,
        neighborhood: activeNeighborhood,
        lat: targetLat,
        lng: targetLng,
        parcels: activeParcels,
      });

      const waypoints: { lat: number; lng: number }[] = [
        { lat: FATSA_COURTHOUSE.lat, lng: FATSA_COURTHOUSE.lng },
      ];
      for (const st of stops) {
        const dup = waypoints.some(
          (w) =>
            Math.abs(w.lat - st.lat) < 0.0004 &&
            Math.abs(w.lng - st.lng) < 0.0004
        );
        if (!dup) {
          waypoints.push({ lat: st.lat, lng: st.lng });
        }
      }
      if (waypoints.length < 2) {
        waypoints.push({ lat: targetLat, lng: targetLng });
      }

      const res = await calculateOSRMRoute(waypoints);
      setDistanceKm(res.distanceKm);
      setDurationMin(res.durationMin);
      setRouteGeometry(res.geometry);
    } finally {
      setIsRecalculatingRoute(false);
    }
  };

  // Mevcut listedeki bir parselin alanını değiştir
  const handleUpdateParcelField = (
    idx: number,
    field: keyof ParcelItem,
    value: any
  ) => {
    setParcels((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        [field]: value,
      };
      return next;
    });
  };

  // Mevcut listedeki bir parseli sil (Örn: yanlışlıkla eklenen 137/1 parselini tek tıkla siler)
  const handleDeleteParcelAtIndex = (idx: number) => {
    setParcels((prev) => prev.filter((_, i) => i !== idx));
  };

  // Mevcut listedeki bir parselin sınırını ve yüzölçümünü TKGM'den yeniden çek
  const handleRefreshParcelFromTkgm = async (idx: number) => {
    const target = parcels[idx];
    if (!target || !target.parselNo.trim()) return;
    setUpdatingParcelIdx(idx);
    setTkgmMessage(null);
    try {
      const targetMahalleName = target.neighborhood?.trim() || neighborhood;
      const targetMahalleId =
         resolveTkgmMahalle(district, targetMahalleName)?.id ||
        target.mahalleId ||
        tkgmMahalleId;

      const res = await queryParcelBoundary({
        district,
        neighborhood: targetMahalleName,
        tkgmMahalleId: targetMahalleId,
        baseLat: target.centerLat || lat,
        baseLng: target.centerLng || lng,
        adaNo: target.adaNo.trim() || "0",
        parselNo: target.parselNo.trim(),
        keepExactCenter: false,
      });

      const updatedParcelItem: ParcelItem = {
        ...target,
        mahalleId: res.mahalleId || targetMahalleId,
        neighborhood: targetMahalleName,
        adaNo: res.adaNo,
        parselNo: res.parselNo,
        nitelik: res.nitelik || target.nitelik,
        yuzolcumuM2: res.areaM2 || target.yuzolcumuM2,
        paftaNo: res.paftaNo || target.paftaNo,
        mevkii: res.mevkii || target.mevkii,
        centerLat: res.centerLat,
        centerLng: res.centerLng,
        polygon: res.polygon,
        source: res.source,
      };

      const nextList = parcels.map((item, i) =>
        i === idx ? updatedParcelItem : item
      );
      setParcels(nextList);

      if (idx === 0 && res.centerLat && res.centerLng) {
        setLat(res.centerLat);
        setLng(res.centerLng);
      }
      recalculateDistanceForCoords(
        idx === 0 && res.centerLat ? res.centerLat : lat,
        idx === 0 && res.centerLng ? res.centerLng : lng,
        nextList,
        neighborhood
      );

      setTkgmMessage(
        res.statusMessage ||
          `✓ ${targetMahalleName} ${res.adaNo} Ada / ${res.parselNo} Parsel (${formatAreaM2(
            res.areaM2
          )} m²) TKGM verisi güncellendi.`
      );
    } finally {
      setUpdatingParcelIdx(null);
    }
  };

  // Yeni parsel kutusundan TKGM'den çekerek veya doğrudan listeye parsel ekle
  const handleAddNewParcelToRecord = async () => {
    const cleanParsel = newParselNo.trim();
    if (!cleanParsel) {
      setTkgmMessage("Lütfen eklenecek parselin Parsel Numarasını yazınız.");
      return;
    }
    const cleanAda = newAdaNo.trim() || "0";

    setIsQueryingTkgm(true);
    setTkgmMessage(null);
    try {
      const manualArea =
        Number(String(newYuzolcumu).replace(",", ".")) || undefined;
      const res = await queryParcelBoundary({
        district,
        neighborhood,
        tkgmMahalleId,
        baseLat: lat,
        baseLng: lng,
        adaNo: cleanAda,
        parselNo: cleanParsel,
        yuzolcumuM2: manualArea,
        keepExactCenter: false,
      });

      const resolvedMah = res.mahalleId || tkgmMahalleId;
      const cleanNewBb = newBagimsizBolumNo.trim() || undefined;
      const newItem: ParcelItem = {
        id: `${resolvedMah || district}-${res.adaNo}-${res.parselNo}${cleanNewBb ? `-bb${cleanNewBb}` : ""}`,
        mahalleId: resolvedMah,
        neighborhood,
        adaNo: res.adaNo,
        parselNo: res.parselNo,
        bagimsizBolumNo: cleanNewBb,
        nitelik: newNitelik.trim() || res.nitelik || undefined,
        yuzolcumuM2: manualArea || res.areaM2,
        paftaNo: newPaftaNo.trim() || res.paftaNo || undefined,
        mevkii: res.mevkii || addressDetail || undefined,
        centerLat: res.centerLat,
        centerLng: res.centerLng,
        polygon: res.polygon,
        source: res.source,
      };

      let nextParcelsSnapshot: ParcelItem[] = [];
      setParcels((prev) => {
        const existsIdx = prev.findIndex(
          (p) =>
            (p.neighborhood || "") === (newItem.neighborhood || "") &&
            p.adaNo === newItem.adaNo &&
            p.parselNo === newItem.parselNo &&
            (p.bagimsizBolumNo || "") === (newItem.bagimsizBolumNo || "")
        );
        if (existsIdx >= 0) {
          const copy = [...prev];
          copy[existsIdx] = newItem;
          nextParcelsSnapshot = copy;
          return copy;
        }
        nextParcelsSnapshot = [...prev, newItem];
        return nextParcelsSnapshot;
      });

      const nextPrimaryLat =
        parcels.length === 0 && res.centerLat ? res.centerLat : lat;
      const nextPrimaryLng =
        parcels.length === 0 && res.centerLng ? res.centerLng : lng;
      if (parcels.length === 0 && res.centerLat && res.centerLng) {
        setLat(res.centerLat);
        setLng(res.centerLng);
      }
      recalculateDistanceForCoords(
        nextPrimaryLat,
        nextPrimaryLng,
        nextParcelsSnapshot.length > 0 ? nextParcelsSnapshot : [...parcels, newItem],
        neighborhood
      );

      // Yakındaki komşu parselleri de öner
      if (resolvedMah) {
        setIsLoadingNearby(true);
        fetchNearbyTkgmParcels({
          district,
          neighborhood,
          tkgmMahalleId: resolvedMah,
          adaNo: res.adaNo,
          parselNo: res.parselNo,
          centerLat: res.centerLat,
          centerLng: res.centerLng,
          polygon: res.polygon,
          excludeParcelKeys: [`${res.adaNo}/${res.parselNo}`],
        })
          .then((sugs) => setNearbySuggestions(sugs))
          .finally(() => setIsLoadingNearby(false));
      }

      setNewParselNo("");
      setNewBagimsizBolumNo("");
      setNewYuzolcumu("");
      setNewPaftaNo("");
      setTkgmMessage(
        `✓ ${newItem.adaNo} Ada / ${newItem.parselNo} Parsel${
          newItem.bagimsizBolumNo
            ? ` (Bağımsız Bölüm No: ${newItem.bagimsizBolumNo})`
            : ""
        } (${formatAreaM2(newItem.yuzolcumuM2 || 0)} m²) dosyaya eklendi.`
      );
    } finally {
      setIsQueryingTkgm(false);
    }
  };

  // Bilirkişi unvanını hızlı ekle/çıkar
  const handleToggleExpertInText = (fullTitle: string) => {
    const parts = expertsText
      .split("+")
      .map((s) => s.trim())
      .filter(Boolean);
    const exists = parts.some(
      (p) => p.toLocaleLowerCase("tr-TR") === fullTitle.toLocaleLowerCase("tr-TR")
    );
    if (exists) {
      setExpertsText(
        parts
          .filter(
            (p) =>
              p.toLocaleLowerCase("tr-TR") !==
              fullTitle.toLocaleLowerCase("tr-TR")
          )
          .join(" + ")
      );
    } else {
      setExpertsText([...parts, fullTitle].join(" + "));
    }
  };

  // Form Kaydet
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!esasNo.trim() || !neighborhood.trim() || !date || !time) return;

    // Eğer kullanıcı "Yeni Parsel Ekle" kutusuna bir Parsel No yazıp "+" butonuna basmadan direkt Kaydet'e bastıysa onu da koru (Sadece newParselNo doluysa!)
    const finalParcels = [...parcels].filter(
      (p) => p.parselNo && p.parselNo.trim().length > 0
    );
    if (subjectType === "tasinmaz" && newParselNo.trim()) {
      const cleanAda = newAdaNo.trim() || "0";
      const cleanParsel = newParselNo.trim();
      const cleanBb = newBagimsizBolumNo.trim() || undefined;
      const alreadyExists = finalParcels.some(
        (p) =>
          p.adaNo === cleanAda &&
          p.parselNo === cleanParsel &&
          (p.bagimsizBolumNo || "") === (cleanBb || "")
      );
      if (!alreadyExists) {
        const parsedArea = Number(String(newYuzolcumu).replace(",", "."));
        finalParcels.push({
          id: `${tkgmMahalleId || district}-${cleanAda}-${cleanParsel}${cleanBb ? `-bb${cleanBb}` : ""}`,
          mahalleId: tkgmMahalleId,
          neighborhood: neighborhood.trim(),
          adaNo: cleanAda,
          parselNo: cleanParsel,
          bagimsizBolumNo: cleanBb,
          nitelik: newNitelik.trim() || undefined,
          yuzolcumuM2:
            !isNaN(parsedArea) && parsedArea > 0 ? parsedArea : undefined,
          paftaNo: newPaftaNo.trim() || undefined,
          mevkii: addressDetail.trim() || undefined,
          centerLat: lat,
          centerLng: lng,
        });
      }
    }

    const primaryParcel = finalParcels[0];
    const totalArea = finalParcels.reduce(
      (sum, p) => sum + (Number(p.yuzolcumuM2) || 0),
      0
    );

    // Dosyada birden fazla mahalle varsa tüm mahalleleri birleştirerek kaydet
    const uniqueNeighborhoods =
      subjectType === "tasinmaz"
        ? getRecordUniqueNeighborhoods({
            neighborhood: neighborhood.trim(),
            parcels: finalParcels,
          })
        : getRecordUniqueNeighborhoods({
            neighborhood: neighborhood.trim(),
          });
    const combinedNeighborhood =
      uniqueNeighborhoods.length > 0
        ? uniqueNeighborhoods.join(" / ")
        : neighborhood.trim();

    const updatedRecord: InspectionRecord = {
      ...record,
      esasNo: esasNo.trim(),
      district,
      neighborhood: combinedNeighborhood,
      tkgmMahalleId: primaryParcel?.mahalleId || tkgmMahalleId,
      corridor: corridor || record.corridor,
      date,
      time,
      caseType,
      status,
      subjectType,
      addressDetail: addressDetail.trim() || undefined,
      experts: expertsText.trim(),
      notes: notes.trim(),
      createdBy: createdBy.trim() || record.createdBy,
      lat:
        subjectType === "tasinmaz" && primaryParcel?.centerLat
          ? primaryParcel.centerLat
          : lat,
      lng:
        subjectType === "tasinmaz" && primaryParcel?.centerLng
          ? primaryParcel.centerLng
          : lng,
      distanceKm: Number(distanceKm) || record.distanceKm,
      durationMin: Number(durationMin) || record.durationMin,
      routeGeometry,
    };

    if (subjectType === "arac") {
      updatedRecord.vehicleInfo = {
        plateNo:
          plateNo.trim().toLocaleUpperCase("tr-TR") || "52 AG 001",
        brandModel: brandModel.trim() || undefined,
        vehicleType: vehicleType.trim() || undefined,
        chassisOrEngineNo: chassisNo.trim() || undefined,
        damageSummary: damageSummary.trim() || undefined,
        inspectionPlace: inspectionPlace.trim() || undefined,
      };
      updatedRecord.adaNo = undefined;
      updatedRecord.parselNo = undefined;
      updatedRecord.bagimsizBolumNo = undefined;
      updatedRecord.nitelik = undefined;
      updatedRecord.yuzolcumuM2 = undefined;
      updatedRecord.paftaNo = undefined;
      updatedRecord.parcelPolygon = undefined;
      updatedRecord.parcels = undefined;
    } else if (subjectType === "adres") {
      updatedRecord.vehicleInfo = undefined;
      updatedRecord.adaNo = undefined;
      updatedRecord.parselNo = undefined;
      updatedRecord.bagimsizBolumNo = addressBbNo.trim() || undefined;
      updatedRecord.nitelik = addressNitelik.trim() || undefined;
      updatedRecord.yuzolcumuM2 = undefined;
      updatedRecord.paftaNo = undefined;
      updatedRecord.parcelPolygon = undefined;
      updatedRecord.parcels = undefined;
    } else {
      updatedRecord.vehicleInfo = undefined;
      updatedRecord.adaNo = primaryParcel?.adaNo || undefined;
      updatedRecord.parselNo = primaryParcel?.parselNo || undefined;
      updatedRecord.bagimsizBolumNo =
        primaryParcel?.bagimsizBolumNo || undefined;
      updatedRecord.nitelik = primaryParcel?.nitelik || undefined;
      updatedRecord.yuzolcumuM2 =
        totalArea > 0 ? Number(totalArea.toFixed(2)) : undefined;
      updatedRecord.paftaNo = primaryParcel?.paftaNo || undefined;
      updatedRecord.parcelPolygon = primaryParcel?.polygon || undefined;
      updatedRecord.parcelSource =
        primaryParcel?.source || record.parcelSource || "tkgm_api";
      updatedRecord.parcels =
        finalParcels.length > 0 ? finalParcels : undefined;
    }

    onSave(updatedRecord);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-2.5 sm:p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-3.5 text-white shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 font-mono text-xs font-bold text-emerald-300">
                {record.esasNo}
              </span>
              <h2 className="text-sm sm:text-base font-bold">
                Keşif Kaydını & Tüm Detaylarını Düzenle
              </h2>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Dosya numarası, tarih/saat, mahalle, ada/parsel listesi, araç bilgileri, bilirkişi heyeti ve notları değiştirebilirsiniz
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
            title="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4"
        >
          {/* 1. Satır: İlçe, Esas No, Keşif Tarihi, Saat */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Bağlı İlçe *
              </label>
              <select
                value={district}
                onChange={(e) => {
                  const nextD = e.target.value as CourtDistrict;
                  setDistrict(nextD);
                  const firstN = FATSA_NEIGHBORHOODS.find(
                    (n) => n.district === nextD
                  );
                  if (firstN) {
                    setNeighborhood(firstN.name);
                    setTkgmMahalleId(
                      resolveTkgmMahalle(nextD, firstN.name)?.id
                    );
                    setCorridor(firstN.corridor);
                    setLat(firstN.lat);
                    setLng(firstN.lng);
                    recalculateDistanceForCoords(firstN.lat, firstN.lng);
                  }
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
              >
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d} İlçesi
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Esas No *
              </label>
              <input
                type="text"
                required
                value={esasNo}
                onChange={(e) => setEsasNo(e.target.value)}
                placeholder="Örn: 2026/145 E."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Keşif Tarihi *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Keşif Saati *
              </label>
              <input
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>
          </div>

          {/* 2. Satır: Dava Türü & Keşif Durumu */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Keşif Türü / Dava Konusu *
              </label>
              <select
                value={caseType}
                onChange={(e) => setCaseType(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
              >
                {CASE_TYPES.map((ct) => (
                  <option key={ct} value={ct}>
                    {ct}
                  </option>
                ))}
                {!CASE_TYPES.includes(caseType as any) && caseType && (
                  <option value={caseType}>{caseType}</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Keşif Durumu
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as InspectionStatus)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
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

          {/* 3. Satır: Mahalle / Köy & Resmi TKGM Mahalle Seçimi */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Mahalle / Köy Adı ({district}) *
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-emerald-600" />
                <input
                  type="text"
                  required
                  value={neighborhood}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNeighborhood(val);
                    const matched = resolveTkgmMahalle(district, val);
                    if (matched) setTkgmMahalleId(matched.id);
                  }}
                  placeholder="Mahalle veya köy adı..."
                  className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                TKGM Resmi Tapu Mahalle / Köy Kaydı
              </label>
              <select
                value={tkgmMahalleId || ""}
                onChange={(e) => {
                  const idNum = Number(e.target.value);
                  const found = districtTkgmMahalleList.find(
                    (m) => m.id === idNum
                  );
                  if (found) {
                    setTkgmMahalleId(found.id);
                    setNeighborhood(`${found.text} Mahallesi`);
                    const localCoord = FATSA_NEIGHBORHOODS.find(
                      (n) =>
                        n.district === found.district &&
                        n.name
                          .toLocaleLowerCase("tr-TR")
                          .startsWith(found.text.toLocaleLowerCase("tr-TR"))
                    );
                    if (localCoord) {
                      setCorridor(localCoord.corridor);
                      setLat(localCoord.lat);
                      setLng(localCoord.lng);
                      recalculateDistanceForCoords(
                        localCoord.lat,
                        localCoord.lng
                      );
                    }
                  }
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
              >
                <option value="">-- TKGM Mahalle Seçiniz --</option>
                {districtTkgmMahalleList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.text} Mahallesi (TKGM #{m.id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4. Satır: Keşif Konusu (Taşınmaz vs Adres Bazlı vs Araç) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">
                Keşif İnceleme Konusu:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSubjectType("tasinmaz")}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                    subjectType === "tasinmaz"
                      ? "border-amber-600 bg-amber-50 text-amber-950"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <Layers className="h-3.5 w-3.5 text-amber-600" />
                  <span>📐 Taşınmaz (Ada / Parsel)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubjectType("adres")}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                    subjectType === "adres"
                      ? "border-teal-600 bg-teal-50 text-teal-950"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <Home className="h-3.5 w-3.5 text-teal-600" />
                  <span>🏠 Adres Bazlı (Cadde / Sokak / Daire)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubjectType("arac")}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                    subjectType === "arac"
                      ? "border-indigo-600 bg-indigo-50 text-indigo-950"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <Car className="h-3.5 w-3.5 text-indigo-600" />
                  <span>🚗 Araç (Plaka & Hasar Tespiti)</span>
                </button>
              </div>
            </div>

            {subjectType === "tasinmaz" ? (
              <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/60 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-amber-950">
                    📐 Dosyadaki Kayıtlı Parseller ({parcels.length} Adet ·
                    Toplam:{" "}
                    {formatAreaM2(
                      parcels.reduce(
                        (acc, p) => acc + (Number(p.yuzolcumuM2) || 0),
                        0
                      )
                    )}{" "}
                    m²)
                  </div>
                  {parcels.length > 0 && (
                    <span className="text-[11px] text-amber-800">
                      Parsel numaralarını değiştirebilir veya fazla parseli{" "}
                      <strong>Sil</strong> butonuyla kaldırabilirsiniz
                    </span>
                  )}
                </div>

                {tkgmMessage && (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-950">
                    {tkgmMessage}
                  </div>
                )}

                {/* Mevcut Parsellerin Düzenlenebilir Listesi */}
                {parcels.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-white p-3 text-xs text-slate-500">
                    Bu dosyada henüz kayıtlı parsel bulunmuyor. Aşağıdaki
                    bölümden Ada ve Parsel numarası girerek ekleyebilirsiniz.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {parcels.map((p, idx) => (
                      <div
                        key={p.id || idx}
                        className="rounded-lg border border-amber-300 bg-white p-2.5 shadow-2xs space-y-2"
                      >
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-8 items-end">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              {idx + 1}. Parsel — Mahalle
                            </label>
                            <input
                              type="text"
                              value={p.neighborhood || neighborhood}
                              onChange={(e) =>
                                handleUpdateParcelField(
                                  idx,
                                  "neighborhood",
                                  e.target.value
                                )
                              }
                              placeholder="Mahalle..."
                              className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-900 focus:border-amber-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              Ada No
                            </label>
                            <input
                              type="text"
                              value={p.adaNo}
                              onChange={(e) =>
                                handleUpdateParcelField(
                                  idx,
                                  "adaNo",
                                  e.target.value
                                )
                              }
                              placeholder="Ada (0)"
                              className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono font-bold text-slate-900 focus:border-amber-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              Parsel No
                            </label>
                            <input
                              type="text"
                              value={p.parselNo}
                              onChange={(e) =>
                                handleUpdateParcelField(
                                  idx,
                                  "parselNo",
                                  e.target.value
                                )
                              }
                              placeholder="Parsel"
                              className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono font-bold text-slate-900 focus:border-amber-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              Bağımsız Bölüm No
                            </label>
                            <input
                              type="text"
                              value={p.bagimsizBolumNo || ""}
                              onChange={(e) =>
                                handleUpdateParcelField(
                                  idx,
                                  "bagimsizBolumNo",
                                  e.target.value || undefined
                                )
                              }
                              placeholder="Örn: 4"
                              className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono font-bold text-indigo-900 focus:border-amber-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              Yüzölçümü (m²)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={p.yuzolcumuM2 ?? ""}
                              onChange={(e) =>
                                handleUpdateParcelField(
                                  idx,
                                  "yuzolcumuM2",
                                  e.target.value
                                    ? Number(e.target.value)
                                    : undefined
                                )
                              }
                              placeholder="m²"
                              className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono text-emerald-900 focus:border-amber-600 focus:outline-none"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              Niteliği (Cinsi)
                            </label>
                            <input
                              type="text"
                              list="edit-parcel-nitelik-list"
                              value={p.nitelik || ""}
                              onChange={(e) =>
                                handleUpdateParcelField(
                                  idx,
                                  "nitelik",
                                  e.target.value
                                )
                              }
                              placeholder="Fındık Bahçesi, Tarla..."
                              className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleRefreshParcelFromTkgm(idx)}
                              disabled={updatingParcelIdx === idx}
                              className="inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap"
                              title="Bu parselin sınırını ve yüzölçümünü TKGM'den yeniden sorgula"
                            >
                              <RefreshCw
                                className={`h-3 w-3 ${
                                  updatingParcelIdx === idx
                                    ? "animate-spin"
                                    : ""
                                }`}
                              />
                              <span>TKGM</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteParcelAtIndex(idx)}
                              className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 whitespace-nowrap"
                              title="Bu parseli dosyadan kaldır"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Sil</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Yeni Parsel Ekleme Satırı */}
                <div className="rounded-lg border border-emerald-300 bg-white p-3 space-y-2.5">
                  <div className="text-xs font-bold text-emerald-950">
                    + Dosyaya Yeni Parsel Ekle (TKGM Sınır & Yüzölçümü Otomatik
                    Çekilir)
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-6 items-end">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                        Ada No (Yoksa 0)
                      </label>
                      <input
                        type="text"
                        value={newAdaNo}
                        onChange={(e) => setNewAdaNo(e.target.value)}
                        placeholder="Örn: 137"
                        className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                        Parsel No
                      </label>
                      <input
                        type="text"
                        value={newParselNo}
                        onChange={(e) => setNewParselNo(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddNewParcelToRecord();
                          }
                        }}
                        placeholder="Örn: 13"
                        className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                        Bağımsız Bölüm No
                      </label>
                      <input
                        type="text"
                        value={newBagimsizBolumNo}
                        onChange={(e) => setNewBagimsizBolumNo(e.target.value)}
                        placeholder="Örn: 4"
                        className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono font-bold text-indigo-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                        Yüzölçümü (m²)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={newYuzolcumu}
                        onChange={(e) => setNewYuzolcumu(e.target.value)}
                        placeholder="TKGM Otomatik"
                        className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                        Nitelik
                      </label>
                      <input
                        type="text"
                        list="edit-parcel-nitelik-list"
                        value={newNitelik}
                        onChange={(e) => setNewNitelik(e.target.value)}
                        placeholder="Fındık Bahçesi..."
                        className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={handleAddNewParcelToRecord}
                        disabled={isQueryingTkgm || !newParselNo.trim()}
                        className="flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>
                          {isQueryingTkgm ? "TKGM..." : "Parseli Ekle"}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Yakın Parsel Önerileri */}
                  {(isLoadingNearby || nearbySuggestions.length > 0) && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-900">
                        <span className="flex items-center gap-1">
                          <Sparkles className="h-3 w-3 text-emerald-600" />
                          <span>
                            Yakındaki Komşu Parseller (Tıklayarak Ekleyin):
                          </span>
                        </span>
                        {isLoadingNearby && (
                          <span className="text-[10px] text-emerald-600 animate-pulse">
                            Komşu parseller taranıyor...
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {nearbySuggestions.map((sug) => {
                          const added = parcels.some(
                            (p) =>
                              p.adaNo === sug.adaNo &&
                              p.parselNo === sug.parselNo
                          );
                          return (
                            <button
                              key={`${sug.adaNo}-${sug.parselNo}`}
                              type="button"
                              disabled={added}
                              onClick={() =>
                                setParcels((prev) =>
                                  added ? prev : [...prev, sug]
                                )
                              }
                              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-mono ${
                                added
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 font-bold"
                                  : "border-amber-300 bg-amber-50/70 text-slate-900 font-bold hover:border-emerald-600 hover:bg-emerald-50"
                              }`}
                            >
                              {added ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Plus className="h-3 w-3 text-emerald-700" />
                              )}
                              <span>
                                {sug.adaNo}/{sug.parselNo}
                              </span>
                              {sug.yuzolcumuM2 && (
                                <span className="text-[10px] font-normal text-slate-600">
                                  ({formatAreaM2(sug.yuzolcumuM2)} m²)
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <datalist id="edit-parcel-nitelik-list">
                  {PARCEL_NITELIK_PRESETS.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>
            ) : subjectType === "adres" ? (
              /* Adres Bazlı Keşif Düzenleme Paneli */
              <div className="space-y-3 rounded-xl border border-teal-300 bg-teal-50/60 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-teal-950">
                    <Home className="h-4 w-4 text-teal-700" />
                    <span>
                      🏠 Adres Bazlı Keşif Detayları (Cadde / Sokak / Bina / Daire)
                    </span>
                  </div>
                  <span className="rounded bg-teal-700 px-2 py-0.5 text-[10px] font-bold text-white">
                    Ada/Parsel Gerekmeden Açık Adres Keşfi
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12 items-end">
                  <div className="sm:col-span-6">
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">
                      Açık Adres (Cadde / Sokak / Bina-Site Adı / Dış Kapı No) *
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        required={subjectType === "adres"}
                        list="edit-street-presets"
                        value={addressDetail}
                        onChange={(e) => setAddressDetail(e.target.value)}
                        placeholder="Örn: Sakarya Cad. Aydın Apt. No: 42"
                        className="w-full rounded-lg border border-teal-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-teal-600 focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={isGeocodingAddress}
                        onClick={async () => {
                          setIsGeocodingAddress(true);
                          try {
                            const geo = await geocodeStreetAddressInDistrict(
                              addressDetail,
                              neighborhood,
                              district
                            );
                            setLat(geo.lat);
                            setLng(geo.lng);
                            if (geo.matchedNeighborhood) {
                              setNeighborhood(geo.matchedNeighborhood);
                            }
                            await recalculateDistanceForCoords(
                              geo.lat,
                              geo.lng,
                              [],
                              geo.matchedNeighborhood || neighborhood
                            );
                          } finally {
                            setIsGeocodingAddress(false);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                        title="Adresi haritada bul ve Adliye mesafesini güncelle"
                      >
                        <Search className="h-3.5 w-3.5" />
                        <span>
                          {isGeocodingAddress ? "Aranıyor..." : "Konumu Bul"}
                        </span>
                      </button>
                    </div>
                    <datalist id="edit-street-presets">
                      {FATSA_STREET_PRESETS.map((st) => (
                        <option key={st} value={st} />
                      ))}
                    </datalist>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">
                      Kat / Daire (Bağımsız Bölüm) No
                    </label>
                    <input
                      type="text"
                      value={addressBbNo}
                      onChange={(e) => setAddressBbNo(e.target.value)}
                      placeholder="Örn: Kat: 2, Daire: 5"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-teal-950 focus:border-teal-600 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">
                      İncelenen Yerin Niteliği
                    </label>
                    <input
                      type="text"
                      list="edit-address-nitelik-list"
                      value={addressNitelik}
                      onChange={(e) => setAddressNitelik(e.target.value)}
                      placeholder="Örn: Konut / Dükkan / İşyeri"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                    />
                    <datalist id="edit-address-nitelik-list">
                      {ADDRESS_NITELIK_PRESETS.map((an) => (
                        <option key={an} value={an} />
                      ))}
                    </datalist>
                  </div>
                </div>
              </div>
            ) : (
              /* Araç Düzenleme Paneli */
              <div className="space-y-3 rounded-xl border border-indigo-300 bg-indigo-50/60 p-3.5">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">
                      Araç Plaka No *
                    </label>
                    <input
                      type="text"
                      required={subjectType === "arac"}
                      value={plateNo}
                      onChange={(e) =>
                        setPlateNo(e.target.value.toLocaleUpperCase("tr-TR"))
                      }
                      placeholder="Örn: 52 ABC 123"
                      className="w-full rounded-lg border border-indigo-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 uppercase focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">
                      Marka / Model / Yıl
                    </label>
                    <input
                      type="text"
                      value={brandModel}
                      onChange={(e) => setBrandModel(e.target.value)}
                      placeholder="Örn: 2022 Renault Megane"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">
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
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">
                      Hasar / Tespit Konusu Özeti
                    </label>
                    <input
                      type="text"
                      value={damageSummary}
                      onChange={(e) => setDamageSummary(e.target.value)}
                      placeholder="Örn: Trafik kazası hasar ve değer kaybı tespiti"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">
                      Aracın İnceleneceği Yer
                    </label>
                    <input
                      type="text"
                      value={inspectionPlace}
                      onChange={(e) => setInspectionPlace(e.target.value)}
                      placeholder="Örn: Fatsa Küçük Sanayi Sitesi"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. Satır: Bilirkişi Heyeti Düzenleme */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <Users className="h-4 w-4 text-emerald-600" />
                <span>
                  Bilirkişi Heyeti (Unvanlara Tıklayarak Ekleyip Çıkarabilir
                  veya Metni Düzenleyebilirsiniz)
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_EXPERT_TITLES.map((item) => {
                const isIncluded = expertsText
                  .toLocaleLowerCase("tr-TR")
                  .includes(item.fullTitle.toLocaleLowerCase("tr-TR"));
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleToggleExpertInText(item.fullTitle)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all ${
                      isIncluded
                        ? "border-emerald-600 bg-emerald-50 text-emerald-950"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {isIncluded ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Plus className="h-3 w-3 text-slate-400" />
                    )}
                    <span>{item.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              list="edit-expert-presets"
              value={expertsText}
              onChange={(e) => setExpertsText(e.target.value)}
              placeholder="Örn: Fen Bilirkişisi + Ziraat Bilirkişisi..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
            <datalist id="edit-expert-presets">
              {EXPERT_PRESETS.map((ep) => (
                <option key={ep} value={ep} />
              ))}
            </datalist>
          </div>

          {/* 6. Satır: Mevki / Açık Adres, Keşfi Ekleyen Kişi ve Mesafe */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Mevki / Açık Adres Açıklaması
              </label>
              <input
                type="text"
                value={addressDetail}
                onChange={(e) => setAddressDetail(e.target.value)}
                placeholder="Örn: Köy içi mevkii..."
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                <span className="inline-flex items-center gap-1">
                  <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Keşfi Ekleyen Kişi / Cihaz</span>
                </span>
              </label>
              <input
                type="text"
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                placeholder="Örn: Ahmet Yılmaz (Zabıt Katibi)"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Adliye Mesafe (km) & Süre (dk)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step="0.1"
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(Number(e.target.value))}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-mono font-bold text-emerald-800"
                  title="Adliye Mesafesi (km)"
                />
                <span className="text-xs text-slate-500">km</span>
                <input
                  type="number"
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value))}
                  className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-mono font-bold text-slate-900"
                  title="Sürüş Süresi (dk)"
                />
                <span className="text-xs text-slate-500">dk</span>
                <button
                  type="button"
                  onClick={() => recalculateDistanceForCoords(lat, lng)}
                  disabled={isRecalculatingRoute}
                  className="rounded border border-slate-300 bg-slate-50 p-1.5 text-slate-700 hover:bg-slate-100"
                  title="OSRM ile mesafeyi yeniden hesapla"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      isRecalculatingRoute ? "animate-spin" : ""
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* 7. Satır: Dosya Notları */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Keşif Notları
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Dosya ile ilgili keşif notları..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              İptal
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
            >
              <Save className="h-4 w-4" />
              <span>Değişiklikleri Kaydet</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
