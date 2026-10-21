"use client";

import { Maximize, Minimize, Play, Pause, RotateCcw, Download, Volume2, VolumeX } from "lucide-react";
import { useRef, useState, useEffect, useCallback } from "react";

interface VideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  className?: string;
}

export default function VideoPlayer({
  src,
  poster,
  title,
  autoPlay = false,
  loop = false,
  muted = false,
  className = "",
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
    setVolume(isMuted ? volume : 0);
  };

  const toggleLoop = () => {
    if (!videoRef.current) return;
    videoRef.current.loop = !videoRef.current.loop;
  };

  const toggleFullscreen = async () => {
    if (!videoRef.current) return;
    if (!isFullscreen) {
      try {
        await videoRef.current.requestFullscreen();
        setIsFullscreen(true);
      } catch {}
    } else {
      try {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } catch {}
    }
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = src;
    a.download = title || `video-${Date.now()}.mp4`;
    a.click();
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const time = Number(e.target.value);
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const vol = Number(e.target.value);
    videoRef.current.volume = vol;
    videoRef.current.muted = vol === 0;
    setVolume(vol);
    setIsMuted(vol === 0);
  };

  const resetControlsTimer = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = isMuted;
    video.loop = loop;
    if (autoPlay) video.play().catch(() => {});
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [autoPlay, loop, isMuted]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  return (
    <div
      className={`relative w-full aspect-video bg-black rounded-xl overflow-hidden ${className}`}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onMouseMove={resetControlsTimer}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        playsInline
        className="w-full h-full object-contain"
      />

      {/* Overlay play button */}
      {!isPlaying && !isFullscreen && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors z-10"
          aria-label="Putar"
        >
          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-xl">
            <Play size={28} className="ml-1 text-black" />
          </div>
        </button>
      )}

      {/* Controls overlay */}
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-20 transition-opacity duration-200">
          {/* Progress bar */}
          <div className="mb-2">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1.5 appearance-none bg-white/30 rounded-full accent-primary cursor-pointer"
              aria-label="Seek"
            />
            <div className="flex justify-between text-xs text-white/70 mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
                aria-label={isPlaying ? "Jeda" : "Putar"}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>

              <button
                onClick={toggleMute}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
                aria-label={isMuted ? "Bunyikan" : "Bisukan"}
              >
                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={volume}
                onChange={handleVolumeChange}
                className="w-20 h-1.5 appearance-none bg-white/30 rounded-full accent-primary cursor-pointer"
                aria-label="Volume"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleLoop}
                className={`p-2 rounded-full transition-colors text-white ${
                  videoRef.current?.loop
                    ? "bg-primary/50 text-primary"
                    : "bg-white/10 hover:bg-white/20"
                }`}
                aria-label="Loop"
                title="Loop"
              >
                <RotateCcw size={20} />
              </button>

              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
                aria-label={isFullscreen ? "Keluar fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </button>

              <button
                onClick={handleDownload}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
                aria-label="Unduh MP4"
              >
                <Download size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Title */}
      {title && (
        <div className="absolute top-3 left-3 right-3 text-white text-sm font-medium truncate bg-black/50 px-2 py-1 rounded">
          {title}
        </div>
      )}
    </div>
  );
}