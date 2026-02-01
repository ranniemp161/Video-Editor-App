
import React, { useRef, memo, useState, useMemo, useEffect, useCallback } from 'react';
import { TimelineState, Asset, TimelineClip } from '../types';
import { TIMELINE_CONSTANTS } from '../constants';
import { formatTime } from '../utils/time';

interface TimelineProps {
  timeline: TimelineState;
  assets: Asset[];
  playheadPosition: number;
  onPlayheadUpdate: (newPosition: number) => void;
  onClipMove: (clipId: string, trackId: string, newStart: number) => void;
  onClipSplit: (clipId: string, position: number) => void;
  onClipDelete: (clipId: string) => void;
  onClipUpdate: (clipId: string, updates: Partial<TimelineClip>) => void;
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
  totalDuration: number;
}

const HEADER_WIDTH = 120; // Increased to fit controls
const MIN_PPS = 2;       // Max Zoom Out (2px per second -> very compressed)
const MAX_PPS = 200;     // Max Zoom In  (200px per second -> granular frames)

// Adaptive Tick Intervals (Seconds)
const TICK_INTERVALS = [
  0.1, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 3600
];

const TimelineComponent: React.FC<TimelineProps> = ({
  timeline,
  assets,
  playheadPosition,
  onPlayheadUpdate,
  onClipMove,
  onClipSplit,
  onClipDelete,
  onClipUpdate,
  selectedClipId,
  onSelectClip,
  totalDuration
}) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { TRACK_HEIGHT, TRACK_GAP } = TIMELINE_CONSTANTS;
  const [pixelsPerSecond, setPixelsPerSecond] = useState(30); // Default Zoom
  const [scrollLeft, setScrollLeft] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  // Sync scroll between Ruler and Tracks
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const left = e.currentTarget.scrollLeft;
    setScrollLeft(left);

    if (e.currentTarget === rulerRef.current && tracksScrollRef.current) {
      tracksScrollRef.current.scrollLeft = left;
    } else if (e.currentTarget === tracksScrollRef.current && rulerRef.current) {
      rulerRef.current.scrollLeft = left;
    }
  };

  // Update container width for virtualization
  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width - HEADER_WIDTH);
        }
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  const timelineWidth = Math.max(totalDuration * pixelsPerSecond, containerWidth);

  // --- Zoom Logic ---
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.altKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newPPS = Math.min(Math.max(pixelsPerSecond * zoomFactor, MIN_PPS), MAX_PPS);

      // Attempt to zoom towards mouse position (advanced)
      // For now, simpler center-zoom or left-anchor zoom is safer to avoid jumps
      setPixelsPerSecond(newPPS);
    }
  };

  const setZoom = (val: number) => {
    setPixelsPerSecond(Math.min(Math.max(val, MIN_PPS), MAX_PPS));
  };

  // --- Adaptive Ruler Logic (Virtualization) ---
  const rulerData = useMemo(() => {
    // 1. Determine ideal interval
    const minPixelsPerMajorTick = 100; // Keep labels ~100px apart
    const targetInterval = minPixelsPerMajorTick / pixelsPerSecond;

    // Find closest larger interval from presets
    const majorInterval = TICK_INTERVALS.find(t => t >= targetInterval) || 3600;

    // Determine subdivisions (Mid/Minor)
    let midInterval = majorInterval / 2;
    let minorInterval = majorInterval / 10;

    // Custom overrides for specific scales for aesthetics
    if (majorInterval === 1) { midInterval = 0.5; minorInterval = 0.1; }
    if (majorInterval === 0.5) { midInterval = 0.1; minorInterval = 0.05; } // Frames

    // 2. Calculate Visible Buffer
    const startPixel = scrollLeft;
    const endPixel = scrollLeft + containerWidth;
    const buffer = 200; // Render extra pixels to prevent pop-in

    const startTime = Math.max(0, (startPixel - buffer) / pixelsPerSecond);
    const endTime = Math.min(totalDuration, (endPixel + buffer) / pixelsPerSecond);

    // 3. Generate Ticks (Only visible ones!)
    const ticks = [];
    const alignTo = (t: number, interval: number) => Math.floor(t / interval) * interval;

    const startTick = alignTo(startTime, minorInterval);

    // Precision warning: use integer math or epsilon for loop
    const epsilon = 0.0001;

    for (let t = startTick; t <= endTime; t += minorInterval) {
      // Classify Tick
      const isMajor = Math.abs(t % majorInterval) < epsilon || Math.abs(majorInterval - (t % majorInterval)) < epsilon;
      const isMid = !isMajor && (Math.abs(t % midInterval) < epsilon || Math.abs(midInterval - (t % midInterval)) < epsilon);

      ticks.push({ time: t, isMajor, isMid });
    }

    return { ticks, majorInterval };
  }, [pixelsPerSecond, scrollLeft, containerWidth, totalDuration]);

  // --- Drag & Drop Logic (Preserved) ---
  const [draggingClip, setDraggingClip] = useState<{ clipId: string; offsetX: number } | null>(null);

  const handleDragStart = (e: React.DragEvent, clipId: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    setDraggingClip({ clipId, offsetX });
    e.dataTransfer.setData('text/plain', clipId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    if (!draggingClip) return;
    const trackElement = e.currentTarget as HTMLElement;
    const rect = trackElement.getBoundingClientRect();
    const dropX = e.clientX - rect.left;
    let newStart = Math.max(0, (dropX - draggingClip.offsetX) / pixelsPerSecond);
    onClipMove(draggingClip.clipId, trackId, newStart);
    setDraggingClip(null);
  };

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft;
    onPlayheadUpdate(x / pixelsPerSecond);
  };

  // Trimming Logic (Preserved)
  const [trimming, setTrimming] = React.useState<{ clipId: string; side: 'start' | 'end'; initialX: number; initialClipStart: number; initialClipEnd: number; initialTrimStart: number; initialTrimEnd: number } | null>(null);

  const handleTrimStart = (e: React.MouseEvent, clip: TimelineClip) => {
    e.stopPropagation();
    setTrimming({ clipId: clip.id, side: 'start', initialX: e.clientX, initialClipStart: clip.start, initialClipEnd: clip.end, initialTrimStart: clip.trimStart, initialTrimEnd: clip.trimEnd });
  };

  const handleTrimEnd = (e: React.MouseEvent, clip: TimelineClip) => {
    e.stopPropagation();
    setTrimming({ clipId: clip.id, side: 'end', initialX: e.clientX, initialClipStart: clip.start, initialClipEnd: clip.end, initialTrimStart: clip.trimStart, initialTrimEnd: clip.trimEnd });
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!trimming) return;
      const deltaX = (e.clientX - trimming.initialX) / pixelsPerSecond;

      if (trimming.side === 'start') {
        const newStart = Math.max(0, trimming.initialClipStart + deltaX);
        const actualDelta = newStart - trimming.initialClipStart;
        const newTrimStart = Math.max(0, trimming.initialTrimStart + actualDelta);
        if (newStart < trimming.initialClipEnd - 0.1) {
          onClipUpdate(trimming.clipId, { start: newStart, trimStart: newTrimStart });
        }
      } else {
        const newEnd = Math.max(trimming.initialClipStart + 0.1, trimming.initialClipEnd + deltaX);
        const durationDelta = newEnd - trimming.initialClipEnd;
        const newTrimEnd = trimming.initialTrimEnd + durationDelta;
        onClipUpdate(trimming.clipId, { end: newEnd, trimEnd: newTrimEnd });
      }
    };
    const handleMouseUp = () => setTrimming(null);
    if (trimming) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [trimming, pixelsPerSecond]);

  // Helper for asset matching
  const getAssetByClip = useCallback((clip: TimelineClip) => {
    let asset = assets.find(a => a.id === clip.assetId);
    if (asset) return asset;

    // Source File Match
    if (clip.sourceFileName) {
      const clean = (s: string) => s.toLowerCase().split('.')[0].trim();
      asset = assets.find(a => clean(a.name) === clean(clip.sourceFileName!));
      if (asset) return asset;
    }

    // Fallback Name Match
    if (clip.name) {
      const clean = (s: string) => s.toLowerCase().split('.')[0].trim();
      asset = assets.find(a => clean(a.name) === clean(clip.name));
    }
    return asset;
  }, [assets]);

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col bg-[#1e1e1e] overflow-hidden border-t border-[#333]">
      {/* Top Bar with Zoom Controls within Header Space */}
      <div className="flex h-10 border-b border-[#333] bg-[#222]">

        {/* Track Headers Column / Controls */}
        <div style={{ width: `${HEADER_WIDTH}px` }} className="flex-shrink-0 border-r border-[#333] bg-[#1a1a1a] flex flex-col justify-center items-center px-2 z-20">
          {/* Zoom Controls Compact */}
          <div className="flex items-center space-x-1 w-full">
            <button onClick={() => setZoom(pixelsPerSecond * 0.8)} className="text-gray-400 hover:text-white pb-1">-</button>
            <input
              type="range"
              min={MIN_PPS}
              max={MAX_PPS}
              step={1}
              value={pixelsPerSecond}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-[#26c6da]"
            />
            <button onClick={() => setZoom(pixelsPerSecond * 1.2)} className="text-gray-400 hover:text-white pb-1">+</button>
          </div>
        </div>

        {/* Ruler Area */}
        <div
          className="flex-grow overflow-hidden relative cursor-pointer select-none"
          ref={rulerRef}
          onScroll={handleScroll}
          onClick={(e) => {
            handleRulerClick(e);
            onSelectClip(null);
          }}
        >
          <div className="h-full relative" style={{ width: `${timelineWidth}px` }}>
            {rulerData.ticks.map((tick, idx) => (
              <div
                key={idx}
                style={{ left: `${tick.time * pixelsPerSecond}px` }}
                className={`absolute top-0 border-l border-gray-700/50 ${tick.isMajor ? 'h-full opacity-50' : tick.isMid ? 'h-3 opacity-30' : 'h-1.5 opacity-10'
                  }`}
              >
                {tick.isMajor && (
                  <span className="absolute top-1 left-1.5 text-[9px] text-gray-500 font-mono font-medium pointer-events-none select-none">
                    {formatTime(tick.time)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tracks Area */}
      <div
        className="flex-grow flex overflow-x-auto overflow-y-auto"
        ref={tracksScrollRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
      >
        <div className="sticky left-0 flex flex-col z-10 bg-[#222] border-r border-[#333] shadow-xl" style={{ width: `${HEADER_WIDTH}px` }}>
          {timeline.tracks.map((track) => (
            <div
              key={`header-${track.id}`}
              className="flex items-center justify-center text-[10px] text-gray-500 font-bold border-b border-[#333] bg-[#222]"
              style={{ height: `${TRACK_HEIGHT + TRACK_GAP}px` }}
            >
              {track.id.toUpperCase()}
            </div>
          ))}
        </div>

        <div className="relative" style={{ width: `${timelineWidth}px`, height: `${timeline.tracks.length * (TRACK_HEIGHT + TRACK_GAP)}px` }}>
          {/* Track Rows */}
          {timeline.tracks.map((track, trackIdx) => (
            <div
              key={track.id}
              className="absolute w-full border-b border-[#333] bg-[#282828]/30 hover:bg-[#282828]/50 transition-colors"
              style={{
                top: `${trackIdx * (TRACK_HEIGHT + TRACK_GAP)}px`,
                height: `${TRACK_HEIGHT + TRACK_GAP}px`,
              }}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, track.id)}
            >
              <div className="relative h-full">
                {/* Clips */}
                {track.clips.map(clip => {
                  // Virtualization: Check visibility
                  const visibleStart = scrollLeft / pixelsPerSecond;
                  const visibleEnd = (scrollLeft + containerWidth) / pixelsPerSecond;
                  if (clip.end < visibleStart || clip.start > visibleEnd) return null;

                  const asset = getAssetByClip(clip);
                  const isOffline = !asset || !asset.src;
                  const isVideo = asset?.type === 'video';
                  const clipDuration = clip.end - clip.start;
                  const clipColor = isOffline ? '#3d0b0b' : (isVideo ? '#4a8faa' : '#64a064');
                  const clipBorder = isOffline ? '#662222' : (isVideo ? '#6bb2ce' : '#88c688');
                  const clipWidthPx = Math.max(2, clipDuration * pixelsPerSecond);
                  const showText = clipWidthPx > 40; // Only show text if wide enough

                  return (
                    <div
                      key={clip.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, clip.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectClip(clip.id);
                      }}
                      className={`absolute rounded-[4px] overflow-hidden text-white text-[10px] flex flex-col cursor-move active:opacity-70 transition-all group ${selectedClipId === clip.id ? 'ring-2 ring-[#26c6da] z-20 shadow-[0_4px_15px_rgba(38,198,218,0.4)]' : 'shadow-md border border-black/20'
                        }`}
                      style={{
                        left: `${clip.start * pixelsPerSecond}px`,
                        width: `${clipWidthPx}px`,
                        height: `${TRACK_HEIGHT}px`,
                        top: `${TRACK_GAP / 2}px`,
                        backgroundColor: clipColor,
                        border: selectedClipId === clip.id ? `1px solid #26c6da` : `1px solid ${clipBorder}`,
                      }}
                    >
                      {/* Trim Handles - Only show on hover for cleaner look */}
                      <div onMouseDown={(e) => handleTrimStart(e, clip)} className="absolute left-0 top-0 w-3 h-full cursor-ew-resize hover:bg-white/30 z-10 transition-colors opacity-0 group-hover:opacity-100" />
                      <div onMouseDown={(e) => handleTrimEnd(e, clip)} className="absolute right-0 top-0 w-3 h-full cursor-ew-resize hover:bg-white/30 z-10 transition-colors opacity-0 group-hover:opacity-100" />

                      {/* Clip Label */}
                      {showText && (
                        <div className="px-2 py-1 truncate bg-black/20 font-medium pointer-events-none flex items-center gap-1.5 h-full">
                          {isOffline && <span className="text-red-400 font-bold animate-pulse">!</span>}
                          <span className="opacity-80 drop-shadow-md text-[9px]">{clip.name || 'Unknown Clip'}</span>
                        </div>
                      )}

                      {/* Offline Warning */}
                      {isOffline && <div className="absolute bottom-0 w-full bg-red-900/80 text-[8px] text-center py-0.5 text-red-200 font-bold">RELINK NEEDED</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-[#ff4d4d] z-40 pointer-events-none transition-transform duration-75 will-change-transform"
            style={{
              transform: `translateX(${playheadPosition * pixelsPerSecond}px)`,
              boxShadow: '0 0 8px rgba(255, 77, 77, 0.5)'
            }}
          >
            {/* Playhead Head */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[#ff4d4d] text-white text-[10px] font-bold font-mono px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap flex items-center justify-center">
              {formatTime(playheadPosition)}
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-[#ff4d4d]"></div>
            </div>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-[12px] bg-[#ff4d4d] rounded-b-[2px] shadow-sm"></div>
          </div>

        </div>
      </div>
    </div>
  );
};

export const Timeline = memo(TimelineComponent);
