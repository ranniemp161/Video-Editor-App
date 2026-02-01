
import React, { useRef, useEffect } from 'react';
import { Asset, TimelineClip } from '../types';

interface PreviewProps {
  clip: { clip: TimelineClip; asset: Asset } | null;
  playheadPosition: number;
  isPlaying: boolean;
}

export const Preview: React.FC<PreviewProps> = ({ clip, playheadPosition, isPlaying }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (clip) {
      if (video.src !== clip.asset.src) {
        video.src = clip.asset.src;
      }
      const clipTime = playheadPosition - clip.clip.start + clip.clip.trimStart;
      
      // A small tolerance to prevent jittering from frequent seeks
      if (Math.abs(video.currentTime - clipTime) > 0.1) {
        video.currentTime = clipTime;
      }

      if (isPlaying && video.paused) {
        video.play().catch(e => console.error("Playback error:", e));
      } else if (!isPlaying && !video.paused) {
        video.pause();
      }
    } else {
      video.pause();
      video.src = '';
    }
  }, [clip, playheadPosition, isPlaying]);

  return (
    <div className="w-full h-full bg-black flex items-center justify-center flex-grow">
      {clip ? (
        <video ref={videoRef} className="max-w-full max-h-full" muted />
      ) : (
        <div className="text-gray-500">Timeline is empty</div>
      )}
    </div>
  );
};
