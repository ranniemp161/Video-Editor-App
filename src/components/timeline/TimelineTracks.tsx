import React, { memo, RefObject } from 'react';
import { TimelineState, Asset, TimelineClip } from '../../types';
import { TimelineClipItem } from './TimelineClipItem';
import { ClipTooltipData } from './types';

interface TimelineTracksProps {
    timeline: TimelineState;
    TRACK_HEIGHT: number;
    TRACK_GAP: number;
    pixelsPerSecond: number;
    scrollLeft: number;
    containerWidth: number;
    selectedClipIds: string[];
    onSelectClip: (clipId: string | null, append?: boolean) => void;
    handleDragStart: (e: React.DragEvent, clipId: string) => void;
    setDraggingClip: (value: { clipId: string; offsetX: number } | null) => void;
    handleTrimStart: (e: React.MouseEvent, clip: TimelineClip) => void;
    handleTrimEnd: (e: React.MouseEvent, clip: TimelineClip) => void;
    onClipUpdate: (clipId: string, updates: Partial<TimelineClip>) => void;
    setClipTooltip: (data: ClipTooltipData | null) => void;
    handleDragOver: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent, trackId: string) => void;
    setIsSelectingBox: (value: boolean) => void;
    setSelectionBox: (value: { startX: number; startY: number; endX: number; endY: number } | null) => void;
    tracksScrollRef: RefObject<HTMLDivElement>;
    getAssetByClip: (clip: TimelineClip) => Asset | null;
}

export const TimelineTracks = memo(({
    timeline,
    TRACK_HEIGHT,
    TRACK_GAP,
    pixelsPerSecond,
    scrollLeft,
    containerWidth,
    selectedClipIds,
    onSelectClip,
    handleDragStart,
    setDraggingClip,
    handleTrimStart,
    handleTrimEnd,
    onClipUpdate,
    setClipTooltip,
    handleDragOver,
    handleDrop,
    setIsSelectingBox,
    setSelectionBox,
    tracksScrollRef,
    getAssetByClip
}: TimelineTracksProps) => {
    return (
        <>
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
                    {track.clips.map((clip) => {
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
                                isLocked={track.locked || false}
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
        </>
    );
});

TimelineTracks.displayName = 'TimelineTracks';
