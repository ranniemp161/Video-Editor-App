
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { TimelineState, Asset, TimelineClip } from '../types';

export const useTimelineState = () => {
    const [timeline, setTimeline] = useState<TimelineState>({
        tracks: [
            { id: 'v1', type: 'video', clips: [], muted: false, locked: false },
            { id: 'v2', type: 'video', clips: [], muted: false, locked: false },
            { id: 'a1', type: 'audio', clips: [], muted: false, locked: false },
        ]
    });

    const [past, setPast] = useState<TimelineState[]>([]);
    const [future, setFuture] = useState<TimelineState[]>([]);

    const pushToHistory = useCallback((newState: TimelineState) => {
        setPast(prev => [...prev, timeline].slice(-50));
        setFuture([]);
        setTimeline(newState);
    }, [timeline]);

    const undo = useCallback(() => {
        if (past.length === 0) return;
        const previous = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);

        setFuture(prev => [timeline, ...prev]);
        setPast(newPast);
        setTimeline(previous);
    }, [past, timeline]);

    const redo = useCallback(() => {
        if (future.length === 0) return;
        const next = future[0];
        const newFuture = future.slice(1);

        setPast(prev => [...prev, timeline]);
        setFuture(newFuture);
        setTimeline(next);
    }, [future, timeline]);

    const [assets, setAssets] = useState<Asset[]>([]);
    const [playheadPosition, setPlayheadPosition] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
    const [isMagnetic, setIsMagnetic] = useState(true);
    const [projectId, setProjectId] = useState<string | null>(null);
    const [segments, setSegments] = useState<any[]>([]);

    return {
        timeline, setTimeline,
        past, setPast,
        future, setFuture,
        pushToHistory,
        undo, redo,
        assets, setAssets,
        playheadPosition, setPlayheadPosition,
        isPlaying, setIsPlaying,
        selectedClipIds, setSelectedClipIds,
        isMagnetic, setIsMagnetic,
        projectId, setProjectId,
        segments, setSegments,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
    };
};

export type TimelineStateHook = ReturnType<typeof useTimelineState>;
