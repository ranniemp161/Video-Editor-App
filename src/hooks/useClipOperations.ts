/**
 * useClipOperations - Clip manipulation operations
 * Handles move, split, delete, nudge, and selection operations
 */
import { useCallback, useMemo } from 'react';
import { TimelineState, TimelineClip, Asset } from '../types';

const FRAME_DURATION = 0.04; // 25fps default

type SetTimelineFunc = React.Dispatch<React.SetStateAction<TimelineState>>;
type PushHistoryFunc = (prev: TimelineState) => void;

export interface ClipOperationsConfig {
    isMagnetic: boolean;
    assets: Asset[];
    selectedClipIds: string[];
    setSelectedClipIds: React.Dispatch<React.SetStateAction<string[]>>;
    setTimeline: SetTimelineFunc;
    pushToHistory: PushHistoryFunc;
    clearFuture: () => void;
}

// Helper: Pack clips tightly on track (magnetic mode)
const packTrack = (clips: TimelineClip[]): TimelineClip[] => {
    const sorted = [...clips].sort((a, b) => a.start - b.start);
    let currentPos = 0;
    return sorted.map(c => {
        const duration = c.end - c.start;
        const updated = { ...c, start: currentPos, end: currentPos + duration };
        currentPos += duration;
        return updated;
    });
};

export const useClipOperations = (
    timeline: TimelineState,
    config: ClipOperationsConfig
) => {
    const {
        isMagnetic,
        assets,
        selectedClipIds,
        setSelectedClipIds,
        setTimeline,
        pushToHistory,
        clearFuture
    } = config;

    // Helper for fuzzy asset matching
    const findMatchingAsset = useCallback((assetId: string, name: string, sourceFileName?: string) => {
        let match = assets.find(a => a.id === assetId);
        if (match) return match;

        const clean = (s: string) => s.toLowerCase().split('.')[0].trim();

        if (sourceFileName) {
            const cleanSource = clean(sourceFileName);
            match = assets.find(a => clean(a.name) === cleanSource);
            if (match) return match;
        }

        const clipNameClean = clean(name);
        match = assets.find(a => clean(a.name) === clipNameClean);

        return match || null;
    }, [assets]);

    // Add clip to timeline
    const addClipToTimeline = useCallback((asset: Asset) => {
        setTimeline(prev => {
            const trackIdx = asset.type === 'video' ? 0 : 2;
            const track = prev.tracks[trackIdx];
            const lastClip = track.clips[track.clips.length - 1];
            const start = lastClip ? lastClip.end : 0;
            const end = start + asset.duration;

            const newClip: TimelineClip = {
                id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                assetId: asset.id,
                trackId: track.id,
                name: asset.name,
                sourceFileName: asset.name,
                start,
                end,
                trimStart: 0,
                trimEnd: asset.duration,
                opacity: 100,
                volume: 100,
            };

            const newTracks = prev.tracks.map((t, idx) =>
                idx === trackIdx ? { ...t, clips: [...t.clips, newClip] } : t
            );

            pushToHistory(prev);
            clearFuture();
            return { ...prev, tracks: newTracks };
        });
    }, [setTimeline, pushToHistory, clearFuture]);

    // Move single clip
    const moveClip = useCallback((clipId: string, trackId: string, newStart: number) => {
        setTimeline(prev => {
            const sourceTrack = prev.tracks.find(t => t.clips.some(c => c.id === clipId));
            const targetTrack = prev.tracks.find(t => t.id === trackId);

            if (!sourceTrack || !targetTrack || sourceTrack.locked || targetTrack.locked) return prev;

            const clip = sourceTrack.clips.find(c => c.id === clipId);
            if (!clip) return prev;

            const duration = clip.end - clip.start;
            const updatedClip: TimelineClip = { ...clip, start: newStart, end: newStart + duration, trackId };

            const finalTracks = prev.tracks.map(track => {
                let clips = track.clips.filter(c => c.id !== clipId);
                if (track.id === trackId) clips.push(updatedClip);

                if (isMagnetic) {
                    clips = packTrack(clips);
                }
                return { ...track, clips };
            });

            pushToHistory(prev);
            clearFuture();
            return { ...prev, tracks: finalTracks };
        });
    }, [isMagnetic, setTimeline, pushToHistory, clearFuture]);

    // Move multiple clips by delta
    const moveClips = useCallback((clipIds: string[], delta: number) => {
        setTimeline(prev => {
            let changed = false;
            const next = {
                ...prev,
                tracks: prev.tracks.map(track => {
                    if (track.locked) return track;

                    const hasClipsToMove = track.clips.some(c => clipIds.includes(c.id));
                    if (!hasClipsToMove) return track;

                    let clips = track.clips.map(clip => {
                        if (clipIds.includes(clip.id)) {
                            changed = true;
                            const newStart = Math.max(0, clip.start + delta);
                            const duration = clip.end - clip.start;
                            return { ...clip, start: newStart, end: newStart + duration };
                        }
                        return clip;
                    });

                    if (isMagnetic) {
                        clips = packTrack(clips);
                    }

                    return { ...track, clips };
                })
            };

            if (!changed) return prev;

            pushToHistory(prev);
            clearFuture();
            return next;
        });
    }, [isMagnetic, setTimeline, pushToHistory, clearFuture]);

    // Nudge clips (slip in magnetic mode, move in normal mode)
    const nudgeClips = useCallback((clipIds: string[], direction: 'left' | 'right', amount: number = FRAME_DURATION) => {
        const delta = direction === 'left' ? -amount : amount;

        if (isMagnetic) {
            // Slip content
            setTimeline(prev => {
                let changed = false;
                const next = {
                    ...prev,
                    tracks: prev.tracks.map(track => {
                        if (track.locked) return track;
                        return {
                            ...track,
                            clips: track.clips.map(clip => {
                                if (clipIds.includes(clip.id)) {
                                    changed = true;
                                    const asset = assets.find(a => a.id === clip.assetId);
                                    const assetDuration = asset?.duration || clip.trimEnd;

                                    let newTrimStart = clip.trimStart + delta;
                                    let newTrimEnd = clip.trimEnd + delta;

                                    if (newTrimStart < 0) {
                                        newTrimEnd -= newTrimStart;
                                        newTrimStart = 0;
                                    }
                                    if (newTrimEnd > assetDuration) {
                                        newTrimStart -= (newTrimEnd - assetDuration);
                                        newTrimEnd = assetDuration;
                                    }

                                    return { ...clip, trimStart: newTrimStart, trimEnd: newTrimEnd };
                                }
                                return clip;
                            })
                        };
                    })
                };

                if (!changed) return prev;
                pushToHistory(prev);
                clearFuture();
                return next;
            });
        } else {
            moveClips(clipIds, delta);
        }
    }, [isMagnetic, moveClips, assets, setTimeline, pushToHistory, clearFuture]);

    // Split clip at position
    const splitClip = useCallback((clipId: string, position: number) => {
        setTimeline(prev => {
            let changed = false;
            const next = {
                ...prev,
                tracks: prev.tracks.map(track => {
                    if (track.locked) return track;
                    const clip = track.clips.find(c => c.id === clipId);
                    if (clip && position > clip.start && position < clip.end) {
                        changed = true;
                        const firstHalf = {
                            ...clip,
                            id: `${clip.id}-1`,
                            end: position,
                            trimEnd: clip.trimStart + (position - clip.start)
                        };
                        const secondHalf = {
                            ...clip,
                            id: `${clip.id}-2`,
                            start: position,
                            trimStart: clip.trimStart + (position - clip.start)
                        };
                        return { ...track, clips: [...track.clips.filter(c => c.id !== clipId), firstHalf, secondHalf] };
                    }
                    return track;
                })
            };

            if (changed) {
                pushToHistory(prev);
                clearFuture();
            }
            return next;
        });
    }, [setTimeline, pushToHistory, clearFuture]);

    // Delete clip(s)
    const deleteClip = useCallback((clipId?: string) => {
        const idsToDelete = clipId ? [clipId] : selectedClipIds;
        if (idsToDelete.length === 0) return;

        setTimeline(prev => {
            const next = {
                ...prev,
                tracks: prev.tracks.map(track => {
                    if (track.locked) return track;
                    let clips = track.clips.filter(c => !idsToDelete.includes(c.id));
                    if (isMagnetic) {
                        clips = packTrack(clips);
                    }
                    return { ...track, clips };
                })
            };
            pushToHistory(prev);
            clearFuture();
            return next;
        });
        setSelectedClipIds([]);
    }, [selectedClipIds, isMagnetic, setTimeline, setSelectedClipIds, pushToHistory, clearFuture]);

    // Update clip properties
    const updateClip = useCallback((clipId: string, updates: Partial<TimelineClip>) => {
        setTimeline(prev => {
            const next = {
                ...prev,
                tracks: prev.tracks.map(track => {
                    if (track.locked) return track;
                    let clips = track.clips.map(clip =>
                        clip.id === clipId ? { ...clip, ...updates } : clip
                    );
                    if (isMagnetic) {
                        clips = packTrack(clips);
                    }
                    return { ...track, clips };
                })
            };
            pushToHistory(prev);
            clearFuture();
            return next;
        });
    }, [isMagnetic, setTimeline, pushToHistory, clearFuture]);

    // Select clip
    const onSelectClip = useCallback((clipId: string, multiSelect: boolean = false) => {
        if (multiSelect) {
            setSelectedClipIds(prev =>
                prev.includes(clipId) ? prev.filter(id => id !== clipId) : [...prev, clipId]
            );
        } else {
            setSelectedClipIds([clipId]);
        }
    }, [setSelectedClipIds]);

    // Select all clips
    const selectAllClips = useCallback(() => {
        const allIds = timeline.tracks.flatMap(track => track.clips.map(clip => clip.id));
        setSelectedClipIds(allIds);
    }, [timeline, setSelectedClipIds]);

    return {
        findMatchingAsset,
        addClipToTimeline,
        moveClip,
        moveClips,
        nudgeClips,
        splitClip,
        deleteClip,
        updateClip,
        onSelectClip,
        selectAllClips,
        packTrack,
    };
};
