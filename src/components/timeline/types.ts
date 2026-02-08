import React from 'react';
import { TimelineState, Asset, TimelineClip, TimelineMarker } from '../../types';

// --- Timeline Constants ---
export const HEADER_WIDTH = 120;
export const MIN_PPS = 2;       // Max Zoom Out (2px per second)
export const MAX_PPS = 200;     // Max Zoom In (200px per second)

export const TICK_INTERVALS = [
    0.1, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 3600
];

// --- Props Interfaces ---
export interface TimelineProps {
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
    onSplitAtPlayhead?: () => void;
    onSelectClipsInRange?: (startTime: number, endTime: number) => void;
    onSetTrackHeight?: (trackId: string, height: number) => void;
    onClipsMove?: (clipIds: string[], delta: number) => void;
}

export interface ClipProps {
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
    onShowTooltip?: (data: ClipTooltipData) => void;
    onHideTooltip?: () => void;
}

export interface ClipTooltipData {
    clipId: string;
    x: number;
    y: number;
    name: string;
    duration: string;
    trimInfo: string;
}

export interface RulerData {
    ticks: Array<{ time: number; isMajor: boolean; isMid: boolean }>;
    majorInterval: number;
}
