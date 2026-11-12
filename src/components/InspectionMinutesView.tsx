import React, { useEffect, useMemo, useState } from "react";
import {
  FileText,
  Users,
  UserCheck,
  Download,
  Plus,
  Trash2,
  Pencil,
  Check,
  Search,
  Calendar as CalendarIcon,
  Sparkles,
  RotateCcw,
  CheckSquare,
  Square,
  Save,
  BookOpen,
  Car,
} from "lucide-react";
import { InspectionRecord, RegisteredExpert } from "../types";
import {
  COURT_BAILIFF_PRESETS,
  COURT_CLERK_PRESETS,
  COURT_JUDGE_PRESETS,
} from "../data/fatsaData";
import {
  formatAdaParselLabel,
  formatDateTR,
} from "../services/geoService";
import {
  buildDefaultExpertDescription,
  buildGroupedParcelObservationGroups,
  DEFAULT_REGISTERED_EXPERTS,
  downloadWordMinutesDocument,
  EXPERT_DIRECTORY_TITLES,
  formatDateSlashTR,
  formatEsasNoForTemplate,
  formatExpertTitlesInlinePhrase,
  generateAutomaticMinutesText,
  MinutesGenerationOptions,
  STAFF_DEFAULT_SICIL_MAP,
} from "../services/wordMinutesService";

function getExpertOrderRank(title: string): number {
  const lower = title.toLocaleLowerCase("tr-TR");
  if (lower.includes("fen") || lower.includes("kadastro")) return 1;
  if (lower.includes("ziraat")) return 2;
  if (lower.includes("inşaat")) return 3;
  return 4;
}

interface InspectionMinutesViewProps {
  inspections: InspectionRecord[];
  registeredExperts: RegisteredExpert[];
  initialSubTab?: "zapt" | "bilirkisiler";
  preselectedRecordId?: string | null;
  onSaveRegisteredExperts: (nextExperts: RegisteredExpert[]) => void;
  onUpdateInspectionsBatch: (updatedRecords: InspectionRecord[]) => void;
}

export const InspectionMinutesView: React.FC<InspectionMinutesViewProps> = ({
  inspections,
  registeredExperts,
  initialSubTab = "zapt",
  preselectedRecordId,
  onSaveRegisteredExperts,
  onUpdateInspectionsBatch,
}) => {
  const [subTab, setSubTab] = useState<"zapt" | "bilirkisiler">(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  // ============================================================================
  // 1. KEŞİF SEÇİMİ VE FİLTRELEME STATE
  // ============================================================================
  const [dateFilter, setDateFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const sortedInspections = useMemo(() => {
    return [...inspections]
      .filter((r) => r.status !== "iptal_edildi")
      .sort((a, b) => {
        const d = a.date.localeCompare(b.date);
        if (d !== 0) return d;
        return a.time.localeCompare(b.time);
      });
  }, [inspections]);

  const uniqueDates = useMemo(() => {
    const s = new Set<string>();
    for (const r of sortedInspections) {
      if (r.date) s.add(r.date);
    }
    return Array.from(s).sort();
  }, [sortedInspections]);

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase("tr-TR");
    return sortedInspections.filter((rec) => {
      if (dateFilter !== "ALL" && rec.date !== dateFilter) return false;
      if (!q) return true;
      return (
        rec.esasNo.toLocaleLowerCase("tr-TR").includes(q) ||
        rec.neighborhood.toLocaleLowerCase("tr-TR").includes(q) ||
        rec.district.toLocaleLowerCase("tr-TR").includes(q) ||
        rec.caseType.toLocaleLowerCase("tr-TR").includes(q) ||
        (rec.adaNo && rec.adaNo.includes(q)) ||
        (rec.parselNo && rec.parselNo.includes(q))
      );
    });
  }, [sortedInspections, dateFilter, searchQuery]);

  // Çoklu seçilen keşif ID'leri ve şu an önizlenen aktif keşif ID'si
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>(() => {
    if (preselectedRecordId) return [preselectedRecordId];
    return sortedInspections[0] ? [sortedInspections[0].id] : [];
  });
  const [activeRecordId, setActiveRecordId] = useState<string | null>(() => {
    return preselectedRecordId || sortedInspections[0]?.id || null;
  });

  useEffect(() => {
    if (preselectedRecordId) {
      setActiveRecordId(preselectedRecordId);
      setSelectedRecordIds((prev) =>
        prev.includes(preselectedRecordId)
          ? prev
          : [...prev, preselectedRecordId]
      );
    }
  }, [preselectedRecordId]);

  const activeRecord = useMemo(() => {
    return (
      sortedInspections.find((r) => r.id === activeRecordId) ||
      filteredList[0] ||
      sortedInspections[0] ||
      null
    );
  }, [sortedInspections, filteredList, activeRecordId]);

  // ============================================================================
  // 2. AKTİF KEŞİF İÇİN PERSONEL (HAKİM, KATİP, MÜBAŞİR), BİLİRKİŞİ VE ŞABLON DETAYLARI
  // ============================================================================
  const [judgeName, setJudgeName] = useState<string>(
    COURT_JUDGE_PRESETS[0] || "Kadir SAĞLAM"
  );
  const [judgeSicilNo, setJudgeSicilNo] = useState<string>("267550");
  const [clerkName, setClerkName] = useState<string>(
    COURT_CLERK_PRESETS[0] || "Mehmet AKIN"
  );
  const [clerkSicilNo, setClerkSicilNo] = useState<string>("186472");
  const [bailiffName, setBailiffName] = useState<string>(
    COURT_BAILIFF_PRESETS[0] || "Ebru YILMAZ"
  );
  const [bailiffSicilNo, setBailiffSicilNo] = useState<string>("231993");

  // Şablondaki ek değişkenler (Keşif Aracı, Yoklama Metni, Şoför Ücreti)
  const [vehiclePlateText, setVehiclePlateText] = useState<string>(
    "ATGV’ye ait 06CUD608 plaka sayılı keşif aracı vasıtasıyla"
  );
  const [attendingPartiesText, setAttendingPartiesText] = useState<string>(
    "Keşif mahalinde yapılan yoklamada davacı vekili XXXXXX hazır bulunduğu görüldü. Açık keşfe devam olundu."
  );
  const [driverFeeText, setDriverFeeText] = useState<string>("2.500,00 TL");

  const [selectedExpertIds, setSelectedExpertIds] = useState<string[]>([]);
  const [isManualTextMode, setIsManualTextMode] = useState<boolean>(false);
  const [manualBodyText, setManualBodyText] = useState<string>("");
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setFeedbackBanner(msg);
    setTimeout(() => setFeedbackBanner(null), 4500);
  };

  // Aktif dosya değiştiğinde o dosyada kayıtlı personel ve bilirkişileri yükle
  useEffect(() => {
    if (!activeRecord) return;
    const nextJudge =
      activeRecord.judgeName?.trim() || COURT_JUDGE_PRESETS[0] || "Kadir SAĞLAM";
    const nextClerk =
      activeRecord.clerkName?.trim() || COURT_CLERK_PRESETS[0] || "Mehmet AKIN";
    const nextBailiff =
      activeRecord.bailiffName?.trim() ||
      COURT_BAILIFF_PRESETS[0] ||
      "Ebru YILMAZ";

    setJudgeName(nextJudge);
    setJudgeSicilNo(
      activeRecord.judgeSicilNo?.trim() ||
        STAFF_DEFAULT_SICIL_MAP[nextJudge] ||
        "267550"
    );
    setClerkName(nextClerk);
    setClerkSicilNo(
      activeRecord.clerkSicilNo?.trim() ||
        STAFF_DEFAULT_SICIL_MAP[nextClerk] ||
        ""
    );
    setBailiffName(nextBailiff);
    setBailiffSicilNo(
      activeRecord.bailiffSicilNo?.trim() ||
        STAFF_DEFAULT_SICIL_MAP[nextBailiff] ||
        "231993"
    );

    if (
      activeRecord.assignedExpertIds &&
      activeRecord.assignedExpertIds.length > 0
    ) {
      setSelectedExpertIds(activeRecord.assignedExpertIds);
    } else if (activeRecord.experts && registeredExperts.length > 0) {
      const recExpLower = activeRecord.experts.toLocaleLowerCase("tr-TR");
      const matched = registeredExperts
        .filter(
          (re) =>
            recExpLower.includes(re.fullName.toLocaleLowerCase("tr-TR")) ||
            (recExpLower.includes("fen") &&
              re.title.toLocaleLowerCase("tr-TR").includes("fen")) ||
            (recExpLower.includes("ziraat") &&
              re.title.toLocaleLowerCase("tr-TR").includes("ziraat")) ||
            (recExpLower.includes("inşaat") &&
              re.title.toLocaleLowerCase("tr-TR").includes("inşaat")) ||
            (recExpLower.includes("değerleme") &&
              re.title.toLocaleLowerCase("tr-TR").includes("değerleme")) ||
            (recExpLower.includes("mimar") &&
              re.title.toLocaleLowerCase("tr-TR").includes("mimar")) ||
            (recExpLower.includes("makine") &&
              re.title.toLocaleLowerCase("tr-TR").includes("makine"))
        )
        .map((re) => re.id);
      if (matched.length > 0) {
        setSelectedExpertIds(matched);
      } else {
        setSelectedExpertIds(registeredExperts.map((re) => re.id));
      }
    } else {
      // Varsayılan olarak kayıtlı şablon bilirkişilerini (Kenan YILDIZ, Serhan TURAN, Barış KIRCA) seç
      setSelectedExpertIds(registeredExperts.map((re) => re.id));
    }

    if (activeRecord.customMinutesText) {
      setIsManualTextMode(true);
      setManualBodyText(activeRecord.customMinutesText);
    } else {
      setIsManualTextMode(false);
      setManualBodyText("");
    }
  }, [activeRecord?.id, registeredExperts]);

  const activeSelectedExperts = useMemo(() => {
    return registeredExperts.filter((e) => selectedExpertIds.includes(e.id));
  }, [registeredExperts, selectedExpertIds]);

  const orderedActiveExperts = useMemo(() => {
    return [...activeSelectedExperts].sort(
      (a, b) => getExpertOrderRank(a.title) - getExpertOrderRank(b.title)
    );
  }, [activeSelectedExperts]);

  const autoGeneratedBodyText = useMemo(() => {
    if (!activeRecord) return "";
    return generateAutomaticMinutesText({
      record: activeRecord,
      judgeName,
      judgeSicilNo,
      clerkName,
      clerkSicilNo,
      bailiffName,
      bailiffSicilNo,
      selectedExperts: activeSelectedExperts,
      vehiclePlateText,
      attendingPartiesText,
      driverFeeTl: driverFeeText,
    });
  }, [
    activeRecord,
    judgeName,
    judgeSicilNo,
    clerkName,
    clerkSicilNo,
    bailiffName,
    bailiffSicilNo,
    activeSelectedExperts,
    vehiclePlateText,
    attendingPartiesText,
    driverFeeText,
  ]);

  const activeObservationGroups = useMemo(() => {
    if (!activeRecord) return [];
    return buildGroupedParcelObservationGroups(activeRecord);
  }, [activeRecord]);

  // Aktif dosyaya veya seçili tüm dosyalara personel ve bilirkişi seçimini kaydet
  const handleSaveStaffAndExpertsToRecord = (applyToAllSelected: boolean) => {
    if (!activeRecord) return;
    const targetIds = applyToAllSelected
      ? selectedRecordIds.length > 0
        ? selectedRecordIds
        : [activeRecord.id]
      : [activeRecord.id];

    const expertSummaryStr =
      activeSelectedExperts.length > 0
        ? activeSelectedExperts
            .map((e) => `${e.title} ${e.fullName}`)
            .join(" + ")
        : undefined;

    const updated = inspections.map((rec) => {
      if (!targetIds.includes(rec.id)) return rec;
      return {
        ...rec,
        judgeName: judgeName.trim() || undefined,
        judgeSicilNo: judgeSicilNo.trim() || undefined,
        clerkName: clerkName.trim() || undefined,
        clerkSicilNo: clerkSicilNo.trim() || undefined,
        bailiffName: bailiffName.trim() || undefined,
        bailiffSicilNo: bailiffSicilNo.trim() || undefined,
        assignedExpertIds: [...selectedExpertIds],
        experts: expertSummaryStr || rec.experts,
        customMinutesText:
          rec.id === activeRecord.id && isManualTextMode
            ? manualBodyText
            : rec.customMinutesText,
      };
    });

    onUpdateInspectionsBatch(updated);
    showToast(
      applyToAllSelected
        ? `✓ Seçili ${targetIds.length} keşif dosyasına Hakim (${judgeName}), Katip (${clerkName}), Mübaşir (${bailiffName}) ve seçili bilirkişiler kaydedildi.`
        : `✓ ${activeRecord.esasNo} sayılı dosyaya personel ve bilirkişi bilgileri kaydedildi.`
    );
  };

  // Tekil (Aktif) Dosyayı Word (.doc) Olarak İndir
  const handleDownloadActiveWord = () => {
    if (!activeRecord) return;
    handleSaveStaffAndExpertsToRecord(false);
    const fileName = downloadWordMinutesDocument([
      {
        record: activeRecord,
        judgeName,
        judgeSicilNo,
        clerkName,
        clerkSicilNo,
        bailiffName,
        bailiffSicilNo,
        selectedExperts: activeSelectedExperts,
        vehiclePlateText,
        attendingPartiesText,
        driverFeeTl: driverFeeText,
        customBodyOverride: isManualTextMode ? manualBodyText : undefined,
      },
    ]);
    showToast(
      `📄 "${fileName}" Word belgesi (Fatsa 2. Sulh Hukuk Mahkemesi – ${formatEsasNoForTemplate(
        activeRecord.esasNo
      )} – Keşif Zaptı) indirildi.`
    );
  };

  // Seçili Tüm Keşifleri Tek Word Belgesinde (Sayfa Numaralı & Her Dosyaya Özel Alt Bilgili) İndir
  const handleDownloadSelectedBatchWord = (separateFiles: boolean = false) => {
    const targetRecords = sortedInspections.filter((r) =>
      selectedRecordIds.includes(r.id)
    );
    const listToExport =
      targetRecords.length > 0
        ? targetRecords
        : activeRecord
        ? [activeRecord]
        : [];

    if (listToExport.length === 0) return;

    const optionsList: MinutesGenerationOptions[] = listToExport.map((rec) => {
      const isCurrentActive = rec.id === activeRecord?.id;
      const recExperts = isCurrentActive
        ? activeSelectedExperts
        : rec.assignedExpertIds && rec.assignedExpertIds.length > 0
        ? registeredExperts.filter((e) => rec.assignedExpertIds!.includes(e.id))
        : activeSelectedExperts;

      const resolvedJudge = isCurrentActive
        ? judgeName
        : rec.judgeName?.trim() || judgeName;
      const resolvedClerk = isCurrentActive
        ? clerkName
        : rec.clerkName?.trim() || clerkName;
      const resolvedBailiff = isCurrentActive
        ? bailiffName
        : rec.bailiffName?.trim() || bailiffName;

      return {
        record: rec,
        judgeName: resolvedJudge,
        judgeSicilNo: isCurrentActive
          ? judgeSicilNo
          : rec.judgeSicilNo?.trim() ||
            STAFF_DEFAULT_SICIL_MAP[resolvedJudge] ||
            judgeSicilNo,
        clerkName: resolvedClerk,
        clerkSicilNo: isCurrentActive
          ? clerkSicilNo
          : rec.clerkSicilNo?.trim() ||
            STAFF_DEFAULT_SICIL_MAP[resolvedClerk] ||
            clerkSicilNo,
        bailiffName: resolvedBailiff,
        bailiffSicilNo: isCurrentActive
          ? bailiffSicilNo
          : rec.bailiffSicilNo?.trim() ||
            STAFF_DEFAULT_SICIL_MAP[resolvedBailiff] ||
            bailiffSicilNo,
        selectedExperts: recExperts,
        vehiclePlateText,
        attendingPartiesText,
        driverFeeTl: driverFeeText,
        customBodyOverride:
          isCurrentActive && isManualTextMode
            ? manualBodyText
            : rec.customMinutesText,
      };
    });

    if (separateFiles) {
      optionsList.forEach((opt, i) => {
        setTimeout(() => {
          downloadWordMinutesDocument([opt]);
        }, i * 250);
      });
      showToast(
        `🗂️ Seçili ${optionsList.length} keşif dosyası ayrı ayrı Word (.doc) belgesi olarak indiriliyor.`
      );
    } else {
      const fileName = downloadWordMinutesDocument(optionsList);
      showToast(
        `📚 Seçili ${optionsList.length} keşif dosyasının zabıtları "${fileName}" olarak tek Word belgesinde indirildi.`
      );
    }
  };

  // ============================================================================
  // 3. BİLİRKİŞİ REHBERİ (EKLEME / DÜZENLEME / SİLME) STATE
  // ============================================================================
  const [editingExpertId, setEditingExpertId] = useState<string | null>(null);
  const [expTitle, setExpTitle] = useState<string>(EXPERT_DIRECTORY_TITLES[0]);
  const [expCustomTitle, setExpCustomTitle] = useState<string>("");
  const [expFullName, setExpFullName] = useState<string>("");
  const [expSicilNo, setExpSicilNo] = useState<string>("");
  const [expDescription, setExpDescription] = useState<string>(() =>
    buildDefaultExpertDescription(EXPERT_DIRECTORY_TITLES[0], "", "")
  );

  const effectiveExpTitle =
    expTitle === "__custom__" ? expCustomTitle.trim() : expTitle;

  const handleResetExpertForm = () => {
    setEditingExpertId(null);
    setExpTitle(EXPERT_DIRECTORY_TITLES[0]);
    setExpCustomTitle("");
    setExpFullName("");
    setExpSicilNo("");
    setExpDescription(
      buildDefaultExpertDescription(EXPERT_DIRECTORY_TITLES[0], "", "")
    );
  };

  const handleRestoreDefaultTemplateExperts = () => {
    const existingIds = new Set(registeredExperts.map((e) => e.id));
    const merged = [...registeredExperts];
    for (const defExp of DEFAULT_REGISTERED_EXPERTS) {
      if (!existingIds.has(defExp.id)) {
        merged.push(defExp);
      }
    }
    onSaveRegisteredExperts(merged);
    setSelectedExpertIds(merged.map((e) => e.id));
    showToast(
      "✓ Şablondaki mahkeme bilirkişileri (Kenan YILDIZ, Serhan TURAN, Barış KIRCA) listeye yüklendi."
    );
  };

  const handleSaveExpert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expFullName.trim() || !effectiveExpTitle) return;

    const finalDesc =
      expDescription.trim() ||
      buildDefaultExpertDescription(
        effectiveExpTitle,
        expFullName.trim(),
        expSicilNo.trim()
      );

    if (editingExpertId) {
      const updated = registeredExperts.map((item) =>
        item.id === editingExpertId
          ? {
              ...item,
              title: effectiveExpTitle,
              fullName: expFullName.trim(),
              sicilNo: expSicilNo.trim(),
              description: finalDesc,
            }
          : item
      );
      onSaveRegisteredExperts(updated);
      showToast(
        `✓ Bilirkişi "${effectiveExpTitle} ${expFullName.trim()}" bilgileri ve zapt açıklaması güncellendi.`
      );
    } else {
      const newExpert: RegisteredExpert = {
        id: `exp-${Date.now()}`,
        title: effectiveExpTitle,
        fullName: expFullName.trim(),
        sicilNo: expSicilNo.trim(),
        description: finalDesc,
        createdAt: new Date().toISOString(),
      };
      const updated = [...registeredExperts, newExpert];
      onSaveRegisteredExperts(updated);
      setSelectedExpertIds((prev) => [...prev, newExpert.id]);
      showToast(
        `✓ "${effectiveExpTitle} ${newExpert.fullName}" mahkeme bilirkişi listesine eklendi.`
      );
    }
    handleResetExpertForm();
  };

  const handleStartEditExpert = (exp: RegisteredExpert) => {
    setEditingExpertId(exp.id);
    if (EXPERT_DIRECTORY_TITLES.includes(exp.title)) {
      setExpTitle(exp.title);
      setExpCustomTitle("");
    } else {
      setExpTitle("__custom__");
      setExpCustomTitle(exp.title);
    }
    setExpFullName(exp.fullName);
    setExpSicilNo(exp.sicilNo || "");
    setExpDescription(exp.description || "");
    setSubTab("bilirkisiler");
  };

  const handleDeleteExpert = (id: string) => {
    const updated = registeredExperts.filter((e) => e.id !== id);
    onSaveRegisteredExperts(updated);
    setSelectedExpertIds((prev) => prev.filter((item) => item !== id));
    if (editingExpertId === id) {
      handleResetExpertForm();
    }
    showToast("Bilirkişi kaydı listeden silindi.");
  };

  const handleToggleSelectRecord = (id: string) => {
    setSelectedRecordIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleToggleExpertSelection = (id: string) => {
    setSelectedExpertIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Canlı Önizleme İçin Yardımcı Hesaplamalar
  const previewEsasDisplay = activeRecord
    ? formatEsasNoForTemplate(activeRecord.esasNo)
    : "2025/1335 Esas";
  const previewSlashDate = activeRecord
    ? formatDateSlashTR(activeRecord.date)
    : "05/11/2026";
  const previewJudgeSicil =
    judgeSicilNo.trim() ||
    STAFF_DEFAULT_SICIL_MAP[judgeName.trim()] ||
    "267550";
  const previewClerkSicil =
    clerkSicilNo.trim() ||
    STAFF_DEFAULT_SICIL_MAP[clerkName.trim()] ||
    "186472";
  const previewBailiffSicil =
    bailiffSicilNo.trim() ||
    STAFF_DEFAULT_SICIL_MAP[bailiffName.trim()] ||
    "231993";

  const previewExpertTitlesSentence = formatExpertTitlesInlinePhrase(
    activeSelectedExperts,
    activeRecord?.experts
  );

  // Alt İmza Tablosu 2. Satırı (Ziraat Bilirkişisi | Fen Bilirkişisi | İnşaat Bilirkişisi)
  const signatureRowExperts = useMemo(() => {
    if (activeSelectedExperts.length === 0) {
      return ["Ziraat Bilirkişisi", "Fen Bilirkişisi", "İnşaat Bilirkişisi"];
    }
    const ziraat = activeSelectedExperts.find((e) =>
      e.title.toLocaleLowerCase("tr-TR").includes("ziraat")
    );
    const fen = activeSelectedExperts.find((e) =>
      e.title.toLocaleLowerCase("tr-TR").includes("fen")
    );
    const insaat = activeSelectedExperts.find((e) =>
      e.title.toLocaleLowerCase("tr-TR").includes("inşaat")
    );
    const ordered: string[] = [];
    if (ziraat) ordered.push(ziraat.title);
    if (fen) ordered.push(fen.title);
    if (insaat) ordered.push(insaat.title);
    for (const exp of activeSelectedExperts) {
      if (!ordered.includes(exp.title)) {
        ordered.push(exp.title);
      }
    }
    while (ordered.length < 3) {
      ordered.push("");
    }
    return ordered.slice(0, 3);
  }, [activeSelectedExperts]);

  return (
    <div className="space-y-4">
      {/* ====================================================================
          KONTROL MERKEZİ STİLİ ÜST BAŞLIK & ALT SEKME GEÇİŞİ (KEŞİF ZAPTI HAZIRLA / BİLİRKİŞİ YÖNETİMİ)
         ==================================================================== */}
      <div className="app-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-md bg-[#246B73]/12 px-2.5 py-0.5 text-[11px] font-bold text-[#246B73]">
              <FileText className="h-3.5 w-3.5" />
              <span>
                T.C. FATSA 2. SULH HUKUK MAHKEMESİ · RESMİ KEŞİF ZAPTI ŞABLONU & WORD SİSTEMİ
              </span>
            </div>
            <h1 className="text-base sm:text-xl font-bold tracking-tight text-slate-900">
              Keşif Zaptı Hazırla & Mahkeme Bilirkişi Rehberi
            </h1>
            <p className="text-xs text-slate-500 max-w-3xl">
              Seçtiğiniz keşiflerin zabıtlarını resmi mahkeme şablonuna birebir uygun olarak görevli Hakim, Katip, Mübaşir ve Bilirkişi kimlik/açıklama metinleriyle otomatik oluşturun; alt bilgisinde{" "}
              <strong className="text-slate-800">
                &ldquo;Fatsa 2. Sulh Hukuk Mahkemesi – #DosyaNo – Keşif Zaptı&rdquo;
              </strong>{" "}
              ve sayfa numarası bulunan düzenli <strong>Word (.doc)</strong> belgesi olarak dışarı aktarın.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSubTab("zapt")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                subTab === "zapt"
                  ? "bg-[#246B73] text-white shadow-xs"
                  : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>1. Keşif Zaptı Hazırla & Word İndir</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab("bilirkisiler")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                subTab === "bilirkisiler"
                  ? "bg-[#1B2733] text-white shadow-xs"
                  : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Users className="h-4 w-4 text-[#63B5B0]" />
              <span>
                2. Bilirkişi Ekle & Bilgilerini Yönet ({registeredExperts.length} Kayıtlı)
              </span>
            </button>
          </div>
        </div>
      </div>

      {feedbackBanner && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[#246B73]/30 bg-[#246B73]/10 px-4 py-3 text-xs font-bold text-slate-900 shadow-xs">
          <span>{feedbackBanner}</span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-[#246B73] hover:text-slate-950"
          >
            ✕
          </button>
        </div>
      )}

      {/* ====================================================================
          SEKME 2: BİLİRKİŞİ EKLEME VE YÖNETİM EKRANI
         ==================================================================== */}
      {subTab === "bilirkisiler" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
          {/* Sol 5 Sütun: Bilirkişi Ekle / Düzenle Formu */}
          <div className="lg:col-span-5 app-card p-5 space-y-4">
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#246B73]" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  {editingExpertId
                    ? "Bilirkişi Bilgilerini & Zapt Açıklamasını Düzenle"
                    : "Yeni Mahkeme Bilirkişisi Ekle"}
                </h2>
              </div>
              {editingExpertId && (
                <button
                  type="button"
                  onClick={handleResetExpertForm}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Yeni Ekleme Moduna Dön
                </button>
              )}
            </div>

            <form onSubmit={handleSaveExpert} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  1. Bilirkişi Unvanı Seçiniz *
                </label>
                <select
                  value={expTitle}
                  onChange={(e) => {
                    const nextTitle = e.target.value;
                    setExpTitle(nextTitle);
                    if (nextTitle !== "__custom__") {
                      setExpDescription(
                        buildDefaultExpertDescription(
                          nextTitle,
                          expFullName,
                          expSicilNo
                        )
                      );
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 focus:border-purple-600 focus:outline-none"
                >
                  {EXPERT_DIRECTORY_TITLES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value="__custom__">
                    + Diğer / Özel Bilirkişi Unvanı Yaz...
                  </option>
                </select>

                {expTitle === "__custom__" && (
                  <input
                    type="text"
                    required
                    value={expCustomTitle}
                    onChange={(e) => setExpCustomTitle(e.target.value)}
                    placeholder="Örn: Jeoloji Mühendisi Bilirkişisi..."
                    className="mt-2 w-full rounded-lg border border-purple-300 bg-purple-50/40 px-3 py-2 text-xs font-semibold text-slate-900 focus:border-purple-600 focus:bg-white focus:outline-none"
                  />
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    2. Bilirkişi Adı ve Soyadı *
                  </label>
                  <input
                    type="text"
                    required
                    value={expFullName}
                    onChange={(e) => setExpFullName(e.target.value)}
                    placeholder="Örn: Kenan YILDIZ"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 focus:border-purple-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    3. Sicil Numarası / T.C. No *
                  </label>
                  <input
                    type="text"
                    value={expSicilNo}
                    onChange={(e) => setExpSicilNo(e.target.value)}
                    placeholder="Örn: 16294 veya T.C. No"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm font-mono font-bold text-slate-900 focus:border-purple-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                  <label className="block text-xs font-bold text-slate-800">
                    4. Keşif Zaptına Otomatik Eklenecek Açıklama Metni *
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setExpDescription(
                        buildDefaultExpertDescription(
                          effectiveExpTitle || "Bilirkişi",
                          expFullName,
                          expSicilNo
                        )
                      )
                    }
                    className="inline-flex items-center gap-1 rounded border border-purple-300 bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-900 hover:bg-purple-100"
                  >
                    <Sparkles className="h-3 w-3 text-purple-600" />
                    <span>Bilgilere Göre Şablon Metin Oluştur</span>
                  </button>
                </div>
                <textarea
                  rows={6}
                  required
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                  placeholder="Örn: Fen Bilirkişisi Kenan YILDIZ: 16294 Sicil Numaralı, 56698381242 T.C. Kimlik numaralı... Tarafları tanımaz, engel hali yok, yemini yaptırıldı. Yapacağı iş anlatıldı."
                  className="w-full rounded-lg border border-slate-300 p-3 text-xs leading-relaxed text-slate-900 focus:border-purple-600 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Keşif zaptı hazırlarken bu bilirkişiyi seçtiğinizde, yukarıdaki kutuda yazan kimlik ve açıklama metni doğrudan Word keşif zaptındaki{" "}
                  <strong>&ldquo;Bilirkişilerin kimliklerinin tespitine geçildi.&rdquo;</strong> bölümünün altına aktarılır.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                {editingExpertId && (
                  <button
                    type="button"
                    onClick={handleResetExpertForm}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    İptal
                  </button>
                )}
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-700"
                >
                  <Save className="h-4 w-4" />
                  <span>
                    {editingExpertId
                      ? "Bilirkişi Bilgilerini Güncelle"
                      : "Bilirkişiyi Listeye Kaydet"}
                  </span>
                </button>
              </div>
            </form>
          </div>

          {/* Sağ 7 Sütun: Kayıtlı Bilirkişiler Listesi */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  Mahkemede Görev Alan Kayıtlı Bilirkişiler ({registeredExperts.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Eklediğiniz bilirkişileri keşif zaptı hazırlarken tek tıkla seçebilirsiniz.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleRestoreDefaultTemplateExperts}
                  className="inline-flex items-center gap-1 rounded-lg border border-purple-300 bg-purple-50 px-2.5 py-1.5 text-xs font-bold text-purple-900 hover:bg-purple-100"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-purple-600" />
                  <span>Şablon Bilirkişilerini Yükle</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab("zapt")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Keşif Zaptı Hazırlama Ekranına Geç &rarr;</span>
                </button>
              </div>
            </div>

            {registeredExperts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center space-y-3">
                <Users className="mx-auto h-8 w-8 text-purple-400" />
                <div className="text-sm font-bold text-slate-800">
                  Henüz kayıtlı bilirkişi eklenmedi
                </div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Sol taraftaki formdan yeni bilirkişi ekleyebilir veya örnek keşif zaptındaki varsayılan bilirkişileri (Kenan YILDIZ, Serhan TURAN, Barış KIRCA) tek tıkla yükleyebilirsiniz.
                </p>
                <button
                  type="button"
                  onClick={handleRestoreDefaultTemplateExperts}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Örnek Şablondaki 3 Bilirkişiyi Otomatik Yükle</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {registeredExperts.map((exp) => {
                  const isSelectedForActive = selectedExpertIds.includes(exp.id);
                  return (
                    <div
                      key={exp.id}
                      className={`rounded-xl border p-3.5 transition-all space-y-2 ${
                        editingExpertId === exp.id
                          ? "border-purple-600 bg-purple-50/40 ring-2 ring-purple-500/20"
                          : "border-slate-200 bg-slate-50/60 hover:border-purple-300"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-purple-700 px-2 py-0.5 text-[11px] font-bold text-white">
                            {exp.title}
                          </span>
                          <span className="text-sm font-bold text-slate-900">
                            {exp.fullName}
                          </span>
                          {exp.sicilNo && (
                            <span className="rounded bg-slate-200 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800">
                              Sicil / T.C.: {exp.sicilNo}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleExpertSelection(exp.id)}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                              isSelectedForActive
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : "border-purple-300 bg-white text-purple-900 hover:bg-purple-50"
                            }`}
                          >
                            <Check className="h-3 w-3" />
                            <span>
                              {isSelectedForActive
                                ? "Zaptta Seçili"
                                : "Zapta Seç"}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEditExpert(exp)}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100"
                          >
                            <Pencil className="h-3 w-3" />
                            <span>Düzenle</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteExpert(exp.id)}
                            className="rounded-lg border border-slate-200 bg-white p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Bilirkişiyi Sil"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-700 leading-relaxed">
                        <span className="font-bold text-purple-900">
                          Zapta Eklenecek Açıklama:{" "}
                        </span>
                        {exp.description}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          SEKME 1: KEŞİF ZAPTI HAZIRLA & WORD (.DOC) OLARAK DIŞARI AKTAR
         ==================================================================== */}
      {subTab === "zapt" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
          {/* SOL 5 SÜTUN: 1) Keşif Seçimi, 2) Personel Seçimi, 3) Bilirkişi Seçimi, 4) Araç/Yoklama Detayı */}
          <div className="lg:col-span-5 space-y-4">
            {/* KUTU 1: Keşif Dosyası Seçimi */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div className="flex items-center gap-1.5">
                  <CalendarIcon className="h-4 w-4 text-purple-600" />
                  <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                    1. Zaptı Hazırlanacak Keşifleri Seçin ({selectedRecordIds.length} Seçili)
                  </h2>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedRecordIds(filteredList.map((r) => r.id))
                    }
                    className="rounded border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-900 hover:bg-purple-100"
                  >
                    Tümünü Seç
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRecordIds([])}
                    className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Temizle
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  value={dateFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDateFilter(val);
                    if (val !== "ALL") {
                      const dayRecs = sortedInspections.filter(
                        (r) => r.date === val
                      );
                      setSelectedRecordIds(dayRecs.map((r) => r.id));
                      if (dayRecs[0]) setActiveRecordId(dayRecs[0].id);
                    }
                  }}
                  className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:border-purple-600 focus:outline-none"
                >
                  <option value="ALL">
                    Tüm Keşif Günleri ({sortedInspections.length} Dosya)
                  </option>
                  {uniqueDates.map((d) => {
                    const cnt = sortedInspections.filter(
                      (r) => r.date === d
                    ).length;
                    return (
                      <option key={d} value={d}>
                        {formatDateTR(d)} Günü ({cnt} Dosya)
                      </option>
                    );
                  })}
                </select>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Esas No veya Mahalle ara..."
                    className="w-full rounded-lg border border-slate-300 pl-8 pr-2.5 py-1.5 text-xs text-slate-900 focus:border-purple-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
                {filteredList.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    Kayıtlı keşif dosyası bulunamadı.
                  </div>
                ) : (
                  filteredList.map((rec) => {
                    const isChecked = selectedRecordIds.includes(rec.id);
                    const isActive = activeRecord?.id === rec.id;
                    const adaParsel = formatAdaParselLabel(rec);
                    return (
                      <div
                        key={rec.id}
                        onClick={() => {
                          setActiveRecordId(rec.id);
                          if (!selectedRecordIds.includes(rec.id)) {
                            setSelectedRecordIds((prev) => [...prev, rec.id]);
                          }
                        }}
                        className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs transition-colors ${
                          isActive
                            ? "bg-purple-50/90 font-semibold text-purple-950"
                            : "bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleSelectRecord(rec.id);
                            }}
                            className="mt-0.5 text-purple-600"
                          >
                            {isChecked ? (
                              <CheckSquare className="h-4 w-4" />
                            ) : (
                              <Square className="h-4 w-4 text-slate-400" />
                            )}
                          </button>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono font-bold text-purple-900">
                                {rec.esasNo}
                              </span>
                              <span className="text-[11px] font-mono text-slate-600">
                                ({formatDateSlashTR(rec.date)} · {rec.time})
                              </span>
                            </div>
                            <div className="truncate text-[11px] text-slate-700">
                              [{rec.district}] {rec.neighborhood}
                              {adaParsel ? ` · ${adaParsel}` : ""}
                            </div>
                          </div>
                        </div>

                        {isActive && (
                          <span className="rounded bg-purple-600 px-2 py-0.5 text-[10px] font-bold text-white shrink-0">
                            Önizlemede
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* KUTU 2: Görev Alan Mahkeme Personeli (Hakim, Katip, Mübaşir) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div className="flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4 text-purple-600" />
                  <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                    2. Keşifte Görev Alan Personeller (Hakim, Katip, Mübaşir)
                  </h2>
                </div>
              </div>

              {/* Hakim */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    ⚖️ Görevli Hakim
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {COURT_JUDGE_PRESETS.map((j) => (
                      <button
                        key={j}
                        type="button"
                        onClick={() => {
                          setJudgeName(j);
                          if (STAFF_DEFAULT_SICIL_MAP[j]) {
                            setJudgeSicilNo(STAFF_DEFAULT_SICIL_MAP[j]);
                          }
                        }}
                        className={`rounded border px-2 py-0.5 text-[11px] font-bold ${
                          judgeName.trim() === j
                            ? "border-purple-600 bg-purple-600 text-white"
                            : "border-slate-300 bg-white text-slate-700 hover:border-purple-400"
                        }`}
                      >
                        {judgeName.trim() === j ? "✓ " : ""}
                        {j}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={judgeName}
                    onChange={(e) => setJudgeName(e.target.value)}
                    placeholder="Hakim Adı Soyadı..."
                    className="col-span-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-purple-600 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={judgeSicilNo}
                    onChange={(e) => setJudgeSicilNo(e.target.value)}
                    placeholder="Sicil No (267550)"
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-purple-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Zabıt Katibi */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    ⌨️ Görevli Zabıt Katibi
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {COURT_CLERK_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setClerkName(c);
                          setClerkSicilNo(STAFF_DEFAULT_SICIL_MAP[c] || "");
                        }}
                        className={`rounded border px-2 py-0.5 text-[11px] font-bold ${
                          clerkName.trim() === c
                            ? "border-purple-600 bg-purple-600 text-white"
                            : "border-slate-300 bg-white text-slate-700 hover:border-purple-400"
                        }`}
                      >
                        {clerkName.trim() === c ? "✓ " : ""}
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={clerkName}
                    onChange={(e) => setClerkName(e.target.value)}
                    placeholder="Katip Adı Soyadı..."
                    className="col-span-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-purple-600 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={clerkSicilNo}
                    onChange={(e) => setClerkSicilNo(e.target.value)}
                    placeholder="Sicil No (186472)"
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-purple-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Mübaşir */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    📣 Görevli Mübaşir
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {COURT_BAILIFF_PRESETS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => {
                          setBailiffName(b);
                          if (STAFF_DEFAULT_SICIL_MAP[b]) {
                            setBailiffSicilNo(STAFF_DEFAULT_SICIL_MAP[b]);
                          }
                        }}
                        className={`rounded border px-2 py-0.5 text-[11px] font-bold ${
                          bailiffName.trim() === b
                            ? "border-purple-600 bg-purple-600 text-white"
                            : "border-slate-300 bg-white text-slate-700 hover:border-purple-400"
                        }`}
                      >
                        {bailiffName.trim() === b ? "✓ " : ""}
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={bailiffName}
                    onChange={(e) => setBailiffName(e.target.value)}
                    placeholder="Mübaşir Adı Soyadı..."
                    className="col-span-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-purple-600 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={bailiffSicilNo}
                    onChange={(e) => setBailiffSicilNo(e.target.value)}
                    placeholder="Sicil No (231993)"
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-purple-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* KUTU 3: Keşifte Görev Alan Bilirkişiler Seçimi */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-purple-600" />
                  <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                    3. Keşifte Görev Alan Bilirkişileri Seçin ({selectedExpertIds.length} Seçili)
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSubTab("bilirkisiler")}
                  className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-purple-700"
                >
                  <Plus className="h-3 w-3" />
                  <span>+ Bilirkişi Ekle / Düzenle</span>
                </button>
              </div>

              {registeredExperts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-purple-300 bg-purple-50/50 p-4 text-center space-y-2">
                  <p className="text-xs text-purple-950 font-medium">
                    Henüz kayıtlı bilirkişi bulunmuyor. Resmi şablondaki 3 bilirkişiyi (Kenan YILDIZ, Serhan TURAN, Barış KIRCA) yüklemek veya yeni eklemek için tıklayın:
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleRestoreDefaultTemplateExperts}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-purple-700"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Şablondaki 3 Bilirkişiyi Yükle</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubTab("bilirkisiler")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300 bg-white px-3.5 py-2 text-xs font-bold text-purple-900 hover:bg-purple-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Bilirkişi Menüsünü Aç</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {registeredExperts.map((exp) => {
                    const isChecked = selectedExpertIds.includes(exp.id);
                    return (
                      <label
                        key={exp.id}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 text-xs transition-all select-none ${
                          isChecked
                            ? "border-purple-600 bg-purple-50/80 text-purple-950 shadow-2xs"
                            : "border-slate-200 bg-white text-slate-700 hover:border-purple-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleExpertSelection(exp.id)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-purple-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {exp.title}
                            </span>
                            <span className="font-bold text-slate-900">
                              {exp.fullName}
                            </span>
                            {exp.sicilNo && (
                              <span className="font-mono text-[10px] text-slate-600">
                                (Sicil/TC: {exp.sicilNo})
                              </span>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] text-slate-600">
                            {exp.description}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleSaveStaffAndExpertsToRecord(false)}
                  className="flex-1 rounded-lg border border-purple-300 bg-purple-50 px-3 py-2 text-xs font-bold text-purple-950 hover:bg-purple-100"
                >
                  ✓ Aktif Dosyaya Kaydet
                </button>
                {selectedRecordIds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleSaveStaffAndExpertsToRecord(true)}
                    className="flex-1 rounded-lg bg-purple-700 px-3 py-2 text-xs font-bold text-white hover:bg-purple-800"
                  >
                    ✓ Seçili {selectedRecordIds.length} Dosyaya Uygula
                  </button>
                )}
              </div>
            </div>

            {/* KUTU 4: Keşif Aracı Plakası ve Yoklama Metni (Şablondaki Kırmızı Alanlar) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
              <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2">
                <Car className="h-4 w-4 text-purple-600" />
                <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                  4. Keşif Aracı, Yoklama & Şoför Ücreti Bilgileri
                </h2>
              </div>

              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Keşif Aracı / Vasıta İbaresi:
                  </label>
                  <input
                    type="text"
                    value={vehiclePlateText}
                    onChange={(e) => setVehiclePlateText(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-purple-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-red-800 mb-1">
                    Yoklama & Hazır Bulunan Taraf Metni (Şablonda Kırmızı Alan):
                  </label>
                  <textarea
                    rows={2}
                    value={attendingPartiesText}
                    onChange={(e) => setAttendingPartiesText(e.target.value)}
                    className="w-full rounded-lg border border-red-200 bg-red-50/30 px-2.5 py-1.5 text-xs text-red-950 focus:border-purple-600 focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    G.D. 4. Madde Şoför Ücreti:
                  </label>
                  <input
                    type="text"
                    value={driverFeeText}
                    onChange={(e) => setDriverFeeText(e.target.value)}
                    className="w-40 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-purple-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SAĞ 7 SÜTUN: CANLI A4 KEŞİF ZAPTI ÖNİZLEMESİ VE WORD (.DOC) İNDİRME */}
          <div className="lg:col-span-7 space-y-4">
            {/* Word İndirme Araç Çubuğu */}
            <div className="rounded-2xl border border-purple-200 bg-white p-4 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Word (.doc) Keşif Zaptı Çıktısı & Resmi Şablon Önizlemesi
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Alt bilgi:{" "}
                    <code className="rounded bg-purple-50 px-1.5 py-0.5 font-mono text-purple-900 font-semibold">
                      Fatsa 2. Sulh Hukuk Mahkemesi – {previewEsasDisplay} – Keşif Zaptı
                    </code>{" "}
                    · Sayfa Numaralı
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadActiveWord}
                    disabled={!activeRecord}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    <span>
                      Aktif Zaptı Word (.doc) İndir ({activeRecord?.esasNo || ""})
                    </span>
                  </button>

                  {selectedRecordIds.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDownloadSelectedBatchWord(false)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"
                      >
                        <BookOpen className="h-4 w-4" />
                        <span>
                          Seçili {selectedRecordIds.length} Dosyayı Tek Word İndir
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadSelectedBatchWord(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-purple-300 bg-purple-50 px-3 py-2 text-xs font-bold text-purple-950 hover:bg-purple-100"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Ayrı Ayrı İndir</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Otomatik Şablon / Manuel Düzenleme Geçişi */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isManualTextMode) {
                        setManualBodyText(autoGeneratedBodyText);
                        setIsManualTextMode(true);
                      } else {
                        setIsManualTextMode(false);
                      }
                    }}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                      isManualTextMode
                        ? "border-amber-500 bg-amber-50 text-amber-950"
                        : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <Pencil className="h-3 w-3" />
                    <span>
                      {isManualTextMode
                        ? "Metin Elle Düzenleme Modunda (Resmi Şablon Görünümüne Dön)"
                        : "Zapt Metnini Elle Serbest Düzenle"}
                    </span>
                  </button>
                  {isManualTextMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsManualTextMode(false);
                        setManualBodyText("");
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-red-600"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Otomatik Şablona Sıfırla</span>
                    </button>
                  )}
                </div>
                <span className="text-[11px] text-slate-500">
                  Gönderdiğiniz 2025/1335 Esas sayılı resmi şablona birebir uygundur.
                </span>
              </div>
            </div>

            {/* A4 SAYFA ÖNİZLEMESİ (2025-1335.pdf ŞABLONUNA BİREBİR UYGUN) */}
            {!activeRecord ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-2">
                <FileText className="mx-auto h-8 w-8 text-slate-400" />
                <div className="text-sm font-bold text-slate-800">
                  Önizlenecek keşif dosyası seçilmedi
                </div>
                <p className="text-xs text-slate-500">
                  Sol taraftaki listeden bir keşif dosyasına tıklayarak keşif zaptını hazırlayabilirsiniz.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-300 bg-white p-6 sm:p-10 shadow-md font-serif text-slate-950 space-y-3 text-xs sm:text-[13.5px] leading-relaxed">
                {/* 1. ÜST ORTALI BAŞLIK (T.C. / FATSA / 2.SULH HUKUK MAHKEMESİ) */}
                <div className="text-center font-bold leading-snug mb-3">
                  <div>T.C.</div>
                  <div>FATSA</div>
                  <div>2.SULH HUKUK MAHKEMESİ</div>
                </div>

                {/* 2. SAYI / "KEŞİF ZAPTI" / HAKİM / KATİP / Keş.Tar. */}
                <div className="space-y-0.5 text-xs sm:text-[13.5px]">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="inline-block w-20 font-bold">SAYI</span>
                      <span className="font-bold">: {previewEsasDisplay}</span>
                    </div>
                    <div className="font-bold italic pr-4 sm:pr-12">
                      &ldquo;KEŞİF ZAPTI&rdquo;
                    </div>
                  </div>
                  <div>
                    <span className="inline-block w-20 font-bold">HAKİM</span>
                    <span className="font-bold">
                      : {(judgeName || "Kadir SAĞLAM").toLocaleUpperCase("tr-TR")}{" "}
                      {previewJudgeSicil}
                    </span>
                  </div>
                  <div>
                    <span className="inline-block w-20 font-bold">KATİP</span>
                    <span className="font-bold">
                      : {(clerkName || "Mehmet AKIN").toLocaleUpperCase("tr-TR")}{" "}
                      {previewClerkSicil}
                    </span>
                  </div>
                  <div>
                    <span className="inline-block w-20 font-bold">Keş.Tar.</span>
                    <span className="font-bold">: {previewSlashDate}</span>
                  </div>
                </div>

                {/* 3. GÖVDE METNİ (OTOMATİK RESMİ ŞABLON VEYA MANUEL DÜZENLEME) */}
                {isManualTextMode ? (
                  <div className="space-y-1.5 font-sans pt-2">
                    <label className="block text-xs font-bold text-amber-900">
                      Keşif Zaptı Gövde Metni (Serbest Düzenleme Modu):
                    </label>
                    <textarea
                      rows={18}
                      value={manualBodyText}
                      onChange={(e) => setManualBodyText(e.target.value)}
                      className="w-full rounded-xl border border-amber-400 bg-amber-50/30 p-3 font-serif text-xs sm:text-sm leading-relaxed text-slate-950 focus:border-purple-600 focus:bg-white focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="space-y-2 pt-2 text-justify">
                    <p className="indent-8">
                      Belirli gün ve saatte mahkememiz hakimi{" "}
                      {judgeName || "Kadir SAĞLAM"} ({previewJudgeSicil}), zabıt
                      katibi {clerkName || "Mehmet AKIN"}
                      {previewClerkSicil ? ` (${previewClerkSicil})` : ""},
                      mübaşir {bailiffName || "Ebru YILMAZ"} (
                      {previewBailiffSicil}) ve yanımızda{" "}
                      {previewExpertTitlesSentence} olduğu halde mahkememiz
                      önünden {vehiclePlateText} hareket edilerek keşif mahaline
                      gelindi.
                    </p>
                    <p className="indent-8">Açık keşfe başlandı.</p>
                    <p className="indent-8 font-medium text-red-800">
                      {attendingPartiesText}
                    </p>
                    <p className="indent-8">
                      Bilirkişilerin kimliklerinin tespitine geçildi.
                    </p>

                    {/* Seçili Bilirkişi Kimlik ve Açıklama Metinleri */}
                    {orderedActiveExperts.length > 0 ? (
                      orderedActiveExperts.map((exp) => (
                        <p key={exp.id} className="indent-8">
                          {exp.description?.trim() ||
                            buildDefaultExpertDescription(
                              exp.title,
                              exp.fullName,
                              exp.sicilNo
                            )}
                        </p>
                      ))
                    ) : (
                      <p className="indent-8 text-slate-500 italic">
                        (Sol taraftan keşfe katılan bilirkişileri seçtiğinizde kimlik ve yemin açıklamaları buraya otomatik eklenir.)
                      </p>
                    )}

                    <p className="indent-8">
                      Dava konusu olan taşınmazlar bilirkişiler eşliğinde ayrı
                      ayrı gezildi. Sınırları ve yüzölçümü, üzerinde bulunan
                      muhdesatların nelerden ibaret olduğu hususları gezilerek
                      incelendi, fotoğrafları çekildi. Fen bilirkişisine sınırları
                      gösterildi, diğer bilirkişilere ise taşınmazların niteliği,
                      değeri, zirai ve inşai muhtesatların özellikleri ve değeri
                      ile dosyadaki mevcut tüm delillere göre ayrı ayrı ayrıntılı
                      rapor tanzim etmeleri hususu anlatıldı. Soruldu: Konuyu
                      anladık, incelememizi yaptık, ayrı ayrı rapor tanzim edip
                      vereceğiz dediler. Beyanları okundu. İmzaları alındı.
                    </p>

                    {/* Ara Bilirkişi İmza Satırı */}
                    <div className="py-5 text-center font-medium">
                      {(orderedActiveExperts.length > 0
                        ? orderedActiveExperts.map((e) => e.title)
                        : [
                            "Fen Bilirkişisi",
                            "Ziraat Bilirkişisi",
                            "İnşaat Bilirkişisi",
                          ]
                      ).map((t, i) => (
                        <span key={i} className="mx-3 sm:mx-6 inline-block">
                          {t}
                        </span>
                      ))}
                    </div>

                    {/* Keşif Heyeti Gözleminde; Taşınmaz / Parsel Listesi (Kırmızı Vurgulu) */}
                    {activeObservationGroups.map((grp, gIdx) => (
                      <div key={gIdx} className="space-y-0.5">
                        <p className="indent-8 font-semibold text-red-800">
                          {grp.headerLine}
                        </p>
                        {grp.parcelLines.map((line, lIdx) => (
                          <p
                            key={lIdx}
                            className="indent-8 font-semibold text-red-800"
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    ))}

                    <p className="indent-8 pt-2">
                      Davacı vekilinden soruldu: Keşif yapılan yerler dava konusu
                      yerlerdir. Dava dilekçemizi tekrar ederiz, dedi.
                    </p>
                    <p className="indent-8">
                      Davalı vekilinden soruldu: Keşif yapılan yerler dava konusu
                      yerlerdir. Cevap dilekçemizi tekrar ederiz, dedi.
                    </p>
                    <p className="indent-8">
                      Keşif mahallinde yapılacak başka işlem kalmadığından açık
                      keşfe son verildi.
                    </p>

                    {/* G.D. Hükümleri */}
                    <p className="indent-8 font-bold pt-1">G.D.</p>
                    <p className="indent-8">
                      1-Fen Bilirkişisine 15 gün içerisinde, Ziraat Bilirkişisine
                      25 gün içerisinde, İnşaat Bilirkişisine 35 gün içerisinde
                      raporlarını sunmak üzere süre verilmesine,
                    </p>
                    <p className="indent-8">
                      2-Keşfe katılan fen bilirkişisine emek ve mesaisi karşılığı
                      takdiren 3.500,00 TL, ziraat bilirkişisine 4.000,00 TL,
                      inşaat bilirkişisine 4.000,00 TL ücret takdirine, raporlarını
                      ibraz ettiklerinde sarf kararları yazılıp birleştirilerek
                      bilirkişilere ödenmesine, (Bilirkişi sarf kararlarının UYAP
                      üzerinden elektronik imza ile imzalanmasına, bu nedenle fiziki
                      sarf kararı hazırlanmasına yer olmadığına),
                    </p>
                    <p className="indent-8">
                      3-Bilirkişi raporları dosyaya ibraz edildiğinde taraflara
                      tebliğine,
                    </p>
                    <p className="indent-8">
                      4-Keşif aracını kullanan şoföre emek ve mesaisine karşılık
                      olmak üzere {driverFeeText} ücret takdirine, suçüstü
                      ödeneğinden karşılanmak üzere, karar kesinleştiğinde davalı
                      taraftan tahsil edilmek üzere, şimdilik koşulsuz olarak
                      ödenmesine,
                    </p>
                    <p className="indent-8">
                      Dair, hazır olanların yüzüne karşı verilen ara karar açıkça
                      okunup usulen anlatıldı. {previewSlashDate}
                    </p>
                  </div>
                )}

                {/* 4. ALT 3x3 KENARLIKLI İMZA TABLOSU (ŞABLONDAKİ GİBİ) */}
                <div className="pt-4">
                  <table className="w-full border-collapse border border-slate-900 text-xs sm:text-[13px]">
                    <tbody>
                      <tr>
                        <td className="border border-slate-900 p-2 align-top h-16 w-1/3">
                          Hakim {previewJudgeSicil}
                        </td>
                        <td className="border border-slate-900 p-2 align-top h-16 w-1/3">
                          Zabıt Katibi {previewClerkSicil}
                        </td>
                        <td className="border border-slate-900 p-2 align-top h-16 w-1/3">
                          Mübaşir {previewBailiffSicil}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-900 p-2 align-top h-16 font-medium text-red-800">
                          {signatureRowExperts[0] || ""}
                        </td>
                        <td className="border border-slate-900 p-2 align-top h-16 font-medium text-red-800">
                          {signatureRowExperts[1] || ""}
                        </td>
                        <td className="border border-slate-900 p-2 align-top h-16 font-medium text-red-800">
                          {signatureRowExperts[2] || ""}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-900 p-2 align-top h-16">
                          Davacı Vekili
                        </td>
                        <td className="border border-slate-900 p-2 align-top h-16">
                          Davalı Vekili
                        </td>
                        <td className="border border-slate-900 p-2 align-top h-16">
                          &nbsp;
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 5. SAYFA ALT BİLGİ (FOOTER) ÖNİZLEMESİ */}
                <div className="mt-8 border-t-2 border-slate-800 pt-2 flex items-center justify-between text-[11px] font-sans text-slate-700">
                  <span>
                    Fatsa 2. Sulh Hukuk Mahkemesi – {previewEsasDisplay} – Keşif
                    Zaptı
                  </span>
                  <span className="inline-flex h-5 w-6 items-center justify-center bg-slate-900 text-[11px] font-bold text-white">
                    1
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
