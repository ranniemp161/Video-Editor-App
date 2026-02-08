
import React, { useRef, useEffect } from 'react';
import { Asset, TimelineClip } from '../types';

interface PreviewProps {
  clip: { clip: TimelineClip; asset: Asset } | null;
  playheadPosition: number;
  isPlaying: boolean;
}

export const Preview: React.FC<PreviewProps> = ({ clip, playheadPosition, isPlaying }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSeekTimeRef = useRef<number>(0);
  const lastClipIdRef = useRef<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (clip && clip.asset && clip.asset.src) {
      // Change video source only if clip changed
      if (video.src !== clip.asset.src) {
        video.src = clip.asset.src;
        lastClipIdRef.current = clip.clip.id;
      }

      const clipTime = playheadPosition - clip.clip.start + clip.clip.trimStart;

      // Use different thresholds for playing vs scrubbing
      // When playing: only seek if drift is > 0.5s (let video play naturally)
      // When scrubbing/paused: seek more precisely (0.1s threshold)
      const threshold = isPlaying ? 0.5 : 0.1;
      const timeDrift = Math.abs(video.currentTime - clipTime);

      // Prevent seek spam - minimum 50ms between seeks when scrubbing
      const now = performance.now();
      const canSeek = isPlaying || (now - lastSeekTimeRef.current > 50);

      if (timeDrift > threshold && canSeek) {
        video.currentTime = clipTime;
        lastSeekTimeRef.current = now;
      }

      video.volume = (clip.clip.volume ?? 100) / 100;
      video.style.opacity = ((clip.clip.opacity ?? 100) / 100).toString();

      if (isPlaying && video.paused) {
        video.play().catch(() => { }); // Silently ignore play errors
      } else if (!isPlaying && !video.paused) {
        video.pause();
      }
    } else {
      video.pause();
      if (video.src) video.src = '';
      lastClipIdRef.current = null;
    }
  }, [clip, playheadPosition, isPlaying]);

  return (
    <div className="w-full h-full bg-[#0a0a0a] flex items-center justify-center flex-grow relative overflow-hidden">
      {clip && clip.asset && clip.asset.src ? (
        <video
          ref={videoRef}
          className="max-w-full max-h-full transition-opacity duration-150 shadow-2xl shadow-black"
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
    </div>
  );
};
