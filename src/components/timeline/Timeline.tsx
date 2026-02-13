
import React, { useRef, memo, useState, useMemo, useEffect, useCallback } from 'react';
import { TimelineState, Asset, TimelineClip, TimelineMarker } from '../../types';
import { TIMELINE_CONSTANTS } from '../../constants';
import { MarkerFlag } from '../MarkerFlag';
import { TimelineMinimap } from '../TimelineMinimap';

// Import extracted components
import { TimelineProps, HEADER_WIDTH, MIN_PPS, MAX_PPS, TICK_INTERVALS, ClipTooltipData } from './types';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTracks } from './TimelineTracks';

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
    onSplitAtPlayhead,
    onSelectClipsInRange,
    onSetTrackHeight,
    onClipsMove,
}) => {
    const rulerRef = useRef<HTMLDivElement>(null);
    const tracksScrollRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const { TRACK_HEIGHT, TRACK_GAP } = TIMELINE_CONSTANTS;
    const [pixelsPerSecond, setPixelsPerSecond] = useState(30);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [containerWidth, setContainerWidth] = useState(0);
    const [isSnappingEnabled, setIsSnappingEnabled] = useState(true);
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const [snapGuideTime, setSnapGuideTime] = useState<number | null>(null);
    const lastMouseXRef = useRef<number>(0);

    const [isRippleMode, setIsRippleMode] = useState(false);
    const [isSelectingBox, setIsSelectingBox] = useState(false);
    const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
    const [hoveredClip, setHoveredClip] = useState<string | null>(null);
    const [trimTooltip, setTrimTooltip] = useState<{ clipId: string; side: 'start' | 'end'; value: string } | null>(null);

    const [clipTooltip, setClipTooltip] = useState<ClipTooltipData | null>(null);
    const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
    const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const lastScrubTimeRef = useRef<number | null>(null);
    const scrollLeftRef = useRef(scrollLeft);
    const selectedClipIdsRef = useRef(selectedClipIds);
    const timelineRef = useRef(timeline);

    useEffect(() => {
        scrollLeftRef.current = scrollLeft;
    }, [scrollLeft]);

    useEffect(() => {
        selectedClipIdsRef.current = selectedClipIds;
    }, [selectedClipIds]);

    useEffect(() => {
        timelineRef.current = timeline;
    }, [timeline]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const left = e.currentTarget.scrollLeft;
        setScrollLeft(left);

        if (e.currentTarget === rulerRef.current && tracksScrollRef.current) {
            tracksScrollRef.current.scrollLeft = left;
        } else if (e.currentTarget === tracksScrollRef.current && rulerRef.current) {
            rulerRef.current.scrollLeft = left;
        }
    };

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

    const handleWheel = useCallback((e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();

            const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95;
            const newPPS = Math.min(Math.max(pixelsPerSecond * zoomFactor, MIN_PPS), MAX_PPS);

            if (newPPS === pixelsPerSecond) return;

            const scrollContainer = tracksScrollRef.current;
            if (scrollContainer) {
                const rect = scrollContainer.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseTime = (scrollLeft + mouseX) / pixelsPerSecond;
                const newScrollLeft = (mouseTime * newPPS) - mouseX;

                setPixelsPerSecond(newPPS);
                scrollContainer.scrollLeft = newScrollLeft;
                if (rulerRef.current) rulerRef.current.scrollLeft = newScrollLeft;
                setScrollLeft(newScrollLeft);
            } else {
                setPixelsPerSecond(newPPS);
            }
        }
    }, [pixelsPerSecond, scrollLeft]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

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

    const getSnappedTime = useCallback((time: number): number => {
        if (!isSnappingEnabled) return time;
        const threshold = 10 / pixelsPerSecond;

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
    }, [isSnappingEnabled, pixelsPerSecond, timeline]);

    const rulerData = useMemo(() => {
        const minPixelsPerMajorTick = 100;
        const targetInterval = minPixelsPerMajorTick / pixelsPerSecond;
        const majorInterval = TICK_INTERVALS.find(t => t >= targetInterval) || 3600;

        let midInterval = majorInterval / 2;
        let minorInterval = majorInterval / 10;

        if (majorInterval === 1) { midInterval = 0.5; minorInterval = 0.1; }
        if (majorInterval === 0.5) { midInterval = 0.1; minorInterval = 0.05; }

        const startPixel = scrollLeft;
        const endPixel = scrollLeft + containerWidth;
        const buffer = 200;

        const startTime = Math.max(0, (startPixel - buffer) / pixelsPerSecond);
        const endTime = Math.min(totalDuration, (endPixel + buffer) / pixelsPerSecond);

        const ticks: Array<{ time: number; isMajor: boolean; isMid: boolean }> = [];
        const alignTo = (t: number, interval: number) => Math.floor(t / interval) * interval;
        const startTick = alignTo(startTime, minorInterval);
        const epsilon = 0.0001;

        for (let t = startTick; t <= endTime; t += minorInterval) {
            const isMajor = Math.abs(t % majorInterval) < epsilon || Math.abs(majorInterval - (t % majorInterval)) < epsilon;
            const isMid = !isMajor && (Math.abs(t % midInterval) < epsilon || Math.abs(midInterval - (t % midInterval)) < epsilon);
            ticks.push({ time: t, isMajor, isMid });
        }

        return { ticks, majorInterval };
    }, [pixelsPerSecond, scrollLeft, containerWidth, totalDuration]);

    const [draggingClip, setDraggingClip] = useState<{ clipId: string; offsetX: number } | null>(null);

    const handleDragStart = useCallback((e: React.DragEvent, clipId: string) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        setDraggingClip({ clipId, offsetX });
        e.dataTransfer.setData('text/plain', clipId);
        e.dataTransfer.effectAllowed = 'move';
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

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
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, trackId: string) => {
        e.preventDefault();
        if (!draggingClip) return;
        const trackElement = e.currentTarget as HTMLElement;
        const rect = trackElement.getBoundingClientRect();
        const dropX = e.clientX - rect.left;
        let newStart = Math.max(0, (dropX - draggingClip.offsetX) / pixelsPerSecond);
        onClipMove(draggingClip.clipId, trackId, newStart);
        setDraggingClip(null);
    }, [draggingClip, pixelsPerSecond, onClipMove]);

    const handleRulerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!rulerRef.current) return;
        const rect = rulerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + scrollLeft;
        const time = x / pixelsPerSecond;
        onPlayheadUpdate(getSnappedTime(time));
        onSelectClip(null);
    }, [scrollLeft, pixelsPerSecond, onPlayheadUpdate, onSelectClip, getSnappedTime]);

    const handleScrubStart = useCallback((e: React.MouseEvent) => {
        setIsScrubbing(true);
        handleRulerClick(e as any);
    }, [handleRulerClick]);

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
        if (e.button === 1) {
            e.preventDefault();
            setIsPanning(true);
            lastMouseXRef.current = e.clientX;
            document.body.style.cursor = 'grabbing';
        }
    };

    const [trimming, setTrimming] = React.useState<{ clipId: string; side: 'start' | 'end'; initialX: number; initialClipStart: number; initialClipEnd: number; initialTrimStart: number; initialTrimEnd: number } | null>(null);

    const handleTrimStart = useCallback((e: React.MouseEvent, clip: TimelineClip) => {
        e.stopPropagation();
        setTrimming({ clipId: clip.id, side: 'start', initialX: e.clientX, initialClipStart: clip.start, initialClipEnd: clip.end, initialTrimStart: clip.trimStart, initialTrimEnd: clip.trimEnd });
    }, []);

    const handleTrimEnd = useCallback((e: React.MouseEvent, clip: TimelineClip) => {
        e.stopPropagation();
        setTrimming({ clipId: clip.id, side: 'end', initialX: e.clientX, initialClipStart: clip.start, initialClipEnd: clip.end, initialTrimStart: clip.trimStart, initialTrimEnd: clip.trimEnd });
    }, []);

    React.useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!trimming) return;
            let deltaX = (e.clientX - trimming.initialX) / pixelsPerSecond;

            const targetClip = timeline.tracks.flatMap(t => t.clips).find(c => c.id === trimming.clipId);
            const asset = targetClip ? getAssetByClip(targetClip) : null;

            if (isSnappingEnabled && asset?.transcription?.words) {
                const threshold = 0.15;
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

                if (newTrimStart >= 0 && newStart < trimming.initialClipEnd - 0.1) {
                    onClipUpdate(trimming.clipId, { start: newStart, trimStart: newTrimStart });
                }
            } else {
                const newEnd = trimming.initialClipEnd + deltaX;
                const actualDelta = newEnd - trimming.initialClipEnd;
                const newTrimEnd = trimming.initialTrimEnd + actualDelta;

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

    const showToast = useCallback((message: string) => {
        setFeedbackToast(message);
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => setFeedbackToast(null), 2000);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 's' || e.key === 'S') {
                if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                    e.preventDefault();
                    onSplitAtPlayhead?.();
                    showToast('Split at playhead');
                }
            }

            if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                const ids = selectedClipIdsRef.current;
                if (ids.length > 0) {
                    e.preventDefault();
                    const step = 0.1;
                    const delta = (e.key === 'ArrowLeft' ? -1 : 1) * step;
                    onClipsMove?.(ids, delta);
                    showToast(`Moved ${ids.length} clip${ids.length > 1 ? 's' : ''} ${e.key === 'ArrowLeft' ? 'left' : 'right'}`);
                }
            }

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
                    <span className="text-xs text-gray-400 font-mono min-w-[45px] text-right">{Math.round((pixelsPerSecond / 30) * 100)}%</span>
                </div>
            </div>

            {/* Top Bar with Ruler */}
            <div className="flex h-8 border-b border-[#333] bg-[#121212]">
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

                <TimelineRuler
                    rulerRef={rulerRef}
                    handleScroll={handleScroll}
                    handleScrubStart={handleScrubStart}
                    handleContextMenu={(e: React.MouseEvent) => e.preventDefault()}
                    setIsPanning={setIsPanning}
                    lastMouseXRef={lastMouseXRef}
                    timelineWidth={timelineWidth}
                    pixelsPerSecond={pixelsPerSecond}
                    rulerData={rulerData}
                />
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
                    <TimelineTracks
                        timeline={timeline}
                        TRACK_HEIGHT={TRACK_HEIGHT}
                        TRACK_GAP={TRACK_GAP}
                        pixelsPerSecond={pixelsPerSecond}
                        scrollLeft={scrollLeft}
                        containerWidth={containerWidth}
                        selectedClipIds={selectedClipIds}
                        onSelectClip={onSelectClip}
                        handleDragStart={handleDragStart}
                        setDraggingClip={setDraggingClip}
                        handleTrimStart={handleTrimStart}
                        handleTrimEnd={handleTrimEnd}
                        onClipUpdate={onClipUpdate}
                        setClipTooltip={setClipTooltip}
                        handleDragOver={handleDragOver}
                        handleDrop={handleDrop}
                        setIsSelectingBox={setIsSelectingBox}
                        setSelectionBox={setSelectionBox}
                        tracksScrollRef={tracksScrollRef}
                        getAssetByClip={getAssetByClip}
                    />

                    <TimelinePlayhead position={playheadPosition} pixelsPerSecond={pixelsPerSecond} />

                    {snapGuideTime !== null && (
                        <div
                            className="absolute top-0 bottom-0 w-[1px] bg-cyan-400 z-30 pointer-events-none opacity-50"
                            style={{ left: `${snapGuideTime * pixelsPerSecond}px` }}
                        >
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-cyan-400 blur-[2px]"></div>
                        </div>
                    )}

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

            {feedbackToast && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[100] pointer-events-none transition-opacity duration-300 ease-in-out">
                    <div className="bg-black/90 text-white px-4 py-2 rounded-lg shadow-2xl border border-white/10 text-sm font-medium backdrop-blur-sm">
                        {feedbackToast}
                    </div>
                </div>
            )}
        </div>
    );
};

export const Timeline = memo(TimelineComponent);
