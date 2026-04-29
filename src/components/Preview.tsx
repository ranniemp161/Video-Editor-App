
import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Asset, TimelineClip } from '../types';

interface PreviewProps {
  clip: { clip: TimelineClip; asset: Asset } | null;
  playheadPosition: number;
  isPlaying: boolean;
}

export const PreviewComponent: React.FC<PreviewProps> = ({ clip, playheadPosition, isPlaying }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSeekTimeRef = useRef<number>(0);
  // True when the browser rejected the current src due to an unsupported codec.
  // We hide the broken player and show the proxy-generating overlay instead.
  const [codecError, setCodecError] = useState(false);

  const clipId = clip?.clip.id ?? null;
  const clipStart = clip?.clip.start ?? 0;
  const clipTrimStart = clip?.clip.trimStart ?? 0;
  const clipVolume = clip?.clip.volume ?? 100;
  const clipOpacity = clip?.clip.opacity ?? 100;

  const proxySrc = clip?.asset?.proxySrc ?? null;

  // When the proxy arrives after a codec error, clear the error so the player
  // can switch to the now-supported H.264 source.
  useEffect(() => {
    if (proxySrc && codecError) setCodecError(false);
  }, [proxySrc]);

  // Source priority: proxy (H.264, universal) > blob (original codec) > remote fallback.
  // If the browser already errored on the blob, skip straight to remote/null so we
  // don't keep showing a broken element while the proxy is being generated.
  const videoSrc = useMemo(() => {
    if (!clip?.asset) return null;
    if (codecError) return proxySrc || null; // blob failed — wait for proxy
    return proxySrc || clip.asset.src || clip.asset.remoteSrc || null;
  }, [clip?.asset?.proxySrc, clip?.asset?.src, clip?.asset?.remoteSrc, codecError, proxySrc]);

  const isGeneratingProxy = clip?.asset?.isGeneratingProxy ?? false;

  // Show the transcoding overlay when:
  // a) proxy is actively generating, OR
  // b) the browser couldn't play the original and the proxy isn't ready yet
  const showTranscodingOverlay = isGeneratingProxy || (codecError && !proxySrc);

  const handleVideoError = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const code = video.error?.code;
    // MEDIA_ERR_SRC_NOT_SUPPORTED (4) = codec/container not supported
    // MEDIA_ERR_DECODE (3) = decoder failure (e.g. H.265 on Chrome)
    if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED || code === MediaError.MEDIA_ERR_DECODE) {
      console.warn(`[Preview] Codec not supported (error ${code}) — waiting for H.264 proxy`);
      setCodecError(true);
    }
  }, []);

  // Silent codec failure detection — some codecs (ProRes, DNxHD, certain HEVC-in-MOV)
  // don't fire onError at all. The browser parses the container metadata (so duration
  // loads fine) but renders black frames. videoWidth === 0 after loadeddata is the
  // reliable signal that the video track can't be decoded.
  const handleLoadedData = useCallback(() => {
    const video = videoRef.current;
    if (!video || proxySrc) return; // already on proxy — no need to check
    // Give the browser one extra frame to settle before reading videoWidth
    requestAnimationFrame(() => {
      if (videoRef.current && videoRef.current.videoWidth === 0) {
        console.warn('[Preview] videoWidth=0 after loadeddata — silent codec failure, waiting for H.264 proxy');
        setCodecError(true);
      }
    });
  }, [proxySrc]);

  // Source change: only swap src when videoSrc actually changes
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
      {videoSrc && !codecError ? (
        <video
          ref={videoRef}
          className="max-w-full max-h-full shadow-2xl shadow-black"
          preload="auto"
          playsInline
          onError={handleVideoError}
          onLoadedData={handleLoadedData}
        />
      ) : !showTranscodingOverlay ? (
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
      ) : (
        /* Codec not supported — show a full placeholder while server transcodes to H.264 */
        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-300">
          <div className="w-20 h-20 rounded-full bg-[#1a1a1a] border border-violet-500/30 flex items-center justify-center">
            <svg style={{ width: 32, height: 32, color: '#a78bfa', animation: 'spin 1.2s linear infinite' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
          <div className="text-center">
            <div className="text-[13px] font-bold text-violet-400 uppercase tracking-widest">Transcoding to H.264</div>
            <div className="text-[10px] text-gray-500 mt-1">Your browser can't play this codec directly.<br/>A compatible preview will be ready shortly.</div>
          </div>
        </div>
      )}

      {/* Playback Mask Overlay */}
      <div className="absolute inset-0 pointer-events-none border border-white/5"></div>

      {/* Proxy generation pill — shown while proxy is encoding but video is still playing */}
      {isGeneratingProxy && videoSrc && !codecError && (
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
