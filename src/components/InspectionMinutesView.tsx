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
} from "lucide-react";
import { InspectionRecord, RegisteredExpert } from "../types";
import {
  COURT_BAILIFF_PRESETS,
  COURT_CLERK_PRESETS,
  COURT_JUDGE_PRESETS,
  getCaseTypeVisualMeta,
} from "../data/fatsaData";
import {
  formatAdaParselLabel,
  formatAddressLabel,
  formatAreaM2,
  formatDateTR,
  formatVehicleLabel,
} from "../services/geoService";
import {
  buildDefaultExpertDescription,
  downloadWordMinutesDocument,
  EXPERT_DIRECTORY_TITLES,
  generateAutomaticMinutesText,
  MinutesGenerationOptions,
} from "../services/wordMinutesService";

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
  // 2. AKTİF KEŞİF İÇİN PERSONEL (HAKİM, KATİP, MÜBAŞİR) VE BİLİRKİŞİ SEÇİMİ
  // ============================================================================
  const [judgeName, setJudgeName] = useState<string>(
    COURT_JUDGE_PRESETS[0] || "Kadir SAĞLAM"
  );
  const [judgeSicilNo, setJudgeSicilNo] = useState<string>("");
  const [clerkName, setClerkName] = useState<string>(
    COURT_CLERK_PRESETS[0] || "Mehmet AKIN"
  );
  const [clerkSicilNo, setClerkSicilNo] = useState<string>("");
  const [bailiffName, setBailiffName] = useState<string>(
    COURT_BAILIFF_PRESETS[0] || "Ebru YILMAZ"
  );
  const [bailiffSicilNo, setBailiffSicilNo] = useState<string>("");
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
    setJudgeName(
      activeRecord.judgeName?.trim() || COURT_JUDGE_PRESETS[0] || "Kadir SAĞLAM"
    );
    setJudgeSicilNo(activeRecord.judgeSicilNo || "");
    setClerkName(
      activeRecord.clerkName?.trim() || COURT_CLERK_PRESETS[0] || "Mehmet AKIN"
    );
    setClerkSicilNo(activeRecord.clerkSicilNo || "");
    setBailiffName(
      activeRecord.bailiffName?.trim() ||
        COURT_BAILIFF_PRESETS[0] ||
        "Ebru YILMAZ"
    );
    setBailiffSicilNo(activeRecord.bailiffSicilNo || "");

    if (
      activeRecord.assignedExpertIds &&
      activeRecord.assignedExpertIds.length > 0
    ) {
      setSelectedExpertIds(activeRecord.assignedExpertIds);
    } else if (activeRecord.experts && registeredExperts.length > 0) {
      // Dosyadaki bilirkişi unvanlarına/isimlerine göre eşleşen kayıtlı bilirkişileri otomatik öner
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
      setSelectedExpertIds(matched);
    } else {
      setSelectedExpertIds([]);
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
  ]);

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
        customBodyOverride: isManualTextMode ? manualBodyText : undefined,
      },
    ]);
    showToast(
      `📄 "${fileName}" Word belgesi (Alt bilgili: Fatsa 2. Sulh Hukuk Mahkemesi ${activeRecord.esasNo} Keşif Zaptı) indirildi.`
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

      return {
        record: rec,
        judgeName: isCurrentActive
          ? judgeName
          : rec.judgeName?.trim() || judgeName,
        judgeSicilNo: isCurrentActive
          ? judgeSicilNo
          : rec.judgeSicilNo?.trim() || judgeSicilNo,
        clerkName: isCurrentActive
          ? clerkName
          : rec.clerkName?.trim() || clerkName,
        clerkSicilNo: isCurrentActive
          ? clerkSicilNo
          : rec.clerkSicilNo?.trim() || clerkSicilNo,
        bailiffName: isCurrentActive
          ? bailiffName
          : rec.bailiffName?.trim() || bailiffName,
        bailiffSicilNo: isCurrentActive
          ? bailiffSicilNo
          : rec.bailiffSicilNo?.trim() || bailiffSicilNo,
        selectedExperts: recExperts,
        customBodyOverride: isCurrentActive && isManualTextMode
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

  return (
    <div className="space-y-4">
      {/* ====================================================================
          MOR ÜST BAŞLIK ŞERİDİ & ALT SEKME GEÇİŞİ (KEŞİF ZAPTI HAZIRLA / BİLİRKİŞİ YÖNETİMİ)
         ==================================================================== */}
      <div className="rounded-2xl border border-purple-300 bg-gradient-to-r from-purple-950 via-purple-900 to-indigo-950 p-4 sm:p-5 text-white shadow-lg">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-md bg-purple-500/25 border border-purple-400/40 px-2.5 py-0.5 text-[11px] font-bold text-purple-200">
              <FileText className="h-3.5 w-3.5 text-purple-300" />
              <span>T.C. FATSA 2. SULH HUKUK MAHKEMESİ · OTOMATİK KEŞİF ZAPTI & WORD SİSTEMİ</span>
            </div>
            <h1 className="text-base sm:text-xl font-bold tracking-tight text-white">
              Keşif Zaptı Hazırla & Mahkeme Bilirkişi Rehberi
            </h1>
            <p className="text-xs text-purple-200/90 max-w-3xl">
              Seçtiğiniz keşiflerin zabıtlarını görevli Hakim, Katip, Mübaşir ve Bilirkişi açıklamalarıyla otomatik oluşturun; alt bilgisinde{" "}
              <strong className="text-white">
                &ldquo;Fatsa 2. Sulh Hukuk Mahkemesi #DosyaNo Keşif Zaptı&rdquo;
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
                  ? "bg-white text-purple-950 shadow-md"
                  : "border border-purple-400/40 bg-purple-900/60 text-purple-100 hover:bg-purple-800"
              }`}
            >
              <FileText className="h-4 w-4 text-purple-600" />
              <span>1. Keşif Zaptı Hazırla & Word İndir</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab("bilirkisiler")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                subTab === "bilirkisiler"
                  ? "bg-white text-purple-950 shadow-md"
                  : "border border-purple-400/40 bg-purple-900/60 text-purple-100 hover:bg-purple-800"
              }`}
            >
              <Users className="h-4 w-4 text-purple-600" />
              <span>
                2. Bilirkişi Ekle & Bilgilerini Yönet ({registeredExperts.length} Kayıtlı)
              </span>
            </button>
          </div>
        </div>
      </div>

      {feedbackBanner && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-purple-300 bg-purple-50 px-4 py-3 text-xs font-bold text-purple-950 shadow-xs">
          <span>{feedbackBanner}</span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-purple-700 hover:text-purple-950"
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
          <div className="lg:col-span-5 rounded-2xl border border-purple-200 bg-white p-5 shadow-xs space-y-4">
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-purple-600" />
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
                    placeholder="Örn: Ahmet YILMAZ"
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
                    placeholder="Örn: 52-1045 veya Sicil No"
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
                  placeholder="Keşif zaptı hazırlanırken bu bilirkişi seçildiğinde zapta otomatik eklenecek açıklama ve beyan metnini buraya yazınız..."
                  className="w-full rounded-lg border border-slate-300 p-3 text-xs leading-relaxed text-slate-900 focus:border-purple-600 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Keşif zaptı hazırlarken bu bilirkişiyi seçtiğinizde, yukarıdaki kutuda yazan açıklama metni doğrudan Word keşif zaptının içine aktarılır.
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
              <button
                type="button"
                onClick={() => setSubTab("zapt")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Keşif Zaptı Hazırlama Ekranına Geç &rarr;</span>
              </button>
            </div>

            {registeredExperts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center space-y-2">
                <Users className="mx-auto h-8 w-8 text-purple-400" />
                <div className="text-sm font-bold text-slate-800">
                  Henüz kayıtlı bilirkişi eklenmedi
                </div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Sol taraftaki formdan mahkemede görev alan bilirkişilerin unvan, ad soyad, sicil numarası ve zapt açıklama metinlerini ekleyebilirsiniz.
                </p>
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
                              Sicil No: {exp.sicilNo}
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
          {/* SOL 5 SÜTUN: 1) Keşif Seçimi, 2) Personel Seçimi, 3) Bilirkişi Seçimi */}
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
                                ({formatDateTR(rec.date)} · {rec.time})
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
                        onClick={() => setJudgeName(j)}
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
                    placeholder="Sicil No (Ops.)"
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-purple-600 focus:outline-none"
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
                        onClick={() => setClerkName(c)}
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
                    placeholder="Sicil No (Ops.)"
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-purple-600 focus:outline-none"
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
                        onClick={() => setBailiffName(b)}
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
                    placeholder="Sicil No (Ops.)"
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-purple-600 focus:outline-none"
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
                    Henüz kayıtlı bilirkişi tanımlamadınız. Bilirkişi unvanı, adı soyadı, sicil numarası ve zapta otomatik eklenecek açıklama metni girmek için aşağıdaki butona tıklayın:
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubTab("bilirkisiler")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-purple-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Bilirkişi Ekleme Menüsünü Aç</span>
                  </button>
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
                                (Sicil: {exp.sicilNo})
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
          </div>

          {/* SAĞ 7 SÜTUN: CANLI A4 KEŞİF ZAPTI ÖNİZLEMESİ VE WORD (.DOC) İNDİRME */}
          <div className="lg:col-span-7 space-y-4">
            {/* Word İndirme Araç Çubuğu */}
            <div className="rounded-2xl border border-purple-200 bg-white p-4 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Word (.doc) Keşif Zaptı Çıktısı & Canlı Sayfa Önizlemesi
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Alt bilgi:{" "}
                    <code className="rounded bg-purple-50 px-1.5 py-0.5 font-mono text-purple-900 font-semibold">
                      Fatsa 2. Sulh Hukuk Mahkemesi{" "}
                      {activeRecord?.esasNo || "#DosyaNo"} Keşif Zaptı
                    </code>{" "}
                    · Otomatik Sayfa Numaralı
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
                        ? "Metin Elle Düzenleme Modunda (Otomatik Moda Dön)"
                        : "Zapt Metnini Elle Düzenle"}
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
                      <span>Otomatik Metne Sıfırla</span>
                    </button>
                  )}
                </div>
                <span className="text-[11px] text-slate-500">
                  Seçtiğiniz personel ve bilirkişilerin açıklamaları zapta otomatik yansır.
                </span>
              </div>
            </div>

            {/* A4 SAYFA ÖNİZLEMESİ */}
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
              <div className="rounded-2xl border border-slate-300 bg-white p-6 sm:p-9 shadow-md font-serif text-slate-950 space-y-5">
                {/* Kurumsal Başlık */}
                <div className="border-b-2 border-slate-900 pb-3 text-center space-y-0.5">
                  <div className="text-sm sm:text-base font-bold tracking-wide">
                    T.C.
                  </div>
                  <div className="text-sm sm:text-base font-bold tracking-wide">
                    FATSA 2. SULH HUKUK MAHKEMESİ
                  </div>
                  <div className="text-xs sm:text-sm font-bold tracking-wider">
                    KEŞİF ZAPTI (KEŞİF TUTANAĞI)
                  </div>
                </div>

                {/* Künye Bilgileri */}
                <div className="grid grid-cols-1 gap-1.5 text-xs sm:text-[13px] leading-snug">
                  <div className="grid grid-cols-12">
                    <span className="col-span-4 font-bold">ESAS NUMARASI</span>
                    <span className="col-span-8 font-bold">
                      : {activeRecord.esasNo}
                    </span>
                  </div>
                  <div className="grid grid-cols-12">
                    <span className="col-span-4 font-bold">HAKİM</span>
                    <span className="col-span-8">
                      : {judgeName || "Kadir SAĞLAM"}
                      {judgeSicilNo.trim() ? ` (${judgeSicilNo.trim()})` : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-12">
                    <span className="col-span-4 font-bold">ZABIT KATİBİ</span>
                    <span className="col-span-8">
                      : {clerkName || "Mehmet AKIN"}
                      {clerkSicilNo.trim() ? ` (${clerkSicilNo.trim()})` : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-12">
                    <span className="col-span-4 font-bold">MÜBAŞİR</span>
                    <span className="col-span-8">
                      : {bailiffName || "Ebru YILMAZ"}
                      {bailiffSicilNo.trim()
                        ? ` (${bailiffSicilNo.trim()})`
                        : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-12">
                    <span className="col-span-4 font-bold">
                      KEŞİF TARİHİ VE SAATİ
                    </span>
                    <span className="col-span-8">
                      : {formatDateTR(activeRecord.date)} — Saat{" "}
                      {activeRecord.time}
                    </span>
                  </div>
                  <div className="grid grid-cols-12">
                    <span className="col-span-4 font-bold">
                      DAVA / KEŞİF KONUSU
                    </span>
                    <span className="col-span-8">: {activeRecord.caseType}</span>
                  </div>
                  <div className="grid grid-cols-12">
                    <span className="col-span-4 font-bold">
                      KEŞİF YERİ (İLÇE / MAHALLE)
                    </span>
                    <span className="col-span-8">
                      : Ordu İli, {activeRecord.district} İlçesi,{" "}
                      {activeRecord.neighborhood}
                    </span>
                  </div>
                </div>

                {/* Taşınmaz / Parsel Cetveli */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold uppercase">
                    KEŞİF KONUSU TAŞINMAZ / PARSEL CETVELİ:
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-500 text-xs">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-slate-500 px-2 py-1 text-center">
                            Sıra
                          </th>
                          <th className="border border-slate-500 px-2 py-1 text-left">
                            İlçe
                          </th>
                          <th className="border border-slate-500 px-2 py-1 text-left">
                            Mahalle / Köy
                          </th>
                          <th className="border border-slate-500 px-2 py-1 text-center">
                            Ada No
                          </th>
                          <th className="border border-slate-500 px-2 py-1 text-center">
                            Parsel No
                          </th>
                          <th className="border border-slate-500 px-2 py-1 text-center">
                            B.Bölüm
                          </th>
                          <th className="border border-slate-500 px-2 py-1 text-left">
                            Niteliği
                          </th>
                          <th className="border border-slate-500 px-2 py-1 text-right">
                            Yüzölçümü
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeRecord.parcels &&
                        activeRecord.parcels.length > 0 ? (
                          activeRecord.parcels.map((p, idx) => (
                            <tr key={p.id || idx}>
                              <td className="border border-slate-500 px-2 py-1 text-center">
                                {idx + 1}
                              </td>
                              <td className="border border-slate-500 px-2 py-1">
                                {activeRecord.district}
                              </td>
                              <td className="border border-slate-500 px-2 py-1">
                                {p.neighborhood || activeRecord.neighborhood}
                              </td>
                              <td className="border border-slate-500 px-2 py-1 text-center font-bold">
                                {p.adaNo}
                              </td>
                              <td className="border border-slate-500 px-2 py-1 text-center font-bold">
                                {p.parselNo}
                              </td>
                              <td className="border border-slate-500 px-2 py-1 text-center">
                                {p.bagimsizBolumNo || "-"}
                              </td>
                              <td className="border border-slate-500 px-2 py-1">
                                {p.nitelik || activeRecord.nitelik || "-"}
                              </td>
                              <td className="border border-slate-500 px-2 py-1 text-right">
                                {p.yuzolcumuM2
                                  ? `${formatAreaM2(p.yuzolcumuM2)} m²`
                                  : "-"}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="border border-slate-500 px-2 py-1 text-center">
                              1
                            </td>
                            <td className="border border-slate-500 px-2 py-1">
                              {activeRecord.district}
                            </td>
                            <td className="border border-slate-500 px-2 py-1">
                              {activeRecord.neighborhood}
                            </td>
                            <td className="border border-slate-500 px-2 py-1 text-center font-bold">
                              {activeRecord.adaNo || "-"}
                            </td>
                            <td className="border border-slate-500 px-2 py-1 text-center font-bold">
                              {activeRecord.parselNo || "-"}
                            </td>
                            <td className="border border-slate-500 px-2 py-1 text-center">
                              {activeRecord.bagimsizBolumNo || "-"}
                            </td>
                            <td className="border border-slate-500 px-2 py-1">
                              {activeRecord.nitelik ||
                                activeRecord.addressDetail ||
                                activeRecord.vehicleInfo?.plateNo ||
                                "-"}
                            </td>
                            <td className="border border-slate-500 px-2 py-1 text-right">
                              {activeRecord.yuzolcumuM2
                                ? `${formatAreaM2(activeRecord.yuzolcumuM2)} m²`
                                : "-"}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Zapt Gövde Metni (Otomatik veya Manuel Düzenlenebilir) */}
                {isManualTextMode ? (
                  <div className="space-y-1.5 font-sans">
                    <label className="block text-xs font-bold text-amber-900">
                      Keşif Zaptı Gövde Metni (Serbest Düzenleme Modu):
                    </label>
                    <textarea
                      rows={14}
                      value={manualBodyText}
                      onChange={(e) => setManualBodyText(e.target.value)}
                      className="w-full rounded-xl border border-amber-400 bg-amber-50/30 p-3 font-serif text-xs sm:text-sm leading-relaxed text-slate-950 focus:border-purple-600 focus:bg-white focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="space-y-3 text-xs sm:text-[13.5px] leading-relaxed text-justify whitespace-pre-line">
                    {autoGeneratedBodyText}
                  </div>
                )}

                {/* İmza Blokları */}
                <div className="pt-6 space-y-6">
                  <div className="grid grid-cols-3 gap-4 text-center text-xs sm:text-[13px]">
                    <div>
                      <div className="font-bold">Zabıt Katibi</div>
                      <div>
                        {clerkName || "Mehmet AKIN"}
                        {clerkSicilNo.trim() ? ` (${clerkSicilNo.trim()})` : ""}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        (İmza)
                      </div>
                    </div>
                    <div>
                      <div className="font-bold">Mübaşir</div>
                      <div>
                        {bailiffName || "Ebru YILMAZ"}
                        {bailiffSicilNo.trim()
                          ? ` (${bailiffSicilNo.trim()})`
                          : ""}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        (İmza)
                      </div>
                    </div>
                    <div>
                      <div className="font-bold">Hakim</div>
                      <div>
                        {judgeName || "Kadir SAĞLAM"}
                        {judgeSicilNo.trim() ? ` (${judgeSicilNo.trim()})` : ""}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        (İmza)
                      </div>
                    </div>
                  </div>

                  {activeSelectedExperts.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2 text-center text-xs sm:text-[12.5px] border-t border-dashed border-slate-200">
                      {activeSelectedExperts.map((exp) => (
                        <div key={exp.id} className="pt-2">
                          <div className="font-bold">{exp.title}</div>
                          <div>{exp.fullName}</div>
                          {exp.sicilNo && (
                            <div className="text-[11px] text-slate-600">
                              Sicil No: {exp.sicilNo}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-500 mt-1">
                            (İmza)
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sayfa Alt Bilgi (Footer) Önizlemesi */}
                <div className="mt-8 border-t border-slate-400 pt-2.5 flex items-center justify-between text-[11px] text-slate-700">
                  <span className="font-bold">
                    Fatsa 2. Sulh Hukuk Mahkemesi {activeRecord.esasNo} Keşif Zaptı
                  </span>
                  <span>Sayfa 1 / 1</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
