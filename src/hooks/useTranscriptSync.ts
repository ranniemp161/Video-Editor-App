
import { useCallback, useState } from 'react';
import { TimelineClip } from '../types';
import { TimelineStateHook } from './useTimelineState';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const useTranscriptSync = (state: TimelineStateHook) => {
    const {
        assets, setAssets,
        projectId, segments, setSegments,
        timeline, setTimeline,
        setPast, setFuture,
        isMagnetic
    } = state;

    const [isTranscribing, setIsTranscribing] = useState<string | null>(null);
    const [transcriptionProgress, setTranscriptionProgress] = useState(0);
    const [isAutoCutting, setIsAutoCutting] = useState(false);

    const transcribeAsset = useCallback(async (assetId: string, fileName: string) => {
        setIsTranscribing(assetId);
        setTranscriptionProgress(0);

        const asset = assets.find(a => a.id === assetId);
        if (!asset) {
            setIsTranscribing(null);
            return;
        }

        // Build the most reliable video path:
        // 1. Use remoteSrc (set after upload completes, e.g. "/uploads/uuid/file.mp4")
        // 2. Fall back to constructing from projectId
        // 3. Last resort: bare fileName
        const videoPath = asset.remoteSrc ||
            (projectId ? `/uploads/${projectId}/${fileName}` : fileName);

        console.log('Transcribe: sending videoPath =', videoPath, '| projectId =', projectId || assetId);

        const pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE}/transcription-progress?videoPath=${encodeURIComponent(videoPath)}`);
                const data = await res.json();
                setTranscriptionProgress(data.progress || 0);
            } catch (e) { console.error(e); }
        }, 1000);

        try {
            const response = await fetch(`${API_BASE}/transcribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoPath,
                    duration: asset.duration,
                    projectId: projectId || assetId
                })
            });
            const result = await response.json();
            if (result.success) {
                if (result.segments) setSegments(result.segments);

                const rawWords: any[] = result.transcription?.words || [];
                const transcriptionWithSource = {
                    transcription: result.transcription?.text || '',
                    words: rawWords.map((w: any) => ({
                        word: w.word,
                        start: w.start,
                        end: w.end,
                        score: w.score
                    })),
                    source: 'ai' as const
                };
                setAssets(prev => prev.map(a => a.id === assetId ? { ...a, transcription: transcriptionWithSource } : a));
            } else {
                alert(`Transcription failed: ${result.error || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('Transcription failed:', err);
        } finally {
            clearInterval(pollInterval);
            setTranscriptionProgress(0);
            setIsTranscribing(null);
        }
    }, [assets, projectId, setSegments, setAssets]);

    const refineTranscript = useCallback(async (assetId: string) => {
        if (!projectId) return;

        try {
            const res = await fetch(`${API_BASE}/project/${projectId}/refine-transcript`, {
                method: 'POST'
            });
            const data = await res.json();

            if (data.success && data.words) {
                setAssets(prev => prev.map(a => {
                    if (a.id === assetId || a.id === projectId) {
                        if (a.transcription) {
                            return {
                                ...a,
                                transcription: { ...a.transcription, words: data.words }
                            };
                        }
                    }
                    return a;
                }));
            } else {
                alert(`Refinement failed: ${data.error}`);
            }
        } catch (e) {
            console.error("Refinement error:", e);
        }
    }, [projectId, setAssets]);

    const autoCutAsset = useCallback(async (assetId: string) => {
        const asset = assets.find(a => a.id === assetId);
        if (!asset || !asset.transcription) return;

        const backendAssetId = projectId || assetId;
        setIsAutoCutting(true);
        try {
            const response = await fetch(`${API_BASE}/auto-cut`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    words: asset.transcription.words,
                    asset: {
                        id: backendAssetId,
                        name: asset.name,
                        duration: asset.duration
                    },
                    trackId: 'v1'
                })
            });

            const data = await response.json();

            if (data.clips && data.clips.length > 0) {
                const remappedClips = data.clips.map((c: any) => ({ ...c, assetId }));
                setTimeline(prev => {
                    const newTracks = prev.tracks.map(track => {
                        if (track.id === 'v1') return { ...track, clips: remappedClips };
                        return track;
                    });
                    return { ...prev, tracks: newTracks };
                });
            } else {
                alert('Auto-cut returned no clips.');
            }
        } catch (err) {
            console.error('Auto-cut failed:', err);
        } finally {
            setIsAutoCutting(false);
        }
    }, [assets, projectId, setTimeline]);

    const toggleSegmentDelete = useCallback(async (start: number) => {
        if (!projectId) return;

        const newSegments = segments.map(s => {
            if (Math.abs(s.start - start) < 0.01) {
                return { ...s, isDeleted: !s.isDeleted };
            }
            return s;
        });

        setSegments(newSegments);

        try {
            await fetch(`${API_BASE}/project/${projectId}/segments`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSegments)
            });
        } catch (e) {
            console.error("Failed to sync segments", e);
        }
    }, [projectId, segments, setSegments]);

    const deleteClipRange = useCallback((assetId: string, rangeStart: number, rangeEnd: number) => {
        setTimeline(prev => {
            const next = { ...prev };
            let changed = false;

            next.tracks = next.tracks.map(track => {
                if (track.locked) return track;
                let newClips: TimelineClip[] = [];
                let trackChanged = false;

                for (const clip of track.clips) {
                    if (clip.assetId !== assetId) {
                        newClips.push(clip);
                        continue;
                    }

                    if (rangeEnd <= clip.trimStart || rangeStart >= clip.trimEnd) {
                        newClips.push(clip);
                        continue;
                    }

                    trackChanged = true;
                    changed = true;

                    const deleteStart = Math.max(rangeStart, clip.trimStart);
                    const deleteEnd = Math.min(rangeEnd, clip.trimEnd);

                    if (deleteStart > clip.trimStart && deleteEnd < clip.trimEnd) {
                        const firstDuration = deleteStart - clip.trimStart;
                        newClips.push({
                            ...clip,
                            id: clip.id + '-part1',
                            trimEnd: deleteStart,
                            end: clip.start + firstDuration
                        });

                        const secondStart = deleteEnd;
                        const secondDuration = clip.trimEnd - secondStart;
                        newClips.push({
                            ...clip,
                            id: clip.id + '-part2',
                            trimStart: secondStart,
                            start: clip.start + firstDuration,
                            trimEnd: clip.trimEnd,
                            end: clip.start + firstDuration + secondDuration
                        });
                    }
                    else if (deleteStart <= clip.trimStart && deleteEnd < clip.trimEnd) {
                        const newTrimStart = deleteEnd;
                        const newDuration = clip.trimEnd - newTrimStart;
                        newClips.push({
                            ...clip,
                            trimStart: newTrimStart,
                            start: clip.start,
                            end: clip.start + newDuration
                        });
                    }
                    else if (deleteStart > clip.trimStart && deleteEnd >= clip.trimEnd) {
                        const newTrimEnd = deleteStart;
                        const newDuration = newTrimEnd - clip.trimStart;
                        newClips.push({
                            ...clip,
                            trimEnd: newTrimEnd,
                            end: clip.start + newDuration
                        });
                    }
                }

                if (trackChanged && isMagnetic) {
                    // Re-pack track if magnetic
                    const sorted = [...newClips].sort((a, b) => a.start - b.start);
                    let currentPos = 0;
                    newClips = sorted.map(c => {
                        const trueDuration = c.trimEnd - c.trimStart;
                        const updated = { ...c, start: currentPos, end: currentPos + trueDuration };
                        currentPos += trueDuration;
                        return updated;
                    });
                }

                return { ...track, clips: newClips };
            });

            if (!changed) return prev;
            setPast(p => [...p, prev].slice(-50));
            setFuture([]);
            return next;
        });
    }, [setTimeline, setPast, setFuture, isMagnetic]);

    const restoreClipRange = useCallback((assetId: string, rangeStart: number, rangeEnd: number, playheadPosition: number) => {
        const currentPlayhead = playheadPosition;
        const duration = rangeEnd - rangeStart;

        setTimeline(prev => {
            const activeTrackIndex = 0;
            const track = prev.tracks[activeTrackIndex];
            if (track.locked) return prev;

            const newClip: TimelineClip = {
                id: crypto.randomUUID(),
                assetId,
                start: currentPlayhead,
                end: currentPlayhead + duration,
                trimStart: rangeStart,
                trimEnd: rangeEnd,
                sourceFileName: assets.find(a => a.id === assetId)?.name || 'Restored Clip',
                trackId: track.id,
                name: assets.find(a => a.id === assetId)?.name || 'Restored Clip',
            };

            let insertTime = currentPlayhead;
            let inserted = false;

            const sameAssetClips = track.clips.filter(c => c.assetId === assetId).sort((a, b) => a.trimStart - b.trimStart);

            const preceeding = sameAssetClips.find(c => Math.abs(c.trimEnd - rangeStart) < 0.1);
            if (preceeding) {
                insertTime = preceeding.end;
                inserted = true;
            } else {
                const following = sameAssetClips.find(c => Math.abs(c.trimStart - rangeEnd) < 0.1);
                if (following) {
                    insertTime = following.start - duration;
                    inserted = true;
                }
            }

            if (inserted) {
                newClip.start = insertTime;
                newClip.end = insertTime + duration;
            }

            let newClips = [...track.clips, newClip];

            if (isMagnetic) {
                newClips = track.clips.map(c => {
                    if (c.start >= insertTime) {
                        return { ...c, start: c.start + duration, end: c.end + duration };
                    }
                    return c;
                });
                newClip.start = insertTime;
                newClip.end = insertTime + duration;
                newClips.push(newClip);

                // Sort and pack
                const sorted = [...newClips].sort((a, b) => a.start - b.start);
                let currentPos = 0;
                newClips = sorted.map(c => {
                    const trueDuration = c.trimEnd - c.trimStart;
                    const updated = { ...c, start: currentPos, end: currentPos + trueDuration };
                    currentPos += trueDuration;
                    return updated;
                });
            } else {
                newClips = track.clips.map(c => {
                    if (c.start >= insertTime) {
                        return { ...c, start: c.start + duration, end: c.end + duration };
                    }
                    return c;
                });
                newClip.start = insertTime;
                newClip.end = insertTime + duration;
                newClips.push(newClip);
            }

            const next = {
                ...prev,
                tracks: prev.tracks.map((t, i) => i === activeTrackIndex ? { ...t, clips: newClips } : t)
            };

            setPast(p => [...p, prev].slice(-50));
            setFuture([]);
            return next;
        });
    }, [setTimeline, setPast, setFuture, isMagnetic, assets]);

    const uploadTranscript = useCallback(async (assetId: string, file: File) => {
        try {
            const content = await file.text();
            const response = await fetch(`${API_BASE}/upload-transcript`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, fileName: file.name, projectId })
            });

            if (!response.ok) throw new Error(`Upload failed with status ${response.status}`);

            const result = await response.json();
            if (result.success) {
                const transcriptionWithSource = {
                    ...result.transcription,
                    source: 'upload' as const
                };
                setAssets(prev => prev.map(a => a.id === assetId ? { ...a, transcription: transcriptionWithSource } : a));

                if (projectId) {
                    const newSegments = result.transcription.words.map((w: any) => ({
                        start: w.start / 1000,
                        end: w.end / 1000,
                        text: w.word,
                        type: w.type || 'speech',
                        isDeleted: w.isDeleted || false
                    }));
                    setSegments(newSegments);

                    fetch(`${API_BASE}/project/${projectId}/segments`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newSegments)
                    }).catch(e => console.error("Sync failed", e));
                }
            }
        } catch (err) {
            console.error('Transcript upload failed:', err);
        }
    }, [projectId, setAssets, setSegments]);

    return {
        isTranscribing,
        transcriptionProgress,
        isAutoCutting,
        transcribeAsset,
        refineTranscript,
        autoCutAsset,
        toggleSegmentDelete,
        deleteClipRange,
        restoreClipRange,
        uploadTranscript,
    };
};
