
import React, { useRef, memo, useState, useMemo, useEffect, useCallback } from 'react';
import { TimelineState, Asset, TimelineClip, TimelineMarker } from '../types';
import { TIMELINE_CONSTANTS } from '../constants';
import { formatTime } from '../utils/time';
import { MarkerFlag } from './MarkerFlag';
import { WaveformDisplay } from './WaveformDisplay';
import { TimelineMinimap } from './TimelineMinimap';

interface TimelineProps {
  timeline: TimelineState;
  assets: Asset[];
  playheadPosition: number;
  onPlayheadUpdate: (newPosition: number) => void;
  onClipMove: (clipId: string, trackId: string, newStart: number) => void;
  onClipSplit: (clipId: string, position: number) => void;
  onClipDelete: (clipId: string) => void;
  onClipUpdate: (clipId: string, updates: Partial<TimelineClip>) => void;
  selectedClipIds: string[];
  onSelectClip: (clipId: string | null, append?: boolean) => void;
  totalDuration: number;
  onToggleMute: (trackId: string) => void;
  onToggleLock: (trackId: string) => void;
  markers?: TimelineMarker[];
  onAddMarker?: (time: number) => void;
  onRemoveMarker?: (id: string) => void;
  onUpdateMarker?: (id: string, updates: Partial<TimelineMarker>) => void;
  // NEW UX Props
  onSplitAtPlayhead?: () => void;
  onSelectClipsInRange?: (startTime: number, endTime: number) => void;
  onSetTrackHeight?: (trackId: string, height: number) => void;
  onClipsMove?: (clipIds: string[], delta: number) => void;
}

const HEADER_WIDTH = 120; // Increased to fit controls
const MIN_PPS = 2;       // Max Zoom Out (2px per second -> very compressed)
const MAX_PPS = 200;     // Max Zoom In  (200px per second -> granular frames)

// Adaptive Tick Intervals (Seconds)
const TICK_INTERVALS = [
  0.1, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 3600
];

// --- Optimized Sub-components ---

interface ClipProps {
  clip: TimelineClip;
  asset: Asset | null;
  pixelsPerSecond: number;
  isSelected: boolean;
  isLocked: boolean;
  onSelect: (id: string, append: boolean) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onTrimStart: (e: React.MouseEvent, clip: TimelineClip) => void;
  onTrimEnd: (e: React.MouseEvent, clip: TimelineClip) => void;
  onUpdate: (id: string, updates: Partial<TimelineClip>) => void;
  onShowTooltip?: (data: { clipId: string; x: number; y: number; name: string; duration: string; trimInfo: string }) => void;
  onHideTooltip?: () => void;
}

const TimelineClipItem = memo(({
  clip,
  asset,
  pixelsPerSecond,
  isSelected,
  isLocked,
  onSelect,
  onDragStart,
  onDragEnd,
  onTrimStart,
  onTrimEnd,
  onShowTooltip,
  onHideTooltip,
}: ClipProps) => {
  const { TRACK_HEIGHT, TRACK_GAP } = TIMELINE_CONSTANTS;

  const isOffline = !asset || !asset.src;
  const isVideo = asset?.type === 'video';
  // Transition to a more sophisticated palette
  const clipBaseColor = isOffline ? '#3d0b0b' : (isVideo ? '#26c6da' : '#64a064');
  const clipDuration = clip.end - clip.start;
  const clipWidthPx = Math.max(2, clipDuration * pixelsPerSecond);
  const showText = clipWidthPx > 40;

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (onShowTooltip) {
      const duration = `Duration: ${clipDuration.toFixed(2)}s`;
      const trimInfo = `Trim: ${clip.trimStart.toFixed(2)}s - ${clip.trimEnd.toFixed(2)}s`;
      onShowTooltip({
        clipId: clip.id,
        x: e.clientX,
        y: e.clientY,
        name: clip.name || 'Unknown Clip',
        duration,
        trimInfo
      });
    }
  };

  return (
    <div
      draggable={!isLocked}
      onDragStart={(e) => !isLocked && onDragStart(e, clip.id)}
      onDragEnd={onDragEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onHideTooltip}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(clip.id, e.ctrlKey || e.metaKey);
      }}
      className={`absolute rounded-lg overflow-hidden text-white text-[10px] flex flex-col transition-all select-none group border border-white/[0.08] ${isSelected
        ? 'ring-2 ring-white z-20 shadow-[0_10px_30px_rgba(0,0,0,0.5)]'
        : 'shadow-[0_2px_10px_rgba(0,0,0,0.3)]'
        } ${isLocked ? 'opacity-40 grayscale-[0.8] cursor-not-allowed' : 'cursor-move active:scale-[0.98]'}`}
      style={{
        left: `${clip.start * pixelsPerSecond}px`,
        width: `${clipWidthPx}px`,
        height: `${TRACK_HEIGHT}px`,
        top: `${TRACK_GAP / 2}px`,
        background: `linear-gradient(to bottom, ${clipBaseColor}dd, ${clipBaseColor}ff)`,
        boxShadow: isSelected ? '0 0 20px rgba(255,255,255,0.1)' : 'inset 0 1px 1px rgba(255,255,255,0.1)'
      }}
    >
      {asset && isVideo && clipWidthPx > 20 && (
        <WaveformDisplay
          asset={asset}
          clipStart={clip.start}
          clipEnd={clip.end}
          trimStart={clip.trimStart}
          trimEnd={clip.trimEnd}
          width={clipWidthPx}
          height={TRACK_HEIGHT}
        />
      )}

      {!isLocked && (
        <>
          <div
            onMouseDown={(e) => onTrimStart(e, clip)}
            className={`absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-green-400/60 z-30 transition-all flex items-center justify-center ${isSelected ? 'opacity-100 bg-green-500/30' : 'opacity-0 group-hover:opacity-100'}`}
          >
            <div className="w-[2px] h-6 bg-green-300 rounded-full shadow-lg" />
          </div>
          <div
            onMouseDown={(e) => onTrimEnd(e, clip)}
            className={`absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-red-400/60 z-30 transition-all flex items-center justify-center ${isSelected ? 'opacity-100 bg-red-500/30' : 'opacity-0 group-hover:opacity-100'}`}
          >
            <div className="w-[2px] h-6 bg-red-300 rounded-full shadow-lg" />
          </div>
        </>
      )}

      <div className="relative w-full h-full flex items-center overflow-hidden">
        {showText && (
          <div className={`px-2 w-full truncate font-medium drop-shadow-md flex items-center gap-1.5 ${isLocked ? 'text-white/60' : 'text-white/95'}`}>
            {isOffline && <span className="text-red-400 font-bold bg-black/50 px-1 rounded">!</span>}
            <span>{clip.name || 'Unknown Clip'}</span>
            <span className="text-[9px] opacity-60 ml-auto font-mono">{clipDuration.toFixed(2)}s</span>
          </div>
        )}
      </div>

      {isLocked && (
        <div className="absolute top-1 right-1 opacity-40">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        </div>
      )}

      {isOffline && <div className="absolute inset-0 flex items-center justify-center bg-red-900/40 text-[9px] font-bold text-red-100 uppercase tracking-wider backdrop-blur-[1px]">Media Offline</div>}
    </div>
  );
});

TimelineClipItem.displayName = 'TimelineClipItem';

const Playhead = memo(({ position, pixelsPerSecond }: { position: number, pixelsPerSecond: number }) => {
  return (
    <div
      className="absolute top-0 bottom-0 w-[2px] bg-[#26c6da] z-40 pointer-events-none will-change-transform"
      style={{
        transform: `translateX(${position * pixelsPerSecond}px)`,
        boxShadow: '0 0 15px rgba(38, 198, 218, 0.8)'
      }}
    >
      <div className="absolute -top-[1px] left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-[#26c6da] rounded-sm transform scale-x-[0.3] scale-y-[1.5] shadow-[0_0_10px_rgba(38,198,218,0.5)]"></div>
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#26c6da] rounded-full opacity-20 blur-sm scale-150"></div>
    </div>
  );
});

Playhead.displayName = 'Playhead';

const TimelineComponent: React.FC<TimelineProps> = ({
  timeline,
  assets,
  playheadPosition,
  onPlayheadUpdate,
  onClipMove,
  onClipSplit,
  onClipDelete,
  onClipUpdate,
  selectedClipIds,
  onSelectClip,
  totalDuration,
  onToggleMute,
  onToggleLock,
  markers = [],
  onAddMarker,
  onRemoveMarker,
  onUpdateMarker,
  // NEW UX Props
  onSplitAtPlayhead,
  onSelectClipsInRange,
  onSetTrackHeight,
  onClipsMove,
}) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { TRACK_HEIGHT, TRACK_GAP } = TIMELINE_CONSTANTS;
  const [pixelsPerSecond, setPixelsPerSecond] = useState(30); // Default Zoom
  const [scrollLeft, setScrollLeft] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isSnappingEnabled, setIsSnappingEnabled] = useState(true);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [snapGuideTime, setSnapGuideTime] = useState<number | null>(null);
  const lastMouseXRef = useRef<number>(0);

  // NEW: Additional state for UX enhancements
  const [isRippleMode, setIsRippleMode] = useState(false);
  const [isSelectingBox, setIsSelectingBox] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [hoveredClip, setHoveredClip] = useState<string | null>(null);
  const [trimTooltip, setTrimTooltip] = useState<{ clipId: string; side: 'start' | 'end'; value: string } | null>(null);

  // Phase 1 UX States
  const [clipTooltip, setClipTooltip] = useState<{ clipId: string; x: number; y: number; name: string; duration: string; trimInfo: string } | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const lastScrubTimeRef = useRef<number | null>(null);
  const scrollLeftRef = useRef(scrollLeft);
  const selectedClipIdsRef = useRef(selectedClipIds);
  const timelineRef = useRef(timeline);

  // Keep refs in sync for event handlers
  useEffect(() => {
    scrollLeftRef.current = scrollLeft;
  }, [scrollLeft]);

  useEffect(() => {
    selectedClipIdsRef.current = selectedClipIds;
  }, [selectedClipIds]);

  useEffect(() => {
    timelineRef.current = timeline;
  }, [timeline]);

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
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();

      // Use shorter delta for smoother feel
      const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95;
      const newPPS = Math.min(Math.max(pixelsPerSecond * zoomFactor, MIN_PPS), MAX_PPS);

      if (newPPS === pixelsPerSecond) return;

      const scrollContainer = tracksScrollRef.current;
      if (scrollContainer) {
        const rect = scrollContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;

        // Calculate time at mouse position before zoom
        const mouseTime = (scrollLeft + mouseX) / pixelsPerSecond;

        // Calculate new scroll position to keep time at mouse static
        const newScrollLeft = (mouseTime * newPPS) - mouseX;

        setPixelsPerSecond(newPPS);

        // Immediate sync for visual stability
        scrollContainer.scrollLeft = newScrollLeft;
        if (rulerRef.current) rulerRef.current.scrollLeft = newScrollLeft;
        setScrollLeft(newScrollLeft);
      } else {
        setPixelsPerSecond(newPPS);
      }
    }
  }, [pixelsPerSecond, scrollLeft]);

  // Add native wheel event listener to prevent browser zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Use native event listener with passive: false to prevent default
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  const setZoom = (val: number) => {
    setPixelsPerSecond(Math.min(Math.max(val, MIN_PPS), MAX_PPS));
  };

  const handleZoomFit = () => {
    if (containerWidth > 0 && totalDuration > 0) {
      const fitPPS = (containerWidth - 40) / totalDuration;
      setPixelsPerSecond(Math.min(Math.max(fitPPS, MIN_PPS), MAX_PPS));
      setScrollLeft(0);
      if (tracksScrollRef.current) tracksScrollRef.current.scrollLeft = 0;
      if (rulerRef.current) rulerRef.current.scrollLeft = 0;
    }
  };

  const getSnappedTime = (time: number): number => {
    if (!isSnappingEnabled) return time;
    const threshold = 10 / pixelsPerSecond; // 10px threshold

    // Snap to playhead (if not scrubbing)
    // Actually scrubbing *is* moving the playhead, so we snap to clip edges
    let snappedTime = time;
    let minDelta = threshold;
    let snapped = false;

    timeline.tracks.forEach(track => {
      track.clips.forEach(clip => {
        if (Math.abs(time - clip.start) < minDelta) {
          minDelta = Math.abs(time - clip.start);
          snappedTime = clip.start;
          snapped = true;
        }
        if (Math.abs(time - clip.end) < minDelta) {
          minDelta = Math.abs(time - clip.end);
          snappedTime = clip.end;
          snapped = true;
        }
      });
    });

    if (snapped) setSnapGuideTime(snappedTime);
    else setSnapGuideTime(null);

    return snappedTime;
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

    // Auto-scroll when dragging near edges
    if (tracksScrollRef.current) {
      const rect = tracksScrollRef.current.getBoundingClientRect();
      const edgeThreshold = 80;
      const scrollSpeed = 12;
      const mouseX = e.clientX - rect.left;

      if (mouseX > rect.width - edgeThreshold) {
        tracksScrollRef.current.scrollLeft += scrollSpeed;
      } else if (mouseX < edgeThreshold) {
        tracksScrollRef.current.scrollLeft -= scrollSpeed;
      }
    }
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
    const time = x / pixelsPerSecond;
    onPlayheadUpdate(getSnappedTime(time));
    onSelectClip(null);
  };

  const handleScrubStart = (e: React.MouseEvent) => {
    setIsScrubbing(true);
    handleRulerClick(e as any);
  };

  useEffect(() => {
    if (!isScrubbing && !isPanning) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!tracksScrollRef.current) return;

      if (isPanning) {
        const deltaX = e.clientX - lastMouseXRef.current;
        lastMouseXRef.current = e.clientX;
        tracksScrollRef.current.scrollLeft -= deltaX;
        setScrollLeft(tracksScrollRef.current.scrollLeft);
        return;
      }

      if (isScrubbing && rulerRef.current) {
        const rect = rulerRef.current.getBoundingClientRect();
        const x = Math.max(0, e.clientX - rect.left + scrollLeftRef.current);

        // Edge Auto-scroll logic (only for scrubbing)
        const edgeThreshold = 60;
        const scrollSpeed = 15;
        const mouseXRelativeToViewport = e.clientX - rect.left;

        if (mouseXRelativeToViewport > rect.width - edgeThreshold) {
          tracksScrollRef.current.scrollLeft += scrollSpeed;
        } else if (mouseXRelativeToViewport < edgeThreshold) {
          tracksScrollRef.current.scrollLeft -= scrollSpeed;
        }

        const time = x / pixelsPerSecond;
        onPlayheadUpdate(getSnappedTime(time));
      }
    };

    const handleMouseUp = () => {
      setIsScrubbing(false);
      setIsPanning(false);
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    // Safety net for when focus is lost or mouse leaves window
    window.addEventListener('mouseleave', handleMouseUp);
    window.addEventListener('blur', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mouseleave', handleMouseUp);
      window.removeEventListener('blur', handleMouseUp);
    };
  }, [isScrubbing, isPanning, pixelsPerSecond, onPlayheadUpdate, isSnappingEnabled, timeline]);

  const handleGlobalMouseDown = (e: React.MouseEvent) => {
    // Middle Mouse Button (button 1)
    if (e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      lastMouseXRef.current = e.clientX;
      document.body.style.cursor = 'grabbing';
    }
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
      let deltaX = (e.clientX - trimming.initialX) / pixelsPerSecond;

      // --- WORD-AWARE SNAPPING ---
      const targetClip = timeline.tracks.flatMap(t => t.clips).find(c => c.id === trimming.clipId);
      const asset = targetClip ? getAssetByClip(targetClip) : null;

      if (isSnappingEnabled && asset?.transcription?.words) {
        const threshold = 0.15; // 150ms snapping radius
        const words = asset.transcription.words;

        if (trimming.side === 'start') {
          const targetTrimStart = trimming.initialTrimStart + deltaX;
          const closestWord = words.find(w => Math.abs((w.start / 1000) - targetTrimStart) < threshold);
          if (closestWord) {
            deltaX = (closestWord.start / 1000) - trimming.initialTrimStart;
          }
        } else {
          const targetTrimEnd = trimming.initialTrimEnd + deltaX;
          const closestWord = words.find(w => Math.abs((w.end / 1000) - targetTrimEnd) < threshold);
          if (closestWord) {
            deltaX = (closestWord.end / 1000) - trimming.initialTrimEnd;
          }
        }
      }

      if (trimming.side === 'start') {
        const newStart = Math.max(0, trimming.initialClipStart + deltaX);
        const actualDelta = newStart - trimming.initialClipStart;
        const newTrimStart = trimming.initialTrimStart + actualDelta;

        // Validation against source handled by hook, but we bound check here for UI smoothness
        if (newTrimStart >= 0 && newStart < trimming.initialClipEnd - 0.1) {
          onClipUpdate(trimming.clipId, { start: newStart, trimStart: newTrimStart });
        }
      } else {
        const newEnd = trimming.initialClipEnd + deltaX;
        const actualDelta = newEnd - trimming.initialClipEnd;
        const newTrimEnd = trimming.initialTrimEnd + actualDelta;

        // Validation against source handled by hook
        if (newEnd > trimming.initialClipStart + 0.1) {
          onClipUpdate(trimming.clipId, { end: newEnd, trimEnd: newTrimEnd });
        }
      }
    };
    const handleMouseUp = () => setTrimming(null);

    if (trimming) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('mouseleave', handleMouseUp);
      window.addEventListener('blur', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mouseleave', handleMouseUp);
      window.removeEventListener('blur', handleMouseUp);
    };
  }, [trimming, pixelsPerSecond]);

  // Optimized asset map for O(1) lookups
  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    const fuzzyMap = new Map<string, Asset>();
    const clean = (s: string) => s.toLowerCase().split('.')[0].trim();

    assets.forEach(a => {
      map.set(a.id, a);
      fuzzyMap.set(clean(a.name), a);
    });
    return { map, fuzzyMap, clean };
  }, [assets]);

  const getAssetByClip = useCallback((clip: TimelineClip) => {
    let asset = assetMap.map.get(clip.assetId);
    if (asset) return asset;

    if (clip.sourceFileName) {
      asset = assetMap.fuzzyMap.get(assetMap.clean(clip.sourceFileName));
      if (asset) return asset;
    }

    if (clip.name) {
      asset = assetMap.fuzzyMap.get(assetMap.clean(clip.name));
    }
    return asset || null;
  }, [assetMap]);

  // Show toast feedback helper
  const showToast = useCallback((message: string) => {
    setFeedbackToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setFeedbackToast(null), 2000);
  }, []);

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Split logic
      if (e.key === 's' || e.key === 'S') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          onSplitAtPlayhead?.();
          showToast('Split at playhead');
        }
      }

      // 2. Movement logic (Shift + Arrows)
      if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const ids = selectedClipIdsRef.current;
        if (ids.length > 0) {
          e.preventDefault();
          const step = 0.1; // 0.1 second step
          const delta = (e.key === 'ArrowLeft' ? -1 : 1) * step;
          onClipsMove?.(ids, delta);
          showToast(`Moved ${ids.length} clip${ids.length > 1 ? 's' : ''} ${e.key === 'ArrowLeft' ? 'left' : 'right'}`);
        }
      }

      // 3. Home/End - Jump to start/end
      if (e.key === 'Home') {
        e.preventDefault();
        onPlayheadUpdate(0);
        showToast('Jumped to start');
      }
      if (e.key === 'End') {
        e.preventDefault();
        onPlayheadUpdate(totalDuration);
        showToast('Jumped to end');
      }

      // 4. PageUp/PageDown - Larger jumps
      if (e.key === 'PageUp') {
        e.preventDefault();
        onPlayheadUpdate(Math.max(0, playheadPosition - 5));
        showToast('← 5 seconds');
      }
      if (e.key === 'PageDown') {
        e.preventDefault();
        onPlayheadUpdate(Math.min(totalDuration, playheadPosition + 5));
        showToast('→ 5 seconds');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSplitAtPlayhead, onClipsMove, onPlayheadUpdate, totalDuration, playheadPosition, showToast]);

  // Memoize split-able clip to avoid per-frame deep search
  const splitableClip = useMemo(() => {
    if (!hoveredClip) return null;
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        if (clip.id === hoveredClip && playheadPosition > clip.start && playheadPosition < clip.end) {
          return clip;
        }
      }
    }
    return null;
  }, [hoveredClip, timeline.tracks, playheadPosition]);

  // NEW: Marquee selection handler
  useEffect(() => {
    if (!isSelectingBox) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!tracksScrollRef.current || !selectionBox) return;

      const rect = tracksScrollRef.current.getBoundingClientRect();
      setSelectionBox(prev => {
        if (!prev) return null;
        return {
          ...prev,
          endX: e.clientX - rect.left + scrollLeftRef.current,
          endY: e.clientY - rect.top
        };
      });
    };

    const handleMouseUp = () => {
      if (selectionBox && onSelectClipsInRange) {
        const startTime = Math.min(selectionBox.startX, selectionBox.endX) / pixelsPerSecond;
        const endTime = Math.max(selectionBox.startX, selectionBox.endX) / pixelsPerSecond;
        onSelectClipsInRange(startTime, endTime);
      }
      setIsSelectingBox(false);
      setSelectionBox(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mouseleave', handleMouseUp);
    window.addEventListener('blur', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mouseleave', handleMouseUp);
      window.removeEventListener('blur', handleMouseUp);
    };
  }, [isSelectingBox, selectionBox, onSelectClipsInRange, pixelsPerSecond]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full flex flex-col bg-[#0a0a0a] overflow-hidden border-t border-white/[0.05] ${isPanning ? 'cursor-grabbing' : ''}`}
      onMouseDown={handleGlobalMouseDown}
    >
      {/* Zoom / Controls Bar */}
      <div className="flex items-center justify-between px-4 h-10 glass border-b border-white/[0.05] gap-4">
        <div className="flex items-center gap-2">
          {/* Ripple Edit Mode Toggle */}
          <button
            onClick={() => setIsRippleMode(!isRippleMode)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${isRippleMode
              ? 'bg-cyan-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            title="Ripple Edit Mode - Moving/deleting clips shifts subsequent clips"
          >
            {isRippleMode ? '⚡ Ripple ON' : 'Ripple'}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setZoom(pixelsPerSecond * 0.8)} className="text-gray-500 hover:text-white transition-colors text-lg font-mono">-</button>
          <input
            type="range"
            min={MIN_PPS}
            max={MAX_PPS}
            step={1}
            value={pixelsPerSecond}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-32 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
          <button onClick={() => setZoom(pixelsPerSecond * 1.2)} className="text-gray-500 hover:text-white transition-colors text-lg font-mono">+</button>
          {/* Zoom Percentage Display */}
          <span className="text-xs text-gray-400 font-mono min-w-[45px] text-right">{Math.round((pixelsPerSecond / 30) * 100)}%</span>
        </div>
      </div>

      {/* Top Bar with Ruler */}
      <div className="flex h-8 border-b border-[#333] bg-[#121212]">

        {/* Track Headers Spacer */}
        <div style={{ width: `${HEADER_WIDTH}px` }} className="flex-shrink-0 border-r border-[#333] bg-[#121212] flex items-center justify-between px-2 z-20">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsSnappingEnabled(!isSnappingEnabled)}
              className={`p-1 rounded hover:bg-white/10 transition-colors ${isSnappingEnabled ? 'text-cyan-400' : 'text-gray-500'}`}
              title="Toggle Snapping"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleZoomFit}
              className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
              title="Fit to Screen"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>
            </button>
          </div>
        </div>

        {/* Ruler Area */}
        <div
          className="flex-grow overflow-hidden relative cursor-pointer select-none border-l border-[#333]"
          ref={rulerRef}
          onScroll={handleScroll}
          onMouseDown={(e) => {
            if (e.button === 2 || e.altKey) { // Right Click or Alt+Drag to pan
              e.preventDefault();
              setIsPanning(true);
              lastMouseXRef.current = e.clientX;
              return;
            }
            handleScrubStart(e);
          }}
          onContextMenu={(e) => e.preventDefault()} // Block context menu for right-click pan
          style={{
            backgroundImage: 'linear-gradient(to bottom, #1a1a1a, #121212)',
          }}
        >
          <div className="h-full relative" style={{ width: `${timelineWidth}px` }}>
            {rulerData.ticks.map((tick, idx) => (
              <div
                key={idx}
                style={{ left: `${tick.time * pixelsPerSecond}px` }}
                className={`absolute bottom-0 border-l ${tick.isMajor
                  ? 'h-[10px] border-white/20'
                  : tick.isMid
                    ? 'h-[6px] border-white/10'
                    : 'h-[4px] border-white/5'
                  }`}
              >
                {tick.isMajor && (
                  <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[8px] text-white/40 font-mono tracking-wider pointer-events-none select-none">
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
      >
        <div className="sticky left-0 flex flex-col z-10 bg-[#121212] border-r border-[#333] shadow-2xl" style={{ width: `${HEADER_WIDTH}px` }}>
          {timeline.tracks.map((track) => (
            <div
              key={`header-${track.id}`}
              className="group/header flex flex-col justify-center px-2 border-b border-[#2d2d2d] bg-[#1a1a1a] transition-colors hover:bg-[#1e1e1e]"
              style={{ height: `${TRACK_HEIGHT + TRACK_GAP}px` }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">{track.id}</span>
                <div className="flex gap-1.5 opacity-40 group-hover/header:opacity-100 transition-opacity">
                  <button
                    onClick={() => onToggleMute(track.id)}
                    className={`hover:text-white transition-colors ${track.muted ? 'text-red-500 opacity-100' : 'text-gray-400'}`}
                    title={track.muted ? 'Unmute' : 'Mute'}
                  >
                    {track.muted ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                    )}
                  </button>
                  <button
                    onClick={() => onToggleLock(track.id)}
                    className={`hover:text-white transition-colors ${track.locked ? 'text-orange-500 opacity-100' : 'text-gray-400'}`}
                    title={track.locked ? 'Unlock' : 'Lock'}
                  >
                    {track.locked ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="relative" style={{ width: `${timelineWidth}px`, height: `${timeline.tracks.length * (TRACK_HEIGHT + TRACK_GAP)}px` }}>
          {/* Track Rows */}
          {timeline.tracks.map((track, trackIdx) => (
            <div
              key={track.id}
              className="absolute w-full border-b border-[#2a2a2a] bg-[#1e1e1e] hover:bg-[#232323] transition-colors"
              style={{
                top: `${trackIdx * (TRACK_HEIGHT + TRACK_GAP)}px`,
                height: `${TRACK_HEIGHT + TRACK_GAP}px`,
              }}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, track.id)}
              onMouseDown={(e) => {
                // Shift + Click to start marquee selection
                if (e.shiftKey && tracksScrollRef.current) {
                  e.preventDefault();
                  const rect = tracksScrollRef.current.getBoundingClientRect();
                  const startX = e.clientX - rect.left + scrollLeft;
                  const startY = e.clientY - rect.top;
                  setSelectionBox({ startX, startY, endX: startX, endY: startY });
                  setIsSelectingBox(true);
                }
              }}
            >
              {/* Clips */}
              {track.clips.map(clip => {
                // Virtualization: Check visibility
                const visibleStart = scrollLeft / pixelsPerSecond;
                const visibleEnd = (scrollLeft + containerWidth) / pixelsPerSecond;
                if (clip.end < visibleStart || clip.start > visibleEnd) return null;

                return (
                  <TimelineClipItem
                    key={clip.id}
                    clip={clip}
                    asset={getAssetByClip(clip)}
                    pixelsPerSecond={pixelsPerSecond}
                    isSelected={selectedClipIds.includes(clip.id)}
                    isLocked={track.locked}
                    onSelect={onSelectClip}
                    onDragStart={handleDragStart}
                    onDragEnd={() => setDraggingClip(null)}
                    onTrimStart={handleTrimStart}
                    onTrimEnd={handleTrimEnd}
                    onUpdate={onClipUpdate}
                    onShowTooltip={setClipTooltip}
                    onHideTooltip={() => setClipTooltip(null)}
                  />
                );
              })}
            </div>
          ))}

          {/* Playhead */}
          <Playhead position={playheadPosition} pixelsPerSecond={pixelsPerSecond} />

          {/* Snap Guide Line */}
          {snapGuideTime !== null && (
            <div
              className="absolute top-0 bottom-0 w-[1px] bg-cyan-400 z-30 pointer-events-none opacity-50"
              style={{
                left: `${snapGuideTime * pixelsPerSecond}px`,
              }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-cyan-400 blur-[2px]"></div>
            </div>
          )}

          {/* Markers */}
          {markers.map(marker => (
            <MarkerFlag
              key={marker.id}
              marker={marker}
              pixelsPerSecond={pixelsPerSecond}
              onClick={onPlayheadUpdate}
              onRemove={onRemoveMarker || (() => { })}
              onUpdate={onUpdateMarker || (() => { })}
            />
          ))}

          {/* Split Preview Line - Shows where split will occur */}
          {splitableClip && (
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-orange-400 z-35 pointer-events-none opacity-60"
              style={{
                left: `${playheadPosition * pixelsPerSecond}px`,
                boxShadow: '0 0 8px rgba(251, 146, 60, 0.6)'
              }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 text-[9px] bg-orange-500 text-white px-1 rounded whitespace-nowrap">
                Press S to Split
              </div>
            </div>
          )}

          {/* Marquee Selection Box */}
          {selectionBox && (
            <div
              className="absolute border-2 border-cyan-400 bg-cyan-400/10 pointer-events-none z-50"
              style={{
                left: `${Math.min(selectionBox.startX, selectionBox.endX)}px`,
                top: `${Math.min(selectionBox.startY, selectionBox.endY)}px`,
                width: `${Math.abs(selectionBox.endX - selectionBox.startX)}px`,
                height: `${Math.abs(selectionBox.endY - selectionBox.startY)}px`,
              }}
            />
          )}

        </div>
      </div>

      {/* Minimap */}
      <TimelineMinimap
        timeline={timeline}
        totalDuration={totalDuration}
        viewportStart={scrollLeft / pixelsPerSecond}
        viewportEnd={(scrollLeft + containerWidth) / pixelsPerSecond}
        onNavigate={(newStart) => {
          const newScrollLeft = newStart * pixelsPerSecond;
          if (tracksScrollRef.current) {
            tracksScrollRef.current.scrollLeft = newScrollLeft;
          }
          if (rulerRef.current) {
            rulerRef.current.scrollLeft = newScrollLeft;
          }
          setScrollLeft(newScrollLeft);
        }}
      />

      {/* Toast Notification */}
      {feedbackToast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[100] pointer-events-none transition-opacity duration-300 ease-in-out">
          <div className="bg-black/90 text-white px-4 py-2 rounded-lg shadow-2xl border border-white/10 text-sm font-medium backdrop-blur-sm">
            {feedbackToast}
          </div>
        </div>
      )}

      {/* Clip Tooltip removed as per user request */}
    </div >
  );
};

export const Timeline = memo(TimelineComponent);
