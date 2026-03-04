
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

    const transcribeAsset = useCallback(async (assetId: string, fileName: string) => {
        setIsTranscribing(assetId);
        setTranscriptionProgress(0);

        const asset = assets.find(a => a.id === assetId);
        if (!asset) {
            setIsTranscribing(null);
            return;
        }

        // Guard: projectId must be the real backend UUID (set after upload completes).
        // Without it, the backend cannot locate the file.
        if (!projectId) {
            alert('Upload is still in progress. Please wait for the upload to finish before transcribing.');
            setIsTranscribing(null);
            return;
        }

        // Build the most reliable video path:
        // 1. Use remoteSrc (set after upload completes, e.g. "/uploads/uuid/file.mp4")
        // 2. Fall back to constructing from projectId (always the backend UUID)
        const videoPath = asset.remoteSrc ||
            `/uploads/${projectId}/${fileName}`;

        console.log('Transcribe: sending videoPath =', videoPath, '| projectId =', projectId);

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
                    projectId: projectId
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
        transcribeAsset,
        refineTranscript,
        toggleSegmentDelete,
        uploadTranscript,
    };
};
