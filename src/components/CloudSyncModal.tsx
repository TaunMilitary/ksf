import React, { useState } from "react";
import {
  Cloud,
  Copy,
  Check,
  Download,
  Upload,
  RefreshCw,
  BookOpen,
  Server,
  HardDrive,
  X,
  CheckCircle2,
  AlertCircle,
  GitBranch,
  ExternalLink,
  KeyRound,
} from "lucide-react";
import { CloudSyncConfig, InspectionRecord } from "../types";
import { DEFAULT_APPS_SCRIPT_URL } from "../data/fatsaData";

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: CloudSyncConfig;
  onSaveConfig: (newConfig: CloudSyncConfig) => void;
  records: InspectionRecord[];
  onReplaceRecords: (newRecords: InspectionRecord[]) => void;
}

/**
 * UTF-8 metni güvenli şekilde Base64'e çevirir (GitHub Repository Contents API için)
 */
function encodeUtf8Base64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64 metni güvenli şekilde UTF-8'e çözer (GitHub Repository Contents API için)
 */
function decodeUtf8Base64(b64: string): string {
  const clean = b64.replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Gist URL veya ID metninden saf Gist ID'sini ayıklar
 */
export function extractGistId(raw?: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  const match = trimmed.match(/gist\.github\.com\/(?:[^/]+\/)?([a-f0-9]{10,40})/i);
  if (match && match[1]) return match[1];
  const lastSlash = trimmed.split("/").filter(Boolean).pop() || "";
  return lastSlash.trim();
}

/**
 * Repo URL veya "kullanici/repo" metninden temiz "owner/repo" bilgisini ayıklar
 */
export function extractRepoSlug(raw?: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  const match = trimmed.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git|\/|$)/i);
  if (match && match[1]) return match[1];
  return trimmed.replace(/^\/+|\/+$/g, "");
}

/**
 * JSONP (<script>) ile "Google hesabı olan herkes" (Anyone with a Google account)
 * ayarlı Google Apps Script'ten tarayıcıdaki Google oturum çerezleriyle veri okur.
 */
function tryJsonpPullFromAppsScript(
  scriptUrl: string,
  timeoutMs = 7000
): Promise<InspectionRecord[] | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const callbackName = `__fatsaGasSyncCb_${Date.now()}_${Math.floor(
      Math.random() * 10000
    )}`;
    const winAny = window as any;
    let settled = false;

    const cleanup = (scriptEl?: HTMLScriptElement) => {
      try {
        delete winAny[callbackName];
      } catch {
        winAny[callbackName] = undefined;
      }
      if (scriptEl && scriptEl.parentNode) {
        scriptEl.parentNode.removeChild(scriptEl);
      }
    };

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup(scriptEl);
        resolve(null);
      }
    }, timeoutMs);

    winAny[callbackName] = (data: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup(scriptEl);
      const list = Array.isArray(data?.records)
        ? data.records
        : Array.isArray(data)
        ? data
        : null;
      resolve(list);
    };

    const sep = scriptUrl.includes("?") ? "&" : "?";
    const src = `${scriptUrl}${sep}action=read&callback=${callbackName}&_t=${Date.now()}`;
    const scriptEl = document.createElement("script");
    scriptEl.src = src;
    scriptEl.async = true;
    scriptEl.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        cleanup(scriptEl);
        resolve(null);
      }
    };
    scriptEl.onload = () => {
      // Eğer script yüklendi ama callback çağrılmadıysa (eski Code.gs sürümü), kısa süre sonra kapat
      setTimeout(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanup(scriptEl);
          resolve(null);
        }
      }, 300);
    };
    document.body.appendChild(scriptEl);
  });
}

/**
 * Gizli Iframe + Form POST yöntemi ile "Google hesabı olan herkes" ayarlı
 * Google Apps Script'e tarayıcıdaki aktif Google çerezleriyle veri yazar.
 */
function sendAuthenticatedFormPostToAppsScript(
  scriptUrl: string,
  bodyPayload: string
): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    try {
      const iframeName = `fatsa_gas_post_iframe_${Date.now()}`;
      const iframe = document.createElement("iframe");
      iframe.name = iframeName;
      iframe.style.display = "none";
      document.body.appendChild(iframe);

      const form = document.createElement("form");
      form.method = "POST";
      form.action = scriptUrl;
      form.target = iframeName;
      form.enctype = "application/x-www-form-urlencoded";
      form.style.display = "none";

      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "payload";
      input.value = bodyPayload;
      form.appendChild(input);

      document.body.appendChild(form);
      form.submit();

      setTimeout(() => {
        if (form.parentNode) form.parentNode.removeChild(form);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        resolve();
      }, 1800);
    } catch {
      resolve();
    }
  });
}

/**
 * Hem "Herkes (Anyone)" hem de "Google hesabı olan herkes (Anyone with a Google account)"
 * izinli Google Apps Script Web App ile çalışan gönderim fonksiyonu
 */
export async function syncPushToAppsScript(
  scriptUrl: string,
  records: InspectionRecord[]
): Promise<void> {
  const cleanUrl = scriptUrl.trim();
  const bodyPayload = JSON.stringify({
    action: "write",
    updatedAt: new Date().toISOString(),
    court: "Fatsa Sulh Hukuk Mahkemesi (Fatsa - Çamaş - Çatalpınar)",
    records,
  });

  // 1. Önce standart CORS POST dene ("Herkes / Anyone" izni açıksa anında yanıt döner)
  try {
    const directRes = await fetch(cleanUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: bodyPayload,
      redirect: "follow",
    });
    if (directRes.ok) {
      return;
    }
  } catch {
    // CORS veya "Google hesabı olan herkes" yönlendirmesi varsa devam et
  }

  // 2. Sunucu vekili üzerinden dene
  if (
    typeof window !== "undefined" &&
    window.location.protocol.startsWith("http")
  ) {
    try {
      const res = await fetch("/api/cloud-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptUrl: cleanUrl,
          action: "push",
          payload: records,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.error) return;
      }
    } catch {
      // devam et
    }
  }

  // 3. "Google hesabı olan herkes" seçiliyse tarayıcıdaki aktif Google çerezleriyle (credentials: "include" + no-cors ve gizli form) gönder
  try {
    await fetch(cleanUrl, {
      method: "POST",
      mode: "no-cors",
      credentials: "include",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: bodyPayload,
    });
  } catch {
    // ignore
  }

  await sendAuthenticatedFormPostToAppsScript(cleanUrl, bodyPayload);
}

/**
 * Hem "Herkes (Anyone)" hem de "Google hesabı olan herkes (Anyone with a Google account)"
 * izinli Google Apps Script Web App'ten veri okuma fonksiyonu
 */
export async function syncPullFromAppsScript(
  scriptUrl: string
): Promise<InspectionRecord[]> {
  const cleanUrl = scriptUrl.trim();
  const readUrl = cleanUrl.includes("?")
    ? `${cleanUrl}&action=read`
    : `${cleanUrl}?action=read`;

  // 1. Doğrudan tarayıcıdan (CORS) oku
  try {
    const directRes = await fetch(readUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "follow",
    });
    if (directRes.ok) {
      const text = await directRes.text();
      if (!text.trim().startsWith("<")) {
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed?.records)
          ? parsed.records
          : Array.isArray(parsed)
          ? parsed
          : [];
        return list;
      }
    }
  } catch {
    // devam et
  }

  // 2. Tarayıcıdaki Google hesabı çerezleriyle (credentials: "include") dene
  try {
    const credRes = await fetch(readUrl, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
      redirect: "follow",
    });
    if (credRes.ok) {
      const text = await credRes.text();
      if (!text.trim().startsWith("<")) {
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed?.records)
          ? parsed.records
          : Array.isArray(parsed)
          ? parsed
          : [];
        return list;
      }
    }
  } catch {
    // devam et
  }

  // 3. "Google hesabı olan herkes" seçiliyse JSONP (<script src="...?callback=...">) ile Google çerezlerini kullanarak çek
  const jsonpRecords = await tryJsonpPullFromAppsScript(cleanUrl);
  if (jsonpRecords && Array.isArray(jsonpRecords)) {
    return jsonpRecords;
  }

  // 4. Sunucu proxy'sini dene
  if (
    typeof window !== "undefined" &&
    window.location.protocol.startsWith("http")
  ) {
    const res = await fetch("/api/cloud-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scriptUrl: cleanUrl,
        action: "pull",
      }),
    });
    const data = await res.json();
    if (res.status === 401 && data.code === "GOOGLE_ACCOUNT_AUTH_REQUIRED") {
      const authErr = new Error(
        "Google Apps Script'te 'Google hesabı olan herkes' seçili olduğu için Google oturum doğrulaması gerekiyor. Aşağıdaki 'Google Oturumu ile Yeni Sekmede Aç & Kopyala' butonunu kullanabilir, güncellenmiş Code.gs kodunu yapıştırabilir veya doğrudan 'GitHub Senkronizasyonu' sekmesine geçebilirsiniz."
      );
      (authErr as any).code = "GOOGLE_ACCOUNT_AUTH_REQUIRED";
      throw authErr;
    }
    if (!res.ok || data.error) {
      throw new Error(data.error || "Bulut okuma hatası");
    }
    return Array.isArray(data.data?.records)
      ? data.data.records
      : Array.isArray(data.data)
      ? data.data
      : [];
  }

  const fallbackErr = new Error(
    "Google Apps Script'te 'Google hesabı olan herkes' izni seçili olduğunda tarayıcı CORS engeli oluşmaktadır. Çözüm için 'GitHub Senkronizasyonu' sekmesini kullanabilir veya aşağıdaki 'Google Oturumu ile Aç' köprüsünü kullanabilirsiniz."
  );
  (fallbackErr as any).code = "GOOGLE_ACCOUNT_AUTH_REQUIRED";
  throw fallbackErr;
}

/**
 * GitHub (Gist veya Repository) üzerine keşif veritabanını yazar (Sunucusuz & CORS Uyumlu)
 */
export async function syncPushToGitHub(
  config: CloudSyncConfig,
  records: InspectionRecord[]
): Promise<{ gistId?: string }> {
  const token = (config.githubToken || "").trim();
  if (!token) {
    throw new Error(
      "GitHub'a veri göndermek için lütfen bir GitHub Personal Access Token (ghp_... veya github_pat_...) giriniz."
    );
  }

  const syncType = config.githubSyncType || "gist";
  const fileName = (config.githubFilePath || "kesif_veritabani.json").trim() || "kesif_veritabani.json";
  const contentStr = JSON.stringify(
    {
      court: "Fatsa Adliyesi - Sulh Hukuk Mahkemesi (Fatsa / Çamaş / Çatalpınar)",
      updatedAt: new Date().toISOString(),
      count: records.length,
      records,
    },
    null,
    2
  );

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (syncType === "gist") {
    const cleanGistId = extractGistId(config.githubGistId);
    if (cleanGistId) {
      const res = await fetch(`https://api.github.com/gists/${cleanGistId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          description:
            "Fatsa Adliyesi Akıllı Keşif Planlayıcı Veritabanı (Fatsa / Çamaş / Çatalpınar)",
          files: {
            "kesif_veritabani.json": {
              content: contentStr,
            },
          },
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.message || `GitHub Gist güncellenemedi (HTTP ${res.status}). Token 'gist' yetkisini ve Gist ID'yi kontrol edin.`
        );
      }
      return { gistId: cleanGistId };
    } else {
      // Gist ID boşsa otomatik yeni Gist oluştur!
      const res = await fetch("https://api.github.com/gists", {
        method: "POST",
        headers,
        body: JSON.stringify({
          description:
            "Fatsa Adliyesi Akıllı Keşif Planlayıcı Veritabanı (Fatsa / Çamaş / Çatalpınar)",
          public: false,
          files: {
            "kesif_veritabani.json": {
              content: contentStr,
            },
          },
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.message || `Yeni GitHub Gist oluşturulamadı (HTTP ${res.status}). Token'da 'gist' izni açık olmalıdır.`
        );
      }
      const created = await res.json();
      return { gistId: created.id };
    }
  }

  // GitHub Repository (Depo) Modu
  const repoSlug = extractRepoSlug(config.githubRepo);
  if (!repoSlug || !repoSlug.includes("/")) {
    throw new Error(
      "Lütfen geçerli bir GitHub Repo adı giriniz (Örn: kullaniciadi/kesif-veritabani)."
    );
  }
  const branch = (config.githubBranch || "main").trim() || "main";
  const apiUrl = `https://api.github.com/repos/${repoSlug}/contents/${fileName}`;

  // Önce mevcut dosyanın SHA bilgisini al (varsa)
  let existingSha: string | undefined;
  try {
    const getRes = await fetch(
      `${apiUrl}?ref=${encodeURIComponent(branch)}&_t=${Date.now()}`,
      { headers }
    );
    if (getRes.ok) {
      const existingData = await getRes.json();
      if (existingData?.sha) {
        existingSha = existingData.sha;
      }
    }
  } catch {
    // dosya henüz yoksa yeni oluşturulur
  }

  const putBody: Record<string, any> = {
    message: `Keşif veritabanı güncellendi (${records.length} dosya - ${new Date().toLocaleString("tr-TR")})`,
    content: encodeUtf8Base64(contentStr),
    branch,
  };
  if (existingSha) {
    putBody.sha = existingSha;
  }

  const putRes = await fetch(apiUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify(putBody),
  });
  if (!putRes.ok) {
    const errData = await putRes.json().catch(() => ({}));
    throw new Error(
      errData.message ||
        `GitHub Repo dosyası yazılamadı (HTTP ${putRes.status}). Repo adını (${repoSlug}), dal adını (${branch}) ve Token 'repo/contents' iznini kontrol edin.`
    );
  }
  return {};
}

/**
 * GitHub (Gist veya Repository) üzerinden keşif veritabanını okur (Sunucusuz & CORS Uyumlu)
 */
export async function syncPullFromGitHub(
  config: CloudSyncConfig
): Promise<InspectionRecord[]> {
  const token = (config.githubToken || "").trim();
  const syncType = config.githubSyncType || "gist";
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (syncType === "gist") {
    const cleanGistId = extractGistId(config.githubGistId);
    if (!cleanGistId) {
      throw new Error(
        "GitHub Gist'ten veri çekmek için lütfen Gist ID (veya Gist URL) giriniz."
      );
    }
    const res = await fetch(
      `https://api.github.com/gists/${cleanGistId}?_t=${Date.now()}`,
      { headers }
    );
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(
        errData.message || `GitHub Gist okunamadı (HTTP ${res.status}). Gist ID'yi kontrol edin.`
      );
    }
    const gistData = await res.json();
    const files = gistData.files || {};
    const targetFile =
      files["kesif_veritabani.json"] ||
      Object.values(files).find((f: any) =>
        String(f?.filename || "").endsWith(".json")
      ) ||
      Object.values(files)[0];

    if (!targetFile) {
      throw new Error("Gist içerisinde JSON veritabanı dosyası bulunamadı.");
    }

    let rawContent = (targetFile as any).content;
    if ((targetFile as any).truncated && (targetFile as any).raw_url) {
      const rawRes = await fetch((targetFile as any).raw_url);
      rawContent = await rawRes.text();
    }

    const parsed = JSON.parse(rawContent || "{}");
    return Array.isArray(parsed?.records)
      ? parsed.records
      : Array.isArray(parsed)
      ? parsed
      : [];
  }

  // GitHub Repository (Depo) Modu
  const repoSlug = extractRepoSlug(config.githubRepo);
  if (!repoSlug || !repoSlug.includes("/")) {
    throw new Error(
      "Lütfen geçerli bir GitHub Repo adı giriniz (Örn: kullaniciadi/kesif-veritabani)."
    );
  }
  const fileName = (config.githubFilePath || "kesif_veritabani.json").trim() || "kesif_veritabani.json";
  const branch = (config.githubBranch || "main").trim() || "main";
  const apiUrl = `https://api.github.com/repos/${repoSlug}/contents/${fileName}?ref=${encodeURIComponent(
    branch
  )}&_t=${Date.now()}`;

  const res = await fetch(apiUrl, { headers });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData.message ||
        `GitHub Repo'dan '${fileName}' okunamadı (HTTP ${res.status}). Önce 'Şimdi GitHub'a Gönder' ile dosyayı oluşturabilirsiniz.`
    );
  }
  const fileData = await res.json();
  let jsonText = "";
  if (fileData.content) {
    jsonText = decodeUtf8Base64(fileData.content);
  } else if (fileData.download_url) {
    const rawRes = await fetch(fileData.download_url);
    jsonText = await rawRes.text();
  }
  const parsed = JSON.parse(jsonText || "{}");
  return Array.isArray(parsed?.records)
    ? parsed.records
    : Array.isArray(parsed)
    ? parsed
    : [];
}

/**
 * Aktif seçili bulut sağlayıcısına (GitHub veya Google Apps Script) otomatik veri gönderir
 */
export async function syncPushToActiveCloud(
  config: CloudSyncConfig,
  records: InspectionRecord[]
): Promise<void> {
  if (config.mode === "github") {
    if (config.githubToken?.trim()) {
      await syncPushToGitHub(config, records);
    }
    return;
  }
  if (config.appsScriptUrl?.trim()) {
    await syncPushToAppsScript(config.appsScriptUrl.trim(), records);
  }
}

const APPS_SCRIPT_CODE = `// ============================================================================
// FATSA ADLİYESİ (SULH HUKUK MAHKEMESİ - FATSA / ÇAMAŞ / ÇATALPINAR)
// GOOGLE DRIVE & E-TABLOLAR SENKRONİZASYON KODU
// ("Herkes" VEYA "Google hesabı olan herkes" İzinleriyle %100 Uyumludur!)
// ============================================================================

const DB_FILE_NAME = "kesif_veritabani.json";

function doGet(e) {
  try {
    // Eğer GET üzerinden yazma isteği geldiyse
    if (e && e.parameter && e.parameter.action === "write" && e.parameter.payload) {
      saveRecordsPayload(JSON.parse(e.parameter.payload));
    }

    const file = getOrCreateDbFile();
    const content = file.getBlob().getDataAsString("UTF-8");
    const parsed = content ? JSON.parse(content) : { records: [] };
    const jsonString = JSON.stringify(parsed);

    // "Google hesabı olan herkes" modunda tarayıcıdan CORS'suz JSONP okuması için:
    if (e && e.parameter && e.parameter.callback) {
      return ContentService
        .createTextOutput(e.parameter.callback + "(" + jsonString + ");")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return ContentService
      .createTextOutput(jsonString)
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    const errJson = JSON.stringify({ error: err.toString(), records: [] });
    if (e && e.parameter && e.parameter.callback) {
      return ContentService
        .createTextOutput(e.parameter.callback + "(" + errJson + ");")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService
      .createTextOutput(errJson)
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    // Hem standart JSON body hem de gizli form POST (e.parameter.payload) desteklenir
    const rawText = (e && e.parameter && e.parameter.payload)
      ? e.parameter.payload
      : (e && e.postData && e.postData.contents ? e.postData.contents : "{}");
    const body = JSON.parse(rawText);
    saveRecordsPayload(body);

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok", count: (body.records || []).length, updatedAt: new Date().toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function saveRecordsPayload(body) {
  const file = getOrCreateDbFile();
  file.setContent(JSON.stringify(body, null, 2));

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss && Array.isArray(body.records)) {
      let sheet = ss.getSheetByName("Kesif_Listesi");
      if (!sheet) sheet = ss.insertSheet("Kesif_Listesi");
      sheet.clearContents();
      sheet.appendRow(["İlçe", "Esas No", "Tarih", "Saat", "Mahalle/Köy", "Konu / Parseller / Plaka", "Keşif Türü", "Durum", "Mesafe (KM)", "Bilirkişiler", "Ekleyen Personel", "Notlar"]);
      body.records.forEach(function(r) {
        const subjectInfo = r.subjectType === "arac" && r.vehicleInfo
          ? ("ARAÇ PLAKA: " + r.vehicleInfo.plateNo + " " + (r.vehicleInfo.brandModel || ""))
          : (r.parcels && r.parcels.length > 1
              ? r.parcels.map(function(p) { return (p.adaNo || "0") + "/" + p.parselNo; }).join(", ")
              : ((r.adaNo || "0") + " Ada / " + (r.parselNo || "1") + " Parsel"));
        sheet.appendRow([r.district || "Fatsa", r.esasNo, r.date, r.time, r.neighborhood, subjectInfo, r.caseType, r.status || "planlandi", r.distanceKm, r.experts, r.createdBy || "", r.notes]);
      });
    }
  } catch (sheetErr) {}
}

function getOrCreateDbFile() {
  const files = DriveApp.getFilesByName(DB_FILE_NAME);
  if (files.hasNext()) {
    return files.next();
  }
  return DriveApp.createFile(DB_FILE_NAME, JSON.stringify({ records: [] }, null, 2), MimeType.PLAIN_TEXT);
}`;

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  records,
  onReplaceRecords,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<
    "github" | "apps_script" | "drive_api" | "guide"
  >(() => (config.mode === "github" ? "github" : "apps_script"));

  const [formState, setFormState] = useState<CloudSyncConfig>(() => ({
    ...config,
    appsScriptUrl: config.appsScriptUrl || DEFAULT_APPS_SCRIPT_URL,
    githubSyncType: config.githubSyncType || "gist",
    githubFilePath: config.githubFilePath || "kesif_veritabani.json",
    githubBranch: config.githubBranch || "main",
  }));

  const [copied, setCopied] = useState(false);
  const [showGoogleAuthBridge, setShowGoogleAuthBridge] = useState(false);
  const [pastedGoogleJson, setPastedGoogleJson] = useState("");
  const [syncStatus, setSyncStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });

  if (!isOpen) return null;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSave = () => {
    onSaveConfig(formState);
    setSyncStatus({
      type: "success",
      message: "Bulut senkronizasyon ayarları kaydedildi.",
    });
  };

  // ==========================================================================
  // 1. GOOGLE APPS SCRIPT PUSH / PULL HANDLERS
  // ==========================================================================
  const handlePushToAppsScript = async () => {
    if (!formState.appsScriptUrl.trim()) {
      setSyncStatus({
        type: "error",
        message: "Lütfen önce Google Apps Script Web App URL adresini giriniz.",
      });
      return;
    }

    setSyncStatus({
      type: "loading",
      message: "Keşif veritabanı Google Drive / E-Tablolar bulutuna gönderiliyor...",
    });

    try {
      await syncPushToAppsScript(formState.appsScriptUrl, records);

      const nowStr = new Date().toLocaleString("tr-TR");
      const updated: CloudSyncConfig = {
        ...formState,
        mode: "apps_script",
        lastSyncAt: nowStr,
      };
      setFormState(updated);
      onSaveConfig(updated);

      setSyncStatus({
        type: "success",
        message: `${records.length} adet keşif kaydı Google Bulut (kesif_veritabani.json & E-Tablo) üzerine başarıyla gönderildi (${nowStr}).`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Bağlantı hatası";
      setSyncStatus({
        type: "error",
        message: `Buluta gönderilemedi: ${msg}`,
      });
    }
  };

  const handlePullFromAppsScript = async () => {
    if (!formState.appsScriptUrl.trim()) {
      setSyncStatus({
        type: "error",
        message: "Lütfen önce Google Apps Script Web App URL adresini giriniz.",
      });
      return;
    }

    setSyncStatus({
      type: "loading",
      message: "Google Apps Script üzerindeki keşif kayıtları okunuyor...",
    });

    try {
      const remoteRecords = await syncPullFromAppsScript(formState.appsScriptUrl);

      if (remoteRecords.length === 0) {
        setSyncStatus({
          type: "error",
          message:
            "Bulutta henüz kayıtlı keşif verisi bulunamadı. Önce 'Şimdi Buluta Gönder' ile mevcut verileri yükleyebilirsiniz.",
        });
        return;
      }

      onReplaceRecords(remoteRecords);
      const nowStr = new Date().toLocaleString("tr-TR");
      const updated: CloudSyncConfig = {
        ...formState,
        mode: "apps_script",
        lastSyncAt: nowStr,
      };
      setFormState(updated);
      onSaveConfig(updated);
      setShowGoogleAuthBridge(false);

      setSyncStatus({
        type: "success",
        message: `Google Buluttan ${remoteRecords.length} adet keşif dosyası başarıyla senkronize edildi (${nowStr}).`,
      });
    } catch (err: any) {
      if (err?.code === "GOOGLE_ACCOUNT_AUTH_REQUIRED") {
        setShowGoogleAuthBridge(true);
      }
      const msg = err instanceof Error ? err.message : "Bağlantı hatası";
      setSyncStatus({
        type: "error",
        message: `Buluttan veri çekilemedi: ${msg}`,
      });
    }
  };

  const handleImportPastedGoogleJson = () => {
    try {
      const parsed = JSON.parse(pastedGoogleJson.trim());
      const list: InspectionRecord[] = Array.isArray(parsed?.records)
        ? parsed.records
        : Array.isArray(parsed)
        ? parsed
        : [];
      if (list.length === 0) {
        setSyncStatus({
          type: "error",
          message: "Yapıştırılan metin içerisinde geçerli keşif kaydı bulunamadı.",
        });
        return;
      }
      onReplaceRecords(list);
      const nowStr = new Date().toLocaleString("tr-TR");
      const updated: CloudSyncConfig = {
        ...formState,
        mode: "apps_script",
        lastSyncAt: nowStr,
      };
      setFormState(updated);
      onSaveConfig(updated);
      setPastedGoogleJson("");
      setShowGoogleAuthBridge(false);
      setSyncStatus({
        type: "success",
        message: `Google oturumundan ${list.length} adet keşif kaydı başarıyla içe aktarıldı (${nowStr}).`,
      });
    } catch {
      setSyncStatus({
        type: "error",
        message:
          "Yapıştırılan içerik geçerli bir JSON formatında değil. Açılan Google sekmesindeki tüm metni (Ctrl+A / Ctrl+C) kopyaladığınızdan emin olun.",
      });
    }
  };

  // ==========================================================================
  // 2. GITHUB (GIST & REPO) PUSH / PULL HANDLERS
  // ==========================================================================
  const handlePushToGitHub = async () => {
    setSyncStatus({
      type: "loading",
      message: "Keşif veritabanı GitHub bulutuna gönderiliyor...",
    });

    try {
      const res = await syncPushToGitHub(formState, records);
      const nowStr = new Date().toLocaleString("tr-TR");
      const updated: CloudSyncConfig = {
        ...formState,
        mode: "github",
        githubGistId: res.gistId || extractGistId(formState.githubGistId),
        lastSyncAt: nowStr,
      };
      setFormState(updated);
      onSaveConfig(updated);

      setSyncStatus({
        type: "success",
        message: res.gistId
          ? `${records.length} adet keşif kaydı GitHub Gist (${res.gistId}) üzerine başarıyla kaydedildi (${nowStr}). Diğer kalem personeli sadece bu Gist ID ile verileri çekebilir!`
          : `${records.length} adet keşif kaydı GitHub Repo (${formState.githubRepo}) üzerine başarıyla kaydedildi (${nowStr}).`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "GitHub bağlantı hatası";
      setSyncStatus({
        type: "error",
        message: msg,
      });
    }
  };

  const handlePullFromGitHub = async () => {
    setSyncStatus({
      type: "loading",
      message: "GitHub üzerindeki güncel keşif kayıtları okunuyor...",
    });

    try {
      const remoteRecords = await syncPullFromGitHub(formState);
      if (remoteRecords.length === 0) {
        setSyncStatus({
          type: "error",
          message:
            "GitHub üzerinde henüz kayıtlı keşif verisi bulunamadı. Önce 'Şimdi GitHub'a Gönder' butonuna tıklayın.",
        });
        return;
      }

      onReplaceRecords(remoteRecords);
      const nowStr = new Date().toLocaleString("tr-TR");
      const updated: CloudSyncConfig = {
        ...formState,
        mode: "github",
        githubGistId: extractGistId(formState.githubGistId),
        lastSyncAt: nowStr,
      };
      setFormState(updated);
      onSaveConfig(updated);

      setSyncStatus({
        type: "success",
        message: `GitHub bulutundan ${remoteRecords.length} adet keşif dosyası başarıyla senkronize edildi (${nowStr}).`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "GitHub okuma hatası";
      setSyncStatus({
        type: "error",
        message: msg,
      });
    }
  };

  // ==========================================================================
  // 3. LOCAL JSON DOWNLOAD / UPLOAD
  // ==========================================================================
  const handleDownloadJsonFile = () => {
    const payload = {
      court: "Fatsa Adliyesi - Sulh Hukuk Mahkemesi (Fatsa / Çamaş / Çatalpınar)",
      exportedAt: new Date().toISOString(),
      fileName: "kesif_veritabani.json",
      records,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kesif_veritabani.json";
    a.click();
    URL.revokeObjectURL(url);
    setSyncStatus({
      type: "success",
      message: "kesif_veritabani.json dosyası bilgisayarınıza indirildi.",
    });
  };

  const handleUploadJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(String(event.target?.result || "{}"));
        const importedRecords: InspectionRecord[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.records)
          ? parsed.records
          : [];

        if (importedRecords.length === 0) {
          throw new Error("Dosya içinde geçerli keşif listesi bulunamadı.");
        }

        onReplaceRecords(importedRecords);
        setSyncStatus({
          type: "success",
          message: `kesif_veritabani.json dosyasından ${importedRecords.length} adet keşif başarıyla yüklendi.`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Geçersiz JSON formatı";
        setSyncStatus({
          type: "error",
          message: `Dosya okunamadı: ${msg}`,
        });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3.5 sm:px-6 sm:py-4 text-white">
          <div className="flex items-center gap-3">
            <Cloud className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <h2 className="text-sm sm:text-base font-semibold">
                Bulut Senkronizasyon (GitHub & Google Apps Script)
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-300">
                Hakim, Yazı İşleri Müdürü, Zabıt Katibi ve Mübaşir için ortak keşif veritabanı eşitleme
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 px-4 sm:px-6 pt-2">
          <button
            onClick={() => {
              setActiveSubTab("github");
              setFormState((s) => ({ ...s, mode: "github" }));
            }}
            className={`flex items-center gap-2 border-b-2 px-3 sm:px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeSubTab === "github"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <GitBranch className="h-4 w-4" />
            GitHub Senkronizasyonu (Sorunsuz & Hızlı)
          </button>
          <button
            onClick={() => {
              setActiveSubTab("apps_script");
              setFormState((s) => ({ ...s, mode: "apps_script" }));
            }}
            className={`flex items-center gap-2 border-b-2 px-3 sm:px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeSubTab === "apps_script"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <Server className="h-4 w-4" />
            Google E-Tablolar / Apps Script
          </button>
          <button
            onClick={() => setActiveSubTab("drive_api")}
            className={`flex items-center gap-2 border-b-2 px-3 sm:px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeSubTab === "drive_api"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <HardDrive className="h-4 w-4" />
            JSON Dosya İndir / Yükle
          </button>
          <button
            onClick={() => setActiveSubTab("guide")}
            className={`flex items-center gap-2 border-b-2 px-3 sm:px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeSubTab === "guide"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <BookOpen className="h-4 w-4" />
            Kurulum & İzin Çözüm Rehberi
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {syncStatus.type !== "idle" && (
            <div
              className={`flex items-start gap-3 rounded-lg border p-3.5 text-xs ${
                syncStatus.type === "error"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : syncStatus.type === "loading"
                  ? "border-slate-200 bg-slate-50 text-slate-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              {syncStatus.type === "error" ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              ) : syncStatus.type === "loading" ? (
                <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-emerald-600 mt-0.5" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              )}
              <div className="flex-1 leading-relaxed">{syncStatus.message}</div>
            </div>
          )}

          {/* TAB 1: GITHUB SENKRONİZASYONU (GIST VEYA REPOSITORY) */}
          {activeSubTab === "github" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-950 leading-relaxed">
                <strong>GitHub Üzerinden Kesintisiz Bulut Senkronizasyonu:</strong>{" "}
                Google E-Tablolar izin kısıtlamalarına (<em>"Google hesabı olan herkes"</em> CORS engeline) hiç takılmadan, doğrudan GitHub Gist veya GitHub Deponuz (Repository) üzerinden tüm bilgisayar ve telefonlar arasında anlık senkronizasyon sağlar.
              </div>

              {/* GitHub Mod Seçimi: Gist vs Repo */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    setFormState({ ...formState, githubSyncType: "gist", mode: "github" })
                  }
                  className={`rounded-lg border p-3 text-left transition-all ${
                    (formState.githubSyncType || "gist") === "gist"
                      ? "border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="text-xs font-bold text-slate-900">
                    ⚡ GitHub Gist Modu (En Pratik)
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Repo açmaya gerek kalmadan tek tıkla otomatik bulut dosyası oluşturur
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setFormState({ ...formState, githubSyncType: "repo", mode: "github" })
                  }
                  className={`rounded-lg border p-3 text-left transition-all ${
                    formState.githubSyncType === "repo"
                      ? "border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="text-xs font-bold text-slate-900">
                    📁 GitHub Repository (Depo) Modu
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Proje deponuzun içindeki kesif_veritabani.json dosyasını günceller
                  </div>
                </button>
              </div>

              {/* GitHub Personal Access Token */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                  <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-emerald-600" />
                    <span>GitHub Personal Access Token (Yazma/Gönderme İçin)</span>
                  </label>
                  <a
                    href="https://github.com/settings/tokens/new?description=Fatsa_Adliyesi_Kesif_Planlayici&scopes=gist,repo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
                  >
                    <span>Tek Tıkla GitHub Token Oluştur</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <input
                  type="password"
                  value={formState.githubToken || ""}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      githubToken: e.target.value,
                      mode: "github",
                    })
                  }
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx veya github_pat_..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Yukarıdaki bağlantıya tıklayıp GitHub'da <strong>Generate token</strong> butonuna basarak aldığınız kodu buraya yapıştırın.
                </p>
              </div>

              {(formState.githubSyncType || "gist") === "gist" ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    GitHub Gist ID veya URL (Boş Bırakırsanız İlk Gönderimde Otomatik Oluşturulur)
                  </label>
                  <input
                    type="text"
                    value={formState.githubGistId || ""}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        githubGistId: e.target.value,
                        mode: "github",
                      })
                    }
                    placeholder="Örn: a1b2c3d4e5f6... (Boş bırakıp 'Şimdi GitHub'a Gönder'e basabilirsiniz)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    İlk kez kullanıyorsanız bu alanı boş bırakıp <strong>Şimdi GitHub'a Gönder</strong>'e tıklayın; sistem Gist ID'nizi otomatik oluşturup kaydedecektir.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      GitHub Repo Adı (kullanici/depo) *
                    </label>
                    <input
                      type="text"
                      value={formState.githubRepo || ""}
                      onChange={(e) =>
                        setFormState({
                          ...formState,
                          githubRepo: e.target.value,
                          mode: "github",
                        })
                      }
                      placeholder="Örn: sebebiyat/fatsa-kesif"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Branch (Dal)
                    </label>
                    <input
                      type="text"
                      value={formState.githubBranch || "main"}
                      onChange={(e) =>
                        setFormState({
                          ...formState,
                          githubBranch: e.target.value,
                          mode: "github",
                        })
                      }
                      placeholder="main"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3.5 gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Yeni Keşif Eklendiğinde Otomatik GitHub'a Gönder
                  </div>
                  <div className="text-xs text-slate-500">
                    Aktif edildiğinde her yeni dosya kaydı veya durum değişikliğinde GitHub veritabanı otomatik güncellenir
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={formState.autoSync}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      autoSync: e.target.checked,
                      mode: "github",
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handlePushToGitHub}
                  className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap"
                >
                  <Upload className="h-4 w-4" />
                  Şimdi GitHub'a Gönder ({records.length} Keşif)
                </button>
                <button
                  type="button"
                  onClick={handlePullFromGitHub}
                  className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
                >
                  <Download className="h-4 w-4" />
                  GitHub'dan Güncel Verileri Çek
                </button>
              </div>

              {formState.lastSyncAt && (
                <div className="text-xs text-slate-500 font-mono tabular-nums">
                  Son başarılı eşitleme: {formState.lastSyncAt}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GOOGLE APPS SCRIPT / E-TABLOLAR */}
          {activeSubTab === "apps_script" && (
            <div className="space-y-4">
              {/* Information box explaining why "Herkes" was missing in Sheets/Apps Script */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-950 space-y-1.5 leading-relaxed">
                <div className="font-bold">
                  💡 Neden "Herkes (Anyone)" Seçeneği Görünmedi ve Nasıl Çözülür?
                </div>
                <p>
                  Google Apps Script'te <strong>Dağıt &rarr; Yeni Dağıtım</strong> ekranında üstteki{" "}
                  <em>"Şunun olarak yürüt (Execute as)"</em> kısmı{" "}
                  <strong>"Web uygulamasına erişen kullanıcı"</strong> olarak seçilirse, Google{" "}
                  <em>"Herkes"</em> seçeneğini gizler ve sadece{" "}
                  <strong>"Google hesabı olan herkes"</strong> seçeneğini gösterir.
                </p>
                <p>
                  • <strong>Çözüm 1:</strong> Üstteki <em>"Şunun olarak yürüt"</em> kısmını{" "}
                  <strong>"Ben (sebebiyat@gmail.com)"</strong> olarak seçtiğinizde altta{" "}
                  <strong>"Herkes (Anyone)"</strong> seçeneği açılır.<br />
                  • <strong>Çözüm 2 ("Google hesabı olan herkes" kalsın isterseniz):</strong>{" "}
                  Sistemimiz artık tarayıcı çerezi + JSONP ve aşağıdaki{" "}
                  <strong>Google Oturumlu Köprü</strong> ile <em>"Google hesabı olan herkes"</em> ayarında da çalışmaktadır.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-800">
                    Google Apps Script Web App URL Adresi
                  </label>
                  {formState.appsScriptUrl !== DEFAULT_APPS_SCRIPT_URL && (
                    <button
                      type="button"
                      onClick={() =>
                        setFormState({
                          ...formState,
                          appsScriptUrl: DEFAULT_APPS_SCRIPT_URL,
                        })
                      }
                      className="text-[11px] font-semibold text-emerald-700 hover:underline"
                    >
                      Varsayılan URL'yi Geri Yükle
                    </button>
                  )}
                </div>
                <input
                  type="url"
                  value={formState.appsScriptUrl}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      appsScriptUrl: e.target.value,
                      mode: "apps_script",
                    })
                  }
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3.5 gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Yeni Keşif Eklendiğinde Otomatik Buluta Gönder
                  </div>
                  <div className="text-xs text-slate-500">
                    Aktif edildiğinde her yeni dosya kaydında Google E-Tablolar / Drive otomatik güncellenir
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={formState.autoSync}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      autoSync: e.target.checked,
                      mode: "apps_script",
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handlePushToAppsScript}
                  className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap"
                >
                  <Upload className="h-4 w-4" />
                  Şimdi Buluta Gönder ({records.length} Keşif)
                </button>
                <button
                  type="button"
                  onClick={handlePullFromAppsScript}
                  className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
                >
                  <Download className="h-4 w-4" />
                  Buluttan Güncel Verileri Çek
                </button>
              </div>

              {/* Google Hesabı Olan Herkes Oturum Köprüsü */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-900">
                    🔐 "Google Hesabı Olan Herkes" Oturum Köprüsü
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`${formState.appsScriptUrl.trim()}${
                        formState.appsScriptUrl.includes("?") ? "&" : "?"
                      }action=read`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShowGoogleAuthBridge(true)}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800"
                    >
                      <span>1. Google Oturumu ile Verileri Yeni Sekmede Aç</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <button
                      type="button"
                      onClick={() =>
                        setShowGoogleAuthBridge(!showGoogleAuthBridge)
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      {showGoogleAuthBridge ? "Alanı Gizle" : "2. JSON Yapıştır & Aktar"}
                    </button>
                  </div>
                </div>

                {showGoogleAuthBridge && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] text-slate-600">
                      Yukarıdaki <strong>1. butona</strong> tıkladığınızda Google hesabınızla açılan sekmedeki metni kopyalayıp (Ctrl+A ve Ctrl+C) aşağıya yapıştırarak tek tıkla içe aktarabilirsiniz:
                    </p>
                    <textarea
                      rows={3}
                      value={pastedGoogleJson}
                      onChange={(e) => setPastedGoogleJson(e.target.value)}
                      placeholder='{"records": [ ... ]} metnini buraya yapıştırın...'
                      className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs font-mono text-slate-800 focus:border-emerald-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleImportPastedGoogleJson}
                      className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                    >
                      Yapıştırılan Keşif Verilerini Yükle
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: JSON DOSYA İNDİR / YÜKLE */}
          {activeSubTab === "drive_api" && (
            <div className="space-y-5">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Doğrudan <code className="font-mono">kesif_veritabani.json</code> Dosya İndirme / Yükleme
                </h3>
                <p className="text-xs text-slate-600">
                  Verilerinizi tek tıkla JSON veritabanı dosyası olarak indirebilir, Google Drive klasörünüze, GitHub deponuza veya UYAP ortak ağ klasörüne koyarak başka bir bilgisayarda içe aktarabilirsiniz.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleDownloadJsonFile}
                    className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    <Download className="h-4 w-4" />
                    kesif_veritabani.json İndir
                  </button>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0">
                    <Upload className="h-4 w-4" />
                    kesif_veritabani.json Dosyası Yükle
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={handleUploadJsonFile}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: KURULUM & İZİN ÇÖZÜM REHBERİ */}
          {activeSubTab === "guide" && (
            <div className="space-y-4">
              <div className="space-y-3 text-xs text-slate-700">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5">
                  <div className="font-bold text-emerald-950">
                    Yöntem A (Önerilen): GitHub Gist ile 30 Saniyede Kurulum
                  </div>
                  <p className="mt-1 text-emerald-900">
                    1. <strong>GitHub Senkronizasyonu</strong> sekmesindeki{" "}
                    <em>"Tek Tıkla GitHub Token Oluştur"</em> bağlantısına tıklayın ve oluşan{" "}
                    <code className="font-mono">ghp_...</code> kodunu yapıştırın.<br />
                    2. <strong>Şimdi GitHub'a Gönder</strong> butonuna basın. Sistem otomatik olarak Gist ID oluşturacaktır. Diğer bilgisayarlarda sadece bu Gist ID ile tüm verileri çekebilirsiniz!
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                  <div className="font-semibold text-slate-900">
                    Yöntem B: Google Apps Script'te "Herkes" Seçeneğini Açma veya JSONP Kullanma
                  </div>
                  <p className="mt-1 text-slate-600">
                    Google E-Tablolar &rarr; <strong>Uzantılar &rarr; Apps Script</strong> ekranında aşağıdaki güncellenmiş kodu yapıştırıp kaydedin. Sağ üstten{" "}
                    <strong>Dağıt &rarr; Yeni Dağıtım</strong> derken:
                    <br />• <strong>Şunun olarak yürüt:</strong> <em>Ben (sebebiyat@gmail.com)</em> seçin (Bunu seçtiğinizde altta <em>Herkes / Anyone</em> seçeneği görünür!).
                    <br />• Eğer <em>"Google hesabı olan herkes"</em> seçili bırakırsanız da aşağıdaki yeni kod JSONP desteği sayesinde doğrudan çalışır.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="flex items-center justify-between rounded-t-lg bg-slate-800 px-4 py-2 text-xs text-slate-200">
                  <span className="font-mono">Code.gs (JSONP & Form POST Destekli Güncel Kod)</span>
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Kopyalandı
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Kodu Kopyala
                      </>
                    )}
                  </button>
                </div>
                <pre className="max-h-56 overflow-x-auto rounded-b-lg bg-slate-900 p-4 text-[11px] leading-relaxed font-mono text-emerald-300">
                  {APPS_SCRIPT_CODE}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
          <span className="text-xs text-slate-500">
            Aktif Mod:{" "}
            <strong className="text-slate-800">
              {formState.mode === "github"
                ? `GitHub (${(formState.githubSyncType || "gist").toUpperCase()})`
                : "Google Apps Script"}
            </strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Kapat
            </button>
            <button
              onClick={handleSave}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Ayarları Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

