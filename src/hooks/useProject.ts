/**
 * useProject - Project and API state management
 * Handles project CRUD, transcription, and auto-cut operations
 */
import { useState, useCallback, useEffect } from 'react';
import { Asset, TimelineState, TimelineClip } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface ProjectState {
    projectId: string | null;
    segments: any[];
    isTranscribing: string | null;
    transcriptionProgress: number;
}

export const useProject = (
    assets: Asset[],
    setAssets: React.Dispatch<React.SetStateAction<Asset[]>>,
    setTimeline: (updater: (prev: TimelineState) => TimelineState) => void,
    resetState: () => void
) => {
    const [projectId, setProjectId] = useState<string | null>(null);
    const [segments, setSegments] = useState<any[]>([]);
    const [isTranscribing, setIsTranscribing] = useState<string | null>(null);
    const [transcriptionProgress, setTranscriptionProgress] = useState(0);

    // Restore projectId from localStorage on mount
    useEffect(() => {
        if (!projectId) {
            const stored = localStorage.getItem('currentProjectId');
            if (stored) setProjectId(stored);
        }
    }, [projectId]);

    // Save projectId to localStorage and fetch segments
    useEffect(() => {
        if (!projectId) return;

        localStorage.setItem('currentProjectId', projectId);

        const fetchSegments = async () => {
            try {
                const res = await fetch(`${API_BASE}/project/${projectId}`);
                if (!res.ok) {
                    if (res.status === 404) {
                        console.warn("Project not found on backend. Clearing session.");
                        localStorage.removeItem('currentProjectId');
                        setProjectId(null);
                    }
                    return;
                }
                const data = await res.json();
                if (data.segments) {
                    setSegments(data.segments);
                }
            } catch (e) {
                console.error("Failed to fetch project state", e);
            }
        };
        fetchSegments();
    }, [projectId]);

    const addMediaFiles = useCallback(async (files: FileList) => {
        const file = files[0];
        if (!file) return;

        const asset: Asset = {
            id: `asset-${Date.now()}`,
            name: file.name,
            type: file.type.startsWith('video') ? 'video' : 'audio',
            src: URL.createObjectURL(file),
            duration: 0,
        };

        const dummyVideo = document.createElement('video');
        dummyVideo.src = asset.src;
        dummyVideo.onloadedmetadata = async () => {
            asset.duration = dummyVideo.duration;
            setAssets([asset]);

            const formData = new FormData();
            formData.append('file', file);

            try {
                console.log("Uploading to backend...");
                const res = await fetch(`${API_BASE}/upload`, {
                    method: 'POST',
                    body: formData,
                });
                const data = await res.json();
                if (data.success) {
                    console.log("Upload success, Project ID:", data.projectId);
                    setProjectId(data.projectId);
                    setAssets(prev => prev.map(a =>
                        a.name === file.name ? { ...a, remoteSrc: data.filePath } : a
                    ));
                }
            } catch (e) {
                console.error("Upload failed", e);
            }
        };
    }, [setAssets]);

    const deleteProject = useCallback(async () => {
        if (!projectId) {
            alert("No project to delete. Upload a video first!");
            return;
        }

        if (!confirm("Are you sure you want to delete this project? This cannot be undone.")) {
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/project/${projectId}`, { method: 'DELETE' });
            if (res.ok) {
                setProjectId(null);
                setSegments([]);
                localStorage.removeItem('currentProjectId');
                resetState();
                alert("Project deleted successfully!");
            } else {
                alert("Failed to delete project.");
            }
        } catch (e) {
            console.error("Failed to delete project", e);
            alert("Error deleting project.");
        }
    }, [projectId, resetState]);

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
    }, [projectId, segments]);

    const transcribeAsset = useCallback(async (assetId: string, fileName: string) => {
        setIsTranscribing(assetId);
        setTranscriptionProgress(0);

        const asset = assets.find(a => a.id === assetId);
        if (!asset) {
            console.error("Asset not found for transcription");
            setIsTranscribing(null);
            return;
        }

        const pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE}/transcription-progress?videoPath=/${fileName}`);
                const data = await res.json();
                setTranscriptionProgress(data.progress || 0);
            } catch (e) { console.error(e); }
        }, 1000);

        try {
            const response = await fetch(`${API_BASE}/transcribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoPath: `/${fileName}`, duration: asset.duration })
            });
            const result = await response.json();
            if (result.success) {
                const transcriptionWithSource = {
                    ...result.transcription,
                    source: 'ai' as const
                };
                setAssets(prev => prev.map(a => a.id === assetId ? { ...a, transcription: transcriptionWithSource } : a));
            }
        } catch (err) {
            console.error('Transcription failed:', err);
        } finally {
            clearInterval(pollInterval);
            setTranscriptionProgress(0);
            setIsTranscribing(null);
        }
    }, [assets, setAssets]);

    const autoCutAsset = useCallback(async (assetId: string) => {
        const asset = assets.find(a => a.id === assetId);
        if (!asset || !asset.transcription) return;

        try {
            const response = await fetch(`${API_BASE}/auto-cut`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    words: asset.transcription.words,
                    asset: {
                        id: asset.id,
                        name: asset.name,
                        duration: asset.duration
                    },
                    trackId: 'video-1'
                })
            });

            const data = await response.json();

            if (data.statistics) {
                console.log('📊 Professional Rough Cut Statistics:', data.statistics);
            }

            if (data.clips && data.clips.length > 0) {
                setTimeline(prev => ({
                    ...prev,
                    tracks: prev.tracks.map(track =>
                        track.id === 'v1' ? { ...track, clips: data.clips } : track
                    )
                }));
                console.log(`✅ Added ${data.clips.length} clips to timeline`);
            }
        } catch (err) {
            console.error('Auto-cut failed:', err);
        }
    }, [assets, setTimeline]);

    const uploadTranscript = useCallback(async (content: string, fileName: string) => {
        try {
            const response = await fetch(`${API_BASE}/upload-transcript`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content,
                    fileName,
                    projectId
                })
            });
            const result = await response.json();

            if (result.success && result.transcription) {
                // Update the first asset with transcription
                setAssets(prev => prev.map((a, i) =>
                    i === 0 ? { ...a, transcription: { ...result.transcription, source: 'file' as const } } : a
                ));
                return result.transcription;
            }
        } catch (err) {
            console.error('Transcript upload failed:', err);
        }
        return null;
    }, [projectId, setAssets]);

    return {
        projectId,
        segments,
        isTranscribing,
        transcriptionProgress,
        addMediaFiles,
        deleteProject,
        toggleSegmentDelete,
        transcribeAsset,
        autoCutAsset,
        uploadTranscript,
    };
};
