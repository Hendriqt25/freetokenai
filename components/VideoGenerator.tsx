"use client";

import { ChevronDown, Clock, Download, ImageIcon, Loader2, RotateCcw, Sparkles, Trash2, VideoIcon, X, Zap } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { loadMediaHistory, removeMediaAsset, type MediaSession } from "@/lib/media-history";
import {
  MEDIA_HISTORY_CHANGED,
  MEDIA_JOBS_CHANGED,
  clearMediaJobsError,
  getMediaJobsError,
  listMediaJobs,
  startMediaJob,
  subscribeMediaJobs,
  type MediaJobState,
} from "@/lib/media-jobs";
import ModelPicker from "./ModelPicker";
import PillSelect from "./PillSelect";

type VideoMode = "t2v" | "i2v";

const VIDEO_MODELS = [
  { id: "veo-3.1-lite", credits: 5 },
  { id: "veo-3.1-fast", credits: 40 },
  { id: "veo-3.1-quality", credits: 200 },
];

const RATIOS = ["16:9", "9:16", "1:1"] as const;
const DURATIONS = [5, 10] as const;
const MOTIONS = [
  { value: "low", label: "Low — Gerakan halus" },
  { value: "medium", label: "Medium — Gerakan seimbang" },
  { value: "high", label: "High — Gerakan dinamis" },
] as const;
const QUALITIES = ["720p", "1080p"] as const;
const FPS_OPTIONS = [24, 30] as const;

const EXAMPLES_T2V = [
  "Kamera mendekat perlahan ke rumah di tepi danau, kabut pagi",
  "Uap mengepul dari mangkok ramen, close-up sinematik",
  "Barista menuang latte art, slow motion 4K",
  "Drone terbang di atas sawah saat matahari terbit",
  "Kota futuristik saat hujan neon di malam hari, sinematik",
];

const EXAMPLES_I2V = [
  "Kamera zoom-in perlahan ke wajah subjek",
  "Subjek bergerak ke kiri sambil tersenyum",
  "Pan kamera mengikuti gerakan tangan",
  "Efek zoom-out dramatis dari detail ke pemandangan luas",
];

const MAX_LEN = 5000;

// Vio menolak prompt kosong walau mode i2v, jadi beri gerakan default yang aman.
const DEFAULT_I2V_PROMPT = "Gerakan kamera halus dan natural, subjek bergerak perlahan";

type FeedItem = { url: string; prompt: string; model: string; session: MediaSession; mode?: VideoMode };

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

function expiryLabel(iso: string): string {
  const daysLeft = Math.ceil((new Date(iso).getTime() + 30 * 86400000 - Date.now()) / 86400000);
  return daysLeft > 0 ? `Kedaluwarsa ${daysLeft} hari lagi` : "Sudah kedaluwarsa";
}

export default function VideoGenerator() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string>(VIDEO_MODELS[0].id);
  const [ratio, setRatio] = useState(RATIOS[0]);
  const [duration, setDuration] = useState<number>(DURATIONS[0]);
  const [motion, setMotion] = useState<string>(MOTIONS[1].value);
  const [quality, setQuality] = useState<string>(QUALITIES[0]);
  const [fps, setFps] = useState<number>(FPS_OPTIONS[1]);
  const [mode, setMode] = useState<VideoMode>("t2v");
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [catalogModels, setCatalogModels] = useState<{ id: string; label?: string; credits: number; provider?: string }[]>(VIDEO_MODELS);
  const [history, setHistory] = useState<MediaSession[]>([]);
  const [pending, setPending] = useState<MediaJobState[]>(() => listMediaJobs("video"));
  const [error, setError] = useState(() => getMediaJobsError());
  const [selected, setSelected] = useState<FeedItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);

  const models = catalogModels.length ? catalogModels : (VIDEO_MODELS as { id: string; credits: number; label?: string; provider?: string }[]);
  const credits = models.find((m) => m.id === model)?.credits ?? 0;
  const valid = mode === "t2v" ? prompt.trim().length > 0 : referenceImage !== null;

  // Fetch catalog models
  useEffect(() => {
    let alive = true;
    import("@/lib/model-catalog").then(({ fetchCatalogModels }) =>
      fetchCatalogModels("video").then((list) => {
        if (!alive) return;
        setCatalogModels(list.map((m) => ({ id: m.id, label: m.label, credits: m.cost, provider: m.provider })));
        if (list.length) setModel((cur) => (list.some((m) => m.id === cur) ? cur : list[0].id));
      }),
    );
    return () => { alive = false; };
  }, []);

  // Load history
  useEffect(() => {
    setHistory(loadMediaHistory("video"));
    setPending(listMediaJobs("video"));
    setError(getMediaJobsError());
  }, []);

  // Subscribe to job/history changes
  useEffect(() => {
    const refresh = () => {
      setPending(listMediaJobs("video"));
      setError(getMediaJobsError());
    };
    const refreshHistory = () => setHistory(loadMediaHistory("video"));
    const unsub = subscribeMediaJobs(refresh);
    window.addEventListener(MEDIA_JOBS_CHANGED, refresh);
    window.addEventListener(MEDIA_HISTORY_CHANGED, refreshHistory);
    return () => {
      unsub();
      window.removeEventListener(MEDIA_JOBS_CHANGED, refresh);
      window.removeEventListener(MEDIA_HISTORY_CHANGED, refreshHistory);
    };
  }, []);

  // Close modal/panel on Escape
  useEffect(() => {
    if (!selected && !settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSelected(null);
      setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, settingsOpen]);

  // Build feed from history
  const feed: FeedItem[] = history.flatMap((s) =>
    (s.asset_urls ?? (s.asset_url ? [s.asset_url] : [])).map((url) => ({
      url,
      prompt: s.prompt,
      model: s.model,
      session: s,
      mode: s.reference_image_url ? "i2v" : "t2v",
    }))
  );

  function fillRandom() {
    const examples = mode === "t2v" ? EXAMPLES_T2V : EXAMPLES_I2V;
    const pick = examples[Math.floor(Math.random() * examples.length)];
    setPrompt(pick);
  }

  function recreate(item: FeedItem) {
    setPrompt(item.prompt);
    setModel(item.session.model);
    setRatio(item.session.ratio as typeof ratio);
    setDuration(item.session.duration ?? 5);
    setMotion(item.session.motion ?? "medium");
    setQuality(item.session.quality ?? "720p");
    setFps(item.session.fps ?? 30);
    setMode(item.mode ?? "t2v");
    if (item.mode === "i2v" && item.session.reference_image_url) {
      alert("Untuk regenerate Image-to-Video, silakan unggah ulang gambar referensinya.");
    }
    setSelected(null);
  }

  function removeItem(item: FeedItem) {
    setHistory(removeMediaAsset("video", item.session.id, item.url));
    setSelected(null);
  }

  function applyReferenceFile(file: File | undefined | null) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageError("Format gambar harus JPG, PNG, atau WebP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImageError("Ukuran gambar maksimal 10 MB.");
      return;
    }
    if (referenceImagePreview) URL.revokeObjectURL(referenceImagePreview);
    setImageError("");
    setReferenceImage(file);
    setReferenceImagePreview(URL.createObjectURL(file));
  }

  function handleReferenceImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    applyReferenceFile(e.target.files?.[0]);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragging(false);
    applyReferenceFile(e.dataTransfer.files?.[0]);
  }

  function removeReferenceImage() {
    if (referenceImagePreview) URL.revokeObjectURL(referenceImagePreview);
    setReferenceImage(null);
    setReferenceImagePreview(null);
    setImageError("");
  }

  async function handleCreate() {
    if (!valid) return;
    const sent = prompt.trim() || (mode === "i2v" ? DEFAULT_I2V_PROMPT : "");
    const styledPrompt = sent;
    setPrompt("");
    if (mode === "i2v") removeReferenceImage();
    clearMediaJobsError();
    setError("");

    const formData = new FormData();
    formData.append("prompt", styledPrompt);
    formData.append("model", model);
    formData.append("aspect_ratio", ratio);
    formData.append("duration", String(duration));
    formData.append("motion", motion);
    formData.append("quality", quality);
    formData.append("fps", String(fps));
    formData.append("mode", mode);
    if (referenceImage) formData.append("image", referenceImage);

    startMediaJob({
      kind: "video",
      sent: styledPrompt,
      styledPrompt,
      model,
      ratio,
      count: 1,
      formData,
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-neutral-950">
      <header className="px-4 pt-4 md:px-6 md:pt-5">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">Bikin Video</h1>
        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
          {mode === "t2v" ? "Teks ke video" : "Gambar ke video"} via VioStudio & Gemini Veo.
        </p>
      </header>

      {/* Feed galeri */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
        {feed.length === 0 && pending.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
              <VideoIcon size={24} />
            </div>
            <h2 className="text-lg font-medium text-neutral-900 dark:text-white">Belum ada video</h2>
            <p className="max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
              Pilih mode, tulis prompt/unggah gambar, lalu tekan Buat — atau klik contoh di bawah.
            </p>
            <div className="mt-2 flex w-full max-w-md flex-col gap-2">
              {(mode === "t2v" ? EXAMPLES_T2V : EXAMPLES_I2V).map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setPrompt(ex)}
                  className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-left text-sm text-neutral-700 transition hover:border-primary hover:text-primary dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {(feed.length > 0 || pending.length > 0) && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {pending.flatMap((p) =>
              Array.from({ length: p.count }).map((_, i) => (
                <div
                  key={`${p.key}-${i}`}
                  className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-center dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <Loader2 size={20} className="animate-spin text-primary" />
                  <p className="line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">{p.text}</p>
                  <span className="text-[10px] text-neutral-400">Memproses...</span>
                </div>
              ))
            )}
            {feed.map((item, i) => (
              <button
                key={`${item.session.id}-${i}`}
                type="button"
                onClick={() => setSelected(item)}
                title={`${item.prompt} — klik untuk lihat detail`}
                className="group relative overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 text-left dark:border-neutral-800 dark:bg-neutral-900"
              >
                <video
                  src={item.url}
                  controls
                  preload="metadata"
                  className="aspect-video w-full bg-black object-cover"
                />
                <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] font-medium text-white">
                  <VideoIcon size={11} />
                  Video
                </span>
                <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] text-white opacity-0 transition group-hover:opacity-100">
                  <Download size={11} />
                  <a href={item.url} download target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    Unduh
                  </a>
                </span>
                <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white">
                  {item.mode === "i2v" ? <ImageIcon size={10} /> : <VideoIcon size={10} />}
                  {item.mode === "i2v" ? "I2V" : "T2V"}
                </span>
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="mx-4 mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-600 md:mx-6 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            Gagal: {error}
          </p>
        )}
      </div>

      {/* Composer floating */}
      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6 md:pb-5">
        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-neutral-200 bg-neutral-50 p-3 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-center gap-2">
            <ModelPicker
              models={models.map((m) => ({ id: m.id, label: m.label ?? m.id, cost: m.credits, provider: m.provider }))}
              value={model}
              onChange={setModel}
              priceNote="per video"
            />

            <PillSelect value={ratio} options={RATIOS} onChange={(v) => setRatio(v as typeof ratio)} label="Rasio" />

            <div className="relative">
              <button
                type="button"
                onClick={() => setSettingsOpen((o) => !o)}
                aria-expanded={settingsOpen}
                className="flex h-9 items-center gap-1 rounded-full border border-neutral-200 pl-3 pr-2 text-xs text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Pengaturan
                <ChevronDown size={12} className={`transition ${settingsOpen ? "rotate-180" : ""}`} />
              </button>
              {settingsOpen && (
                <>
                  <div className="fixed inset-0 z-[90]" onClick={() => setSettingsOpen(false)} aria-hidden="true" />
                  <div className="fixed bottom-24 left-4 z-[100] w-[calc(100vw-2rem)] max-w-72 rounded-xl border border-neutral-200 bg-white p-3 shadow-2xl sm:left-1/2 sm:-translate-x-1/2 dark:border-neutral-700 dark:bg-neutral-900">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-neutral-500 mb-1">Durasi</label>
                        <select
                          value={duration}
                          onChange={(e) => setDuration(Number(e.target.value))}
                          className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                        >
                          {DURATIONS.map((d) => <option key={d} value={d}>{d}s</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-neutral-500 mb-1">Motion</label>
                        <select
                          value={motion}
                          onChange={(e) => setMotion(e.target.value as typeof motion)}
                          className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                        >
                          {MOTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-neutral-500 mb-1">Kualitas</label>
                        <select
                          value={quality}
                          onChange={(e) => setQuality(e.target.value as typeof quality)}
                          className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                        >
                          {QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-neutral-500 mb-1">FPS</label>
                        <select
                          value={fps}
                          onChange={(e) => setFps(Number(e.target.value))}
                          className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                        >
                          {FPS_OPTIONS.map((f) => <option key={f} value={f}>{f}fps</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={fillRandom}
              className="flex h-9 items-center gap-1 rounded-full border border-neutral-200 pl-3 pr-2 text-xs text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <Sparkles size={12} />
              Ide acak
            </button>
          </div>

          {/* Input area: layout sama dengan Bikin Gambar */}
          <div className="mt-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleReferenceImageUpload}
              className="hidden"
            />
            {mode === "i2v" && (
              <div className="mb-2">
                {referenceImagePreview ? (
                  <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-800">
                    <img src={referenceImagePreview} alt="Gambar referensi" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-neutral-900 dark:text-white">{referenceImage?.name ?? "Gambar referensi"}</p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Jadi bingkai pertama video</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary/10"
                    >
                      Ganti
                    </button>
                    <button
                      type="button"
                      onClick={removeReferenceImage}
                      className="shrink-0 rounded-lg p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-red-500 dark:hover:bg-neutral-700"
                      aria-label="Hapus gambar"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-xs transition ${
                      dragging
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-neutral-300 text-neutral-500 hover:border-primary/50 dark:border-neutral-600 dark:text-neutral-400"
                    }`}
                  >
                    <ImageIcon size={14} />
                    Klik atau tarik gambar referensi (JPG/PNG/WebP, maks 10 MB)
                  </button>
                )}
                {imageError && <p className="mt-1 text-xs text-red-500">{imageError}</p>}
              </div>
            )}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, MAX_LEN))}
              placeholder={
                mode === "t2v"
                  ? "Jelaskan skenario video: subjek, gerakan kamera, lighting, gaya visual..."
                  : "Gerakan (opsional): 'kamera zoom-in perlahan', 'subjek berjalan ke kiri'..."
              }
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              className="block w-full resize-none bg-transparent px-1 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-white"
            />

            {/* Bar bawah: mode · durasi · Token · kirim — sama posisinya dengan studio gambar */}
            <div className="mt-1 flex items-end justify-between gap-2 px-1">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                <span className="inline-flex gap-1 rounded-lg bg-neutral-200 p-0.5 dark:bg-neutral-800">
                  {([["t2v", "Teks"], ["i2v", "Gambar"]] as const).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMode(m);
                        if (m === "t2v") removeReferenceImage();
                      }}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                        mode === m
                          ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white"
                          : "text-neutral-600 dark:text-neutral-300"
                      }`}
                    >
                      {label} → Video
                    </button>
                  ))}
                </span>
                <span>{duration}s</span>
                <span className="flex items-center gap-1">
                  <Zap size={12} className="text-primary" />
                  {credits} Token
                </span>
                <span className="hidden sm:inline">{prompt.length} / {MAX_LEN.toLocaleString("id-ID")}</span>
              </div>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!valid}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles size={15} />
                Buat
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal detail */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center md:p-4"
          onClick={() => setSelected(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Detail video"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-neutral-900 text-white shadow-2xl md:flex-row md:rounded-2xl"
          >
            <div className="flex min-h-0 flex-1 items-center justify-center bg-black relative">
              <video
                ref={videoPlayerRef}
                src={selected.url}
                controls
                autoPlay
                loop
                muted
                className="max-h-[50vh] w-full bg-black md:max-h-[90vh]"
              />
              <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white">
                <VideoIcon size={10} />
                {selected.mode === "i2v" ? "I2V" : "T2V"}
              </div>
            </div>
            <div className="flex w-full flex-col gap-4 overflow-y-auto p-6 md:w-80 md:shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-green-500/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-green-400 border border-green-500/30">
                    Selesai
                  </span>
                  <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-neutral-300">
                    {selected.mode === "i2v" ? "Gambar ke Video" : "Teks ke Video"}
                  </span>
                </div>
                <button type="button" onClick={() => setSelected(null)} aria-label="Tutup" className="rounded-full p-1.5 text-neutral-400 transition hover:bg-neutral-800 hover:text-white">
                  <X size={16} />
                </button>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Prompt</p>
                <p className="mt-1 text-sm text-neutral-200">{selected.prompt}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Model</p>
                  <p className="mt-1 text-sm font-semibold">{selected.session.model}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Rasio</p>
                  <p className="mt-1 text-sm font-semibold">{selected.session.ratio}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Durasi</p>
                  <p className="mt-1 text-sm font-semibold">{selected.session.duration ?? 5}s</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Kredit</p>
                  <p className="mt-1 flex items-center gap-1 text-sm font-semibold">
                    <Zap size={12} className="text-primary" />
                    {models.find((m) => m.id === selected.session.model)?.credits ?? "-"}
                  </p>
                </div>
              </div>
              <p className="text-xs text-neutral-500">{expiryLabel(selected.session.created_at)}</p>
              <a href={selected.url} download target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-hover">
                <Download size={15} />
                Unduh MP4
              </a>
              <button type="button" onClick={() => recreate(selected)} className="flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800">
                <RotateCcw size={14} />
                Buat Ulang
              </button>
              <button type="button" onClick={() => removeItem(selected)} className="flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm text-neutral-500 transition hover:bg-neutral-800 hover:text-red-400">
                <Trash2 size={14} />
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
