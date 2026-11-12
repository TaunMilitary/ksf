import React, { useState, useRef, useEffect } from "react";
import {
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Image as ImageIcon,
  Mic,
  MicOff,
  Pause,
  Play,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  InspectionAuditEntry,
  InspectionPhotoItem,
  InspectionRecord,
  InspectionVoiceNote,
} from "../types";
import { formatDateTR } from "../services/geoService";

interface FieldMediaNotesModalProps {
  record: InspectionRecord | null;
  authorLabel: string;
  onClose: () => void;
  onSaveUpdatedRecord: (updated: InspectionRecord) => void;
}

export const FieldMediaNotesModal: React.FC<FieldMediaNotesModalProps> = ({
  record,
  authorLabel,
  onClose,
  onSaveUpdatedRecord,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<"voice" | "photos" | "history">("voice");
  const [voiceNotes, setVoiceNotes] = useState<InspectionVoiceNote[]>([]);
  const [photos, setPhotos] = useState<InspectionPhotoItem[]>([]);
  const [historyLog, setHistoryLog] = useState<InspectionAuditEntry[]>([]);
  const [generalNotes, setGeneralNotes] = useState("");

  // Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [recordedAudioDataUrl, setRecordedAudioDataUrl] = useState<string | undefined>(undefined);

  // Photo Upload State
  const [photoCaptionInput, setPhotoCaptionInput] = useState("");
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (record) {
      setVoiceNotes(record.voiceNotes || []);
      setPhotos(record.photos || []);
      setHistoryLog(record.historyLog || []);
      setGeneralNotes(record.notes || "");
      setLiveTranscript("");
      setRecordedAudioDataUrl(undefined);
      setMicError(null);
      setIsRecording(false);
      setIsPaused(false);
      setRecordingSec(0);
    }
    return () => {
      stopAllRecordingStreams();
    };
  }, [record]);

  const stopAllRecordingStreams = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current.stream
          ?.getTracks()
          .forEach((t) => t.stop());
      } catch {
        // ignore
      }
      mediaRecorderRef.current = null;
    }
  };

  if (!record) return null;

  const handleStartVoiceRecording = async () => {
    setMicError(null);
    setRecordedAudioDataUrl(undefined);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          "Tarayıcınız ses kaydı özelliğini desteklemiyor. Metin alanından doğrudan sesli not dökümü yazabilirsiniz."
        );
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };
      recorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          if (blob.size < 350000) {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (typeof reader.result === "string") {
                setRecordedAudioDataUrl(reader.result);
              }
            };
            reader.readAsDataURL(blob);
          }
        }
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start(500);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setIsPaused(false);
      setRecordingSec(0);

      timerRef.current = window.setInterval(() => {
        setRecordingSec((s) => s + 1);
      }, 1000);

      // Web Speech API (Türkçe konuşmayı yazıya dönüştürme - desteklenen tarayıcılarda)
      const SpeechRec =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.lang = "tr-TR";
          rec.continuous = true;
          rec.interimResults = false;
          rec.onresult = (event: any) => {
            let chunk = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
              if (event.results[i].isFinal) {
                chunk += event.results[i][0].transcript + " ";
              }
            }
            if (chunk.trim()) {
              setLiveTranscript((prev) =>
                prev ? `${prev.trim()} ${chunk.trim()}` : chunk.trim()
              );
            }
          };
          rec.start();
          recognitionRef.current = rec;
        } catch {
          // SpeechRecognition opsiyoneldir
        }
      }
    } catch (err: any) {
      setMicError(
        err?.message ||
          "Mikrofon izni verilmedi veya mikrofon bulunamadı. Notunuzu aşağıdaki metin kutusuna yazarak kaydedebilirsiniz."
      );
      setIsRecording(false);
    }
  };

  const handlePauseResumeRecording = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      setIsPaused(true);
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    } else if (rec.state === "paused") {
      rec.resume();
      setIsPaused(false);
      timerRef.current = window.setInterval(() => {
        setRecordingSec((s) => s + 1);
      }, 1000);
      try {
        recognitionRef.current?.start();
      } catch {
        // ignore
      }
    }
  };

  const handleStopRecording = () => {
    stopAllRecordingStreams();
    setIsRecording(false);
    setIsPaused(false);
  };

  const handleSaveVoiceNoteEntry = () => {
    const cleanText = liveTranscript.trim();
    if (!cleanText && !recordedAudioDataUrl) return;
    const newEntry: InspectionVoiceNote = {
      id: `vnote-${Date.now()}`,
      transcript:
        cleanText || `Sesli saha kaydı (${recordingSec || 1} sn)`,
      audioDataUrl: recordedAudioDataUrl,
      durationSec: recordingSec || undefined,
      createdAt: new Date().toLocaleString("tr-TR"),
      author: authorLabel,
    };
    const nextVoiceNotes = [newEntry, ...voiceNotes];
    const nextHistory: InspectionAuditEntry[] = [
      {
        id: `hist-${Date.now()}`,
        timestamp: new Date().toLocaleString("tr-TR"),
        action: `Sesli saha notu eklendi: "${newEntry.transcript.slice(0, 60)}"`,
        actor: authorLabel,
      },
      ...historyLog,
    ];
    setVoiceNotes(nextVoiceNotes);
    setHistoryLog(nextHistory);
    setLiveTranscript("");
    setRecordedAudioDataUrl(undefined);
    setRecordingSec(0);
  };

  const handleDeleteVoiceNote = (id: string) => {
    setVoiceNotes((prev) => prev.filter((v) => v.id !== id));
  };

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsProcessingPhoto(true);

    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxW = 960;
        const scale = img.width > maxW ? maxW / img.width : 1;
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.76);
          const newPhoto: InspectionPhotoItem = {
            id: `photo-${Date.now()}`,
            dataUrl: compressedDataUrl,
            caption:
              photoCaptionInput.trim() ||
              `${record.esasNo} - ${record.neighborhood} Saha Fotoğrafı`,
            takenAt: new Date().toLocaleString("tr-TR"),
            includeInReport: true,
          };
          setPhotos((prev) => [newPhoto, ...prev]);
          setHistoryLog((prev) => [
            {
              id: `hist-${Date.now()}`,
              timestamp: new Date().toLocaleString("tr-TR"),
              action: `Saha fotoğrafı eklendi (${newPhoto.caption})`,
              actor: authorLabel,
            },
            ...prev,
          ]);
          setPhotoCaptionInput("");
        }
        setIsProcessingPhoto(false);
      };
      img.onerror = () => setIsProcessingPhoto(false);
      img.src = String(reader.result || "");
    };
    reader.onerror = () => setIsProcessingPhoto(false);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSaveAllToRecord = () => {
    stopAllRecordingStreams();
    const updated: InspectionRecord = {
      ...record,
      notes: generalNotes.trim(),
      voiceNotes,
      photos,
      historyLog,
    };
    onSaveUpdatedRecord(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-3 sm:p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
        {/* Başlık */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#1B2733] px-5 py-3.5 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <Mic className="h-5 w-5 text-[#63B5B0] shrink-0" />
            <div>
              <h2 className="text-sm sm:text-base font-bold">
                Saha Sesli Not, Fotoğraf Arşivi & İşlem Geçmişi
              </h2>
              <p className="text-[11px] text-slate-300 font-mono">
                {record.esasNo} · [{record.district}] {record.neighborhood} (
                {formatDateTR(record.date)} {record.time})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopAllRecordingStreams();
              onClose();
            }}
            className="rounded-lg p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Alt Sekmeler */}
        <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-5 py-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubTab("voice")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              activeSubTab === "voice"
                ? "bg-[#246B73] text-white"
                : "bg-white text-slate-700 border border-slate-200"
            }`}
          >
            <Mic className="h-3.5 w-3.5" />
            <span>Sesli Notlar ({voiceNotes.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("photos")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              activeSubTab === "photos"
                ? "bg-[#246B73] text-white"
                : "bg-white text-slate-700 border border-slate-200"
            }`}
          >
            <Camera className="h-3.5 w-3.5" />
            <span>Fotoğraf Arşivi ({photos.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("history")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              activeSubTab === "history"
                ? "bg-[#246B73] text-white"
                : "bg-white text-slate-700 border border-slate-200"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>İşlem Geçmişi ({historyLog.length})</span>
          </button>
        </div>

        {/* İçerik Gövdesi */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {activeSubTab === "voice" && (
            <div className="space-y-4">
              {/* Ses Kayıt ve Konuşmayı Yazıya Dönüştürme Kutusu */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Mikrofon ile Ses Kaydı & Konuşmayı Yazıya Dönüştürme
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Kaydı başlatıp konuşabilirsiniz; metin dökümünü düzenleyerek dosyaya ekleyebilirsiniz.
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isRecording ? (
                      <button
                        type="button"
                        onClick={handleStartVoiceRecording}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#D9535D] px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:opacity-95"
                      >
                        <Mic className="h-4 w-4" />
                        <span>Ses Kaydını Başlat</span>
                      </button>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2.5 py-1 font-mono text-xs font-bold text-rose-800">
                          <span className="h-2 w-2 rounded-full bg-rose-600 animate-ping" />
                          {isPaused ? "Duraklatıldı" : "Kaydediliyor"} ·{" "}
                          {recordingSec} sn
                        </span>
                        <button
                          type="button"
                          onClick={handlePauseResumeRecording}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                        >
                          {isPaused ? (
                            <>
                              <Play className="h-3.5 w-3.5" />
                              <span>Devam Et</span>
                            </>
                          ) : (
                            <>
                              <Pause className="h-3.5 w-3.5" />
                              <span>Duraklat</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={handleStopRecording}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white"
                        >
                          <MicOff className="h-3.5 w-3.5" />
                          <span>Kaydı Tamamla</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {micError && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {micError}
                  </div>
                )}

                {recordedAudioDataUrl && (
                  <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
                    <span className="text-xs font-bold text-emerald-900">
                      ✓ Ses Kaydı Hazır:
                    </span>
                    <audio
                      controls
                      src={recordedAudioDataUrl}
                      className="h-8 max-w-[240px]"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Sesli Not Metin Dökümü / Saha Tespit Notu (Düzenlenebilir):
                  </label>
                  <textarea
                    rows={3}
                    value={liveTranscript}
                    onChange={(e) => setLiveTranscript(e.target.value)}
                    placeholder="Mikrofonla konuştuğunuz metin buraya aktarılır veya doğrudan saha notunuzu yazabilirsiniz..."
                    className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 focus:border-[#246B73] focus:outline-none"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveVoiceNoteEntry}
                    disabled={!liveTranscript.trim() && !recordedAudioDataUrl}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#246B73] px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Sesli Notu Dosyaya Ekle</span>
                  </button>
                </div>
              </div>

              {/* Genel Keşif Notu */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  Dosya Genel Keşif Notu:
                </label>
                <textarea
                  rows={2}
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  placeholder="Keşif kartında görünen ana not..."
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900"
                />
              </div>

              {/* Kayıtlı Sesli Notlar Listesi */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-800">
                  Bu Keşfe Bağlı Sesli Notlar ({voiceNotes.length})
                </div>
                {voiceNotes.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                    Henüz kaydedilmiş sesli not bulunmuyor.
                  </div>
                ) : (
                  voiceNotes.map((vn) => (
                    <div
                      key={vn.id}
                      className="rounded-xl border border-slate-200 bg-white p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-mono font-semibold">
                          {vn.createdAt} {vn.author ? `· ${vn.author}` : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteVoiceNote(vn.id)}
                          className="text-slate-400 hover:text-rose-600"
                          title="Sesli notu sil"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-900 whitespace-pre-wrap">
                        {vn.transcript}
                      </p>
                      {vn.audioDataUrl && (
                        <audio
                          controls
                          src={vn.audioDataUrl}
                          className="h-8 w-full max-w-xs"
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeSubTab === "photos" && (
            <div className="space-y-4">
              {/* Kamera ve Galeri Ekleme Alanı */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="text-xs font-bold text-slate-900">
                  Kameradan veya Galeriden Saha Fotoğrafı Ekle
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12 items-end">
                  <div className="sm:col-span-7">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Fotoğraf Açıklaması (İsteğe Bağlı)
                    </label>
                    <input
                      type="text"
                      value={photoCaptionInput}
                      onChange={(e) => setPhotoCaptionInput(e.target.value)}
                      placeholder="Örn: Kuzey cephe sınır taşı, fındık bahçesi eğimi, araç ön tampon..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                  <div className="sm:col-span-5 flex items-center gap-2">
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoFileChange}
                      className="hidden"
                    />
                    <input
                      ref={galleryInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={isProcessingPhoto}
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#246B73] px-3 py-2 text-xs font-bold text-white"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>Kamera</span>
                    </button>
                    <button
                      type="button"
                      disabled={isProcessingPhoto}
                      onClick={() => galleryInputRef.current?.click()}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>Galeri</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Fotoğraf Galerisi */}
              {photos.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center space-y-1.5">
                  <ImageIcon className="mx-auto h-7 w-7 text-slate-400" />
                  <div className="text-xs font-semibold text-slate-700">
                    Bu keşif dosyasına henüz fotoğraf eklenmedi
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Kameradan veya telefon galerisinden çektiğiniz fotoğraflar tarih damgasıyla saklanır.
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {photos.map((ph) => (
                    <div
                      key={ph.id}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-white flex flex-col"
                    >
                      <img
                        src={ph.dataUrl}
                        alt={ph.caption}
                        className="h-44 w-full object-cover bg-slate-100"
                      />
                      <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                        <div>
                          <input
                            type="text"
                            value={ph.caption}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPhotos((prev) =>
                                prev.map((p) =>
                                  p.id === ph.id ? { ...p, caption: val } : p
                                )
                              );
                            }}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-900"
                          />
                          <div className="mt-1 font-mono text-[10px] text-slate-500">
                            Tarih: {ph.takenAt}
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                          <label className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={ph.includeInReport !== false}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setPhotos((prev) =>
                                  prev.map((p) =>
                                    p.id === ph.id
                                      ? { ...p, includeInReport: checked }
                                      : p
                                  )
                                );
                              }}
                              className="h-3.5 w-3.5 rounded text-[#246B73]"
                            />
                            <span>PDF / Rapor Ekine Dahil Et</span>
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setPhotos((prev) =>
                                prev.filter((p) => p.id !== ph.id)
                              )
                            }
                            className="text-xs font-semibold text-rose-600 hover:underline"
                          >
                            Sil
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSubTab === "history" && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-900">
                Keşif Dosyası İşlem ve Durum Geçmişi
              </div>
              <div className="space-y-2">
                {historyLog.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">
                        {item.action}
                      </div>
                      {item.actor && (
                        <div className="text-[11px] text-slate-500">
                          İşlemi Yapan: {item.actor}
                        </div>
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-slate-500 shrink-0">
                      {item.timestamp}
                    </span>
                  </div>
                ))}
                <div className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">
                      Keşif dosyası oluşturuldu ({record.esasNo})
                    </div>
                    {record.createdBy && (
                      <div className="text-[11px] text-slate-500">
                        Ekleyen: {record.createdBy}
                      </div>
                    )}
                  </div>
                  <span className="font-mono text-[11px] text-slate-500 shrink-0">
                    {record.createdAt
                      ? new Date(record.createdAt).toLocaleString("tr-TR")
                      : formatDateTR(record.date)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Alt Aksiyon Çubuğu */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5 shrink-0">
          <span className="text-[11px] text-slate-500">
            {voiceNotes.length} Sesli Not · {photos.length} Fotoğraf
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                stopAllRecordingStreams();
                onClose();
              }}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleSaveAllToRecord}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#246B73] px-4 py-2 text-xs font-bold text-white shadow-xs"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Değişiklikleri Keşfe Kaydet</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
