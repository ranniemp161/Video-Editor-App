
import { useCallback } from 'react';
import { TimelineClip, Asset } from '../types';
import { TimelineStateHook } from './useTimelineState';

const FRAME_DURATION = 0.04;

export const useClipManagement = (state: TimelineStateHook) => {
    const {
        timeline, setTimeline,
        setPast, setFuture,
        isMagnetic, assets,
        selectedClipIds, setSelectedClipIds
    } = state;

    const packTrack = useCallback((clips: TimelineClip[]) => {
        const sorted = [...clips].sort((a, b) => a.start - b.start);
        let currentPos = 0;
        return sorted.map(c => {
            const trueDuration = c.trimEnd - c.trimStart;
            const updated = {
                ...c,
                start: currentPos,
                end: currentPos + trueDuration
            };
            currentPos += trueDuration;
            return updated;
        });
    }, []);

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

            const next = { ...prev, tracks: newTracks };
            setPast(p => [...p, prev].slice(-50));
            setFuture([]);
            return next;
        });
    }, [setTimeline, setPast, setFuture]);

    const moveClip = useCallback((clipId: string, trackId: string, newStart: number) => {
        setTimeline(prev => {
            const sourceTrack = prev.tracks.find(t => t.clips.some(c => c.id === clipId));
            const targetTrack = prev.tracks.find(t => t.id === trackId);

            if (!sourceTrack || !targetTrack || sourceTrack.locked || targetTrack.locked) return prev;

            const clip = sourceTrack.clips.find(c => c.id === clipId);
            if (!clip) return prev;

            const duration = clip.end - clip.start;
            const updatedTargetClip: TimelineClip = { ...clip, start: newStart, end: newStart + duration, trackId };

            const finalTracks = prev.tracks.map(track => {
                let clips = track.clips.filter(c => c.id !== clipId);
                if (track.id === trackId) clips.push(updatedTargetClip);

                if (isMagnetic) {
                    clips.sort((a, b) => a.start - b.start);
                    let currentPos = 0;
                    clips = clips.map(c => {
                        const d = c.end - c.start;
                        const updated = { ...c, start: currentPos, end: currentPos + d };
                        currentPos += d;
                        return updated;
                    });
                }
                return { ...track, clips };
            });

            const next = { ...prev, tracks: finalTracks };
            setPast(p => [...p, prev].slice(-50));
            setFuture([]);
            return next;
        });
    }, [setTimeline, setPast, setFuture, isMagnetic]);

    const moveClips = useCallback((clipIds: string[], delta: number) => {
        setTimeline(prev => {
            const next = { ...prev };
            let changed = false;

            next.tracks = next.tracks.map(track => {
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
                    clips.sort((a, b) => a.start - b.start);
                    let currentPos = 0;
                    clips = clips.map(c => {
                        const d = c.end - c.start;
                        const updated = { ...c, start: currentPos, end: currentPos + d };
                        currentPos += d;
                        return updated;
                    });
                }

                return { ...track, clips };
            });

            if (!changed) return prev;

            setPast(p => [...p, prev].slice(-50));
            setFuture([]);
            return next;
        });
    }, [setTimeline, setPast, setFuture, isMagnetic]);

    const nudgeClips = useCallback((clipIds: string[], direction: 'left' | 'right', amount: number = FRAME_DURATION) => {
        const delta = direction === 'left' ? -amount : amount;

        if (isMagnetic) {
            setTimeline(prev => {
                const next = { ...prev };
                let changed = false;

                next.tracks = next.tracks.map(track => {
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
                });

                if (!changed) return prev;
                setPast(p => [...p, prev].slice(-50));
                setFuture([]);
                return next;
            });
        } else {
            moveClips(clipIds, delta);
        }
    }, [setTimeline, setPast, setFuture, moveClips, isMagnetic, assets]);

    const nudgeClipEdge = useCallback((clipId: string, edge: 'start' | 'end', direction: 'left' | 'right', amount: number = FRAME_DURATION) => {
        const delta = direction === 'left' ? -amount : amount;
        setTimeline(prev => {
            const next = { ...prev };
            let changed = false;

            next.tracks = next.tracks.map(track => {
                if (track.locked) return track;
                let clips = track.clips.map(clip => {
                    if (clip.id === clipId) {
                        changed = true;
                        if (edge === 'start') {
                            const newTrimStart = Math.max(0, clip.trimStart + delta);
                            if (newTrimStart > clip.trimEnd - 0.1) return clip;

                            const durationChange = clip.trimStart - newTrimStart;
                            const newStart = Math.max(0, clip.start - durationChange);
                            const newEnd = newStart + (clip.trimEnd - newTrimStart);

                            return {
                                ...clip,
                                trimStart: newTrimStart,
                                start: newStart,
                                end: newEnd
                            };
                        } else {
                            const asset = assets.find(a => a.id === clip.assetId);
                            const assetDuration = asset?.duration || clip.end + 10;
                            const newTrimEnd = Math.max(clip.trimStart + 0.1, Math.min(assetDuration, clip.trimEnd + delta));

                            return {
                                ...clip,
                                trimEnd: newTrimEnd,
                                end: clip.start + (newTrimEnd - clip.trimStart)
                            };
                        }
                    }
                    return clip;
                });

                if (isMagnetic) {
                    clips.sort((a, b) => a.start - b.start);
                    let currentPos = 0;
                    clips = clips.map(c => {
                        const d = c.end - c.start;
                        const updated = { ...c, start: currentPos, end: currentPos + d };
                        currentPos += d;
                        return updated;
                    });
                }

                return { ...track, clips };
            });

            if (!changed) return prev;
            setPast(p => [...p, prev].slice(-50));
            setFuture([]);
            return next;
        });
    }, [setTimeline, setPast, setFuture, isMagnetic, assets]);

    const splitClip = useCallback((clipId: string, position: number) => {
        setTimeline(prev => {
            const next = {
                ...prev,
                tracks: prev.tracks.map(track => {
                    if (track.locked) return track;
                    const clip = track.clips.find(c => c.id === clipId);
                    if (clip && position > clip.start && position < clip.end) {
                        const firstHalf = { ...clip, id: `${clip.id}-1`, end: position, trimEnd: clip.trimStart + (position - clip.start) };
                        const secondHalf = { ...clip, id: `${clip.id}-2`, start: position, trimStart: clip.trimStart + (position - clip.start) };
                        return { ...track, clips: [...track.clips.filter(c => c.id !== clipId), firstHalf, secondHalf] };
                    }
                    return track;
                })
            };
            if (next !== prev) {
                setPast(p => [...p, prev].slice(-50));
                setFuture([]);
            }
            return next;
        });
    }, [setTimeline, setPast, setFuture]);

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
                        clips.sort((a, b) => a.start - b.start);
                        let currentPos = 0;
                        clips = clips.map(c => {
                            const d = c.end - c.start;
                            const updated = { ...c, start: currentPos, end: currentPos + d };
                            currentPos += d;
                            return updated;
                        });
                    }
                    return { ...track, clips };
                })
            };
            setPast(p => [...p, prev].slice(-50));
            setFuture([]);
            return next;
        });
        setSelectedClipIds([]);
    }, [setTimeline, setPast, setFuture, selectedClipIds, isMagnetic, setSelectedClipIds]);

    const updateClip = useCallback((clipId: string, updates: Partial<TimelineClip>) => {
        setTimeline(prev => {
            const next = {
                ...prev,
                tracks: prev.tracks.map(track => {
                    if (track.locked) return track;
                    let clips = track.clips.map(clip => {
                        if (clip.id === clipId) {
                            const merged = { ...clip, ...updates };

                            if (updates.trimStart !== undefined || updates.trimEnd !== undefined) {
                                const asset = assets.find(a => a.id === clip.assetId);
                                const duration = asset?.duration || clip.trimEnd;

                                if (merged.trimStart < 0) merged.trimStart = 0;
                                if (merged.trimEnd > duration) merged.trimEnd = duration;
                                if (merged.trimEnd - merged.trimStart < 0.1) return clip;
                            }
                            return merged;
                        }
                        return clip;
                    });
                    if (isMagnetic) {
                        clips.sort((a, b) => a.start - b.start);
                        let currentPos = 0;
                        clips = clips.map(c => {
                            const d = c.end - c.start;
                            const updated = { ...c, start: currentPos, end: currentPos + d };
                            currentPos += d;
                            return updated;
                        });
                    }
                    return { ...track, clips };
                })
            };
            setPast(p => [...p, prev].slice(-50));
            setFuture([]);
            return next;
        });
    }, [setTimeline, setPast, setFuture, isMagnetic, assets]);

    const splitClipAtPlayhead = useCallback((playheadPosition: number) => {
        const position = playheadPosition;
        let splitOccurred = false;

        setTimeline(prev => {
            const next = {
                ...prev,
                tracks: prev.tracks.map(track => {
                    if (track.locked) return track;
                    const clip = track.clips.find(c => position > c.start && position < c.end);
                    if (clip) {
                        splitOccurred = true;
                        const firstHalf = { ...clip, id: `${clip.id}-1`, end: position, trimEnd: clip.trimStart + (position - clip.start) };
                        const secondHalf = { ...clip, id: `${clip.id}-2`, start: position, trimStart: clip.trimStart + (position - clip.start) };

                        setSelectedClipIds([secondHalf.id]);

                        return { ...track, clips: [...track.clips.filter(c => c.id !== clip.id), firstHalf, secondHalf] };
                    }
                    return track;
                })
            };

            if (splitOccurred) {
                setPast(p => [...p, prev].slice(-50));
                setFuture([]);
            }

            return next;
        });
    }, [setTimeline, setPast, setFuture, setSelectedClipIds]);

    const rippleDelete = useCallback((clipIds?: string[]) => {
        const idsToDelete = clipIds || selectedClipIds;
        if (idsToDelete.length === 0) return;

        setTimeline(prev => {
            const next = {
                ...prev,
                tracks: prev.tracks.map(track => {
                    if (track.locked) return track;

                    const deletedRanges: Array<{ start: number; end: number }> = [];
                    track.clips.forEach(clip => {
                        if (idsToDelete.includes(clip.id)) {
                            deletedRanges.push({ start: clip.start, end: clip.end });
                        }
                    });

                    let clips = track.clips.filter(c => !idsToDelete.includes(c.id));
                    deletedRanges.sort((a, b) => a.start - b.start);
                    let cumulativeShift = 0;

                    deletedRanges.forEach(range => {
                        const gapDuration = range.end - range.start;
                        clips = clips.map(clip => {
                            if (clip.start >= range.end - cumulativeShift) {
                                return {
                                    ...clip,
                                    start: clip.start - gapDuration,
                                    end: clip.end - gapDuration
                                };
                            }
                            return clip;
                        });
                        cumulativeShift += gapDuration;
                    });

                    return { ...track, clips };
                })
            };

            setPast(p => [...p, prev].slice(-50));
            setFuture([]);
            return next;
        });

        setSelectedClipIds([]);
    }, [setTimeline, setPast, setFuture, selectedClipIds, setSelectedClipIds]);

    const toggleTrackMute = useCallback((trackId: string) => {
        setTimeline(prev => {
            const next = {
                ...prev,
                tracks: prev.tracks.map(t => t.id === trackId ? { ...t, muted: !t.muted } : t)
            };
            setPast(p => [...p, prev].slice(-50));
            setFuture([]);
            return next;
        });
    }, [setTimeline, setPast, setFuture]);

    const toggleTrackLock = useCallback((trackId: string) => {
        setTimeline(prev => {
            const next = {
                ...prev,
                tracks: prev.tracks.map(t => t.id === trackId ? { ...t, locked: !t.locked } : t)
            };
            setPast(p => [...p, prev].slice(-50));
            setFuture([]);
            return next;
        });
    }, [setTimeline, setPast, setFuture]);

    const setTrackHeight = useCallback((trackId: string, height: number) => {
        setTimeline(prev => ({
            ...prev,
            tracks: prev.tracks.map(t =>
                t.id === trackId ? { ...t, height: Math.max(40, Math.min(200, height)) } : t
            )
        }));
    }, [setTimeline]);

    const selectAllClips = useCallback(() => {
        const allIds = timeline.tracks.flatMap(track => track.clips.map(clip => clip.id));
        setSelectedClipIds(allIds);
    }, [timeline, setSelectedClipIds]);

    const onSelectClip = useCallback((clipId: string | null, append = false) => {
        if (clipId === null) {
            setSelectedClipIds([]);
            return;
        }

        setSelectedClipIds(prev => {
            if (append) {
                if (prev.includes(clipId)) {
                    return prev.filter(id => id !== clipId);
                }
                return [...prev, clipId];
            }
            return [clipId];
        });
    }, [setSelectedClipIds]);

    const selectClipsInRange = useCallback((startTime: number, endTime: number, trackIds?: string[]) => {
        const clipsInRange: string[] = [];

        timeline.tracks.forEach(track => {
            if (trackIds && !trackIds.includes(track.id)) return;

            track.clips.forEach(clip => {
                if (clip.start < endTime && clip.end > startTime) {
                    clipsInRange.push(clip.id);
                }
            });
        });

        setSelectedClipIds(clipsInRange);
    }, [timeline, setSelectedClipIds]);

    return {
        packTrack,
        addClipToTimeline,
        moveClip,
        moveClips,
        nudgeClips,
        nudgeClipEdge,
        splitClip,
        deleteClip,
        updateClip,
        splitClipAtPlayhead,
        rippleDelete,
        toggleTrackMute,
        toggleTrackLock,
        setTrackHeight,
        selectAllClips,
        onSelectClip,
        selectClipsInRange,
    };
};
