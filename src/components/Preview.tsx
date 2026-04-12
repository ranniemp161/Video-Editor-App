
import React, { useRef, useEffect, useMemo } from 'react';
import { Asset, TimelineClip } from '../types';

interface PreviewProps {
  clip: { clip: TimelineClip; asset: Asset } | null;
  playheadPosition: number;
  isPlaying: boolean;
}

export const PreviewComponent: React.FC<PreviewProps> = ({ clip, playheadPosition, isPlaying }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSeekTimeRef = useRef<number>(0);

  // Stable references — prevents useEffect from re-running when parent re-renders
  // but clip values haven't actually changed
  const clipId = clip?.clip.id ?? null;
  const clipStart = clip?.clip.start ?? 0;
  const clipTrimStart = clip?.clip.trimStart ?? 0;
  const clipVolume = clip?.clip.volume ?? 100;
  const clipOpacity = clip?.clip.opacity ?? 100;

  // Priority: proxy (smooth 480p) > local blob (original, laggy on large files) > remoteSrc (fallback after reload)
  const videoSrc = useMemo(() => {
    if (!clip?.asset) return null;
    return clip.asset.proxySrc || clip.asset.src || clip.asset.remoteSrc || null;
  }, [clip?.asset?.proxySrc, clip?.asset?.src, clip?.asset?.remoteSrc]);

  const isGeneratingProxy = clip?.asset?.isGeneratingProxy ?? false;

  // Source change: only swap src when the clip itself changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!videoSrc) {
      video.pause();
      video.src = '';
      return;
    }
    if (video.src !== videoSrc) {
      video.src = videoSrc;
      video.load();
    }
  }, [videoSrc]);

  // Playback control: separated from source so seeks don't cause src reloads
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    const clipTime = playheadPosition - clipStart + clipTrimStart;

    // When playing: allow 0.5s drift before correcting (let video run naturally)
    // When scrubbing/paused: seek precisely but throttle to 80ms to avoid seek spam
    const threshold = isPlaying ? 0.5 : 0.08;
    const timeDrift = Math.abs(video.currentTime - clipTime);
    const now = performance.now();
    const canSeek = isPlaying || (now - lastSeekTimeRef.current > 80);

    if (timeDrift > threshold && canSeek) {
      video.currentTime = clipTime;
      lastSeekTimeRef.current = now;
    }

    video.volume = clipVolume / 100;
    video.style.opacity = (clipOpacity / 100).toString();

    if (isPlaying && video.paused) {
      video.play().catch(() => {});
    } else if (!isPlaying && !video.paused) {
      video.pause();
    }
  }, [playheadPosition, isPlaying, clipStart, clipTrimStart, clipVolume, clipOpacity, videoSrc]);

  return (
    <div className="w-full h-full bg-[#0a0a0a] flex items-center justify-center flex-grow relative overflow-hidden">
      {videoSrc ? (
        <video
          ref={videoRef}
          className="max-w-full max-h-full shadow-2xl shadow-black"
          preload="auto"
          playsInline
        />
      ) : (
        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
          <div className="w-24 h-24 rounded-full bg-[#1a1a1a] flex items-center justify-center border border-dashed border-gray-700">
            <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="text-center">
            <div className="text-gray-400 text-sm font-medium">
              {clip ? "Media Offline" : "Timeline is empty"}
            </div>
            {clip && (
              <div className="text-gray-600 text-[10px] uppercase mt-1 tracking-wider">
                Expected: {clip.clip.sourceFileName || clip.clip.name}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Playback Mask Overlay */}
      <div className="absolute inset-0 pointer-events-none border border-white/5"></div>

      {/* Proxy generation indicator */}
      {isGeneratingProxy && (
        <div style={{
          position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.7)', color: '#a78bfa', fontSize: '10px',
          fontWeight: 'bold', letterSpacing: '0.1em', padding: '4px 10px',
          borderRadius: '999px', border: '1px solid rgba(167,139,250,0.3)',
          display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap'
        }}>
          <svg style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          GENERATING SMOOTH PREVIEW...
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export const Preview = React.memo(PreviewComponent);
