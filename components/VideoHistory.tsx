"use client";

import { Play, Trash2, Download, ImageIcon, Loader2, Clock } from "lucide-react";
import { memo, useState } from "react";
import VideoPlayer from "./VideoPlayer";

export interface VideoHistoryItem {
  id: string;
  prompt: string;
  model_id: string;
  aspect_ratio: string;
  duration?: number;
  motion?: string;
  quality?: string;
  reference_image_url?: string | null;
  video_url: string;
  status: "processing" | "completed" | "failed";
  tokens_used: number;
  created_at: string;
  error_message?: string | null;
}

interface VideoHistoryProps {
  items: VideoHistoryItem[];
  onRegenerate?: (item: VideoHistoryItem) => void;
  onDelete?: (id: string) => void;
  emptyMessage?: string;
}

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case "completed":
      return "Selesai";
    case "processing":
      return "Memproses...";
    case "failed":
      return "Gagal";
    default:
      return status;
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case "completed":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "processing":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "failed":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    default:
      return "bg-neutral-500/20 text-neutral-400 border-neutral-500/30";
  }
};

const VideoHistoryCard = memo(function VideoHistoryCard({
  item,
  onPlay,
  onRegenerate,
  onDelete,
}: {
  item: VideoHistoryItem;
  onPlay: (item: VideoHistoryItem) => void;
  onRegenerate?: (item: VideoHistoryItem) => void;
  onDelete?: (id: string) => void;
}) {
  const [showPlayer, setShowPlayer] = useState(false);

  if (item.status === "processing") {
    return (
      <div className="group relative aspect-video bg-neutral-900/50 rounded-xl border border-neutral-700 overflow-hidden flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-primary" />
            <p className="text-white font-medium">Memproses video...</p>
            <p className="text-xs text-neutral-400 mt-1">{item.prompt.slice(0, 60)}...</p>
          </div>
        </div>
        <div className="p-3 bg-black/50 border-t border-neutral-800">
          <div className="flex items-center justify-between text-xs">
            <span className={`px-2 py-0.5 rounded-full border ${statusColor(item.status)}`}>
              <Clock size={10} className="inline-block mr-1" />
              {statusLabel(item.status)}
            </span>
            <span className="text-neutral-400">{formatDate(item.created_at)}</span>
          </div>
        </div>
      </div>
    );
  }

  if (item.status === "failed") {
    return (
      <div className="group relative aspect-video bg-red-900/20 rounded-xl border border-red-500/30 overflow-hidden flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-red-400">
            <p className="font-medium">Gagal membuat video</p>
            <p className="text-xs mt-1 max-w-xs mx-auto">{item.error_message || "Terjadi kesalahan"}</p>
          </div>
        </div>
        <div className="p-3 bg-black/50 border-t border-neutral-800">
          <div className="flex items-center justify-between text-xs">
            <span className={`px-2 py-0.5 rounded-full border ${statusColor(item.status)}`}>
              {statusLabel(item.status)}
            </span>
            <span className="text-neutral-400">{formatDate(item.created_at)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative bg-neutral-900/50 rounded-xl border border-neutral-700 overflow-hidden flex flex-col h-full">
      {/* Video preview / poster */}
      <div className="relative aspect-video bg-black overflow-hidden">
        {showPlayer ? (
          <VideoPlayer
            src={item.video_url}
            poster={item.reference_image_url || undefined}
            title={item.prompt.slice(0, 50)}
            autoPlay
            loop
            muted
            className="w-full h-full"
          />
        ) : (
          <>
            {item.reference_image_url && (
              <img
                src={item.reference_image_url}
                alt="Reference"
                className="w-full h-full object-cover opacity-60"
              />
            )}
            <button
              onClick={() => setShowPlayer(true)}
              className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
              aria-label="Putar video"
            >
              <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                <Play size={32} className="ml-1 text-black" />
              </div>
            </button>
          </>
        )}
        {/* Status badge */}
        <div className="absolute top-2 left-2">
          <span className={`px-2 py-0.5 rounded-full border text-xs ${statusColor(item.status)}`}>
            {statusLabel(item.status)}
          </span>
        </div>
        {/* Tokens used */}
        <div className="absolute top-2 right-2 bg-black/60 px-2 py-0.5 rounded-full text-xs text-neutral-300">
          {item.tokens_used} Token
        </div>
      </div>

      {/* Info panel */}
      <div className="p-3 flex-1 flex flex-col min-h-0">
        <p className="text-white text-sm line-clamp-2 mb-2">{item.prompt}</p>

        <div className="flex flex-wrap gap-1.5 mb-2 text-[11px] text-neutral-400">
          <span className="px-1.5 py-0.5 rounded bg-neutral-800">{item.model_id}</span>
          <span className="px-1.5 py-0.5 rounded bg-neutral-800">{item.aspect_ratio}</span>
          {item.duration && <span className="px-1.5 py-0.5 rounded bg-neutral-800">{item.duration}s</span>}
          {item.motion && <span className="px-1.5 py-0.5 rounded bg-neutral-800">{item.motion}</span>}
          {item.quality && <span className="px-1.5 py-0.5 rounded bg-neutral-800">{item.quality}</span>}
        </div>

        <div className="mt-auto flex items-center justify-between pt-2 border-t border-neutral-800">
          <span className="text-xs text-neutral-500">{formatDate(item.created_at)}</span>
          <div className="flex items-center gap-1.5">
            {onRegenerate && (
              <button
                onClick={() => onRegenerate(item)}
                className="p-1.5 rounded hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-white"
                title="Generate ulang"
              >
                <Play size={14} />
              </button>
            )}
            <button
              onClick={() => setShowPlayer(true)}
              className="p-1.5 rounded hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-white"
              title="Putar"
            >
              <Play size={14} />
            </button>
            <a
              href={item.video_url}
              download={`video-${item.id.slice(0, 8)}.mp4`}
              className="p-1.5 rounded hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-white"
              title="Unduh"
            >
              <Download size={14} />
            </a>
            {onDelete && (
              <button
                onClick={() => onDelete(item.id)}
                className="p-1.5 rounded hover:bg-red-900/30 hover:text-red-400 transition-colors text-neutral-400"
                title="Hapus"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default function VideoHistory({ items, onRegenerate, onDelete, emptyMessage = "Belum ada video yang di-generate." }: VideoHistoryProps) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <ImageIcon className="w-16 h-16 text-neutral-600 dark:text-neutral-400 mb-4" />
        <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-1">Belum ada riwayat</h3>
        <p className="text-neutral-500 dark:text-neutral-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map((item) => (
        <VideoHistoryCard
          key={item.id}
          item={item}
          onPlay={() => {}}
          onRegenerate={onRegenerate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}