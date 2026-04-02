
import { useCallback, useEffect, useRef } from 'react';
import { Asset } from '../types';
import { TimelineStateHook } from './useTimelineState';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const useProjectManagement = (state: TimelineStateHook) => {
    const {
        assets, setAssets,
        projectId, setProjectId,
        setSegments,
        setTimeline,
        setPlayheadPosition,
        setSelectedClipIds,
        setPast, setFuture
    } = state;

    const hasInitializedRef = useRef(false);
    const hasRestoredRef = useRef(false);
    const timelineRef = useRef(state.timeline);

    useEffect(() => { timelineRef.current = state.timeline; }, [state.timeline]);

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
        dummyVideo.src = asset.src!;
        dummyVideo.onloadedmetadata = async () => {
            asset.duration = dummyVideo.duration;
            asset.isUploading = true;
            asset.uploadProgress = 0;
            setAssets([asset]);

            const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
            const fileId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const token = localStorage.getItem('auth_token');
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const uploadUrl = `${API_BASE}/upload-chunk`;
            console.log(`[Upload] Starting massive chunked upload to: ${uploadUrl} (ID: ${fileId})`);

            try {
                for (let i = 0; i < totalChunks; i++) {
                    const start = i * CHUNK_SIZE;
                    const end = Math.min(start + CHUNK_SIZE, file.size);
                    const chunk = file.slice(start, end);

                    const formData = new FormData();
                    formData.append('fileId', fileId);
                    formData.append('chunkIndex', i.toString());
                    formData.append('file', chunk, file.name);

                    // Robust retry logic for each chunk
                    let success = false;
                    let attempts = 0;
                    const maxAttempts = 3;

                    while (!success && attempts < maxAttempts) {
                        try {
                            const res = await fetch(uploadUrl, {
                                method: 'POST',
                                headers,
                                body: formData
                            });

                            if (!res.ok) {
                                if (res.status === 401) {
                                    localStorage.removeItem('auth_token');
                                    window.location.reload();
                                    return;
                                }
                                let errText = await res.text();
                                try { errText = JSON.parse(errText).detail || errText; } catch(e){}
                                throw new Error(`${res.status} ${errText}`);
                            }
                            success = true;
                        } catch (err) {
                            attempts++;
                            console.warn(`[Upload] Chunk ${i} failed (attempt ${attempts}/${maxAttempts}):`, err);
                            if (attempts >= maxAttempts) throw err;
                            // Wait 500ms before retrying
                            await new Promise(r => setTimeout(r, 500));
                        }
                    }

                    const percentComplete = Math.round(((i + 1) / totalChunks) * 100);
                    setAssets(prev => prev.map(a =>
                        a.id === asset.id ? { ...a, uploadProgress: percentComplete } : a
                    ));

                    // Small 50ms pause to let the proxy breathe
                    await new Promise(r => setTimeout(r, 50));
                }

                // Finalize with total chunk count for verification
                const completeRes = await fetch(`${API_BASE}/upload-complete`, {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileId, fileName: file.name, totalChunks })
                });

                if (!completeRes.ok) {
                    let errText = await completeRes.text();
                    try { errText = JSON.parse(errText).detail || errText; } catch(e){}
                    throw new Error(`Finalization failed: ${completeRes.status} ${errText}`);
                }

                const data = await completeRes.json();
                if (data.success) {
                    setProjectId(data.projectId);
                    setAssets(prev => prev.map(a =>
                        a.id === asset.id ? { ...a, remoteSrc: data.filePath, isUploading: false, uploadProgress: 100 } : a
                    ));
                } else {
                    throw new Error(data.error || 'Server logic failed on finalize');
                }

            } catch (err: any) {
                console.error("Chunked upload failed:", err);
                setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, isUploading: false } : a));
                alert(`Upload failed: ${err.message || 'Network/Server Error'}`);
            }
        };
    }, [setAssets, setProjectId]);

    const deleteProject = useCallback(async () => {
        if (!confirm("Are you sure you want to delete this project and clear the timeline?")) return;

        console.log("Resetting project...", { projectId });

        try {
            if (projectId) {
                const res = await fetch(`${API_BASE}/project/${projectId}`, { method: 'DELETE' });
                if (!res.ok) {
                    console.warn("Backend project deletion failed or returned error, but proceeding with local reset.");
                }
            }
        } catch (e) {
            console.error("Failed to delete project on backend", e);
        } finally {
            // ALWAYS clear local state
            setProjectId(null);
            setSegments([]);
            setAssets([]);
            setTimeline({
                tracks: [
                    { id: 'v1', type: 'video', clips: [], muted: false, locked: false },
                    { id: 'v2', type: 'video', clips: [], muted: false, locked: false },
                    { id: 'a1', type: 'audio', clips: [], muted: false, locked: false },
                ]
            });
            setPlayheadPosition(0);
            setSelectedClipIds([]);
            setPast([]);
            setFuture([]);
            localStorage.removeItem('currentProjectId');

            // Give React a moment to update state before reloading
            setTimeout(() => {
                window.location.reload();
            }, 100);
        }
    }, [projectId, setProjectId, setSegments, setAssets, setTimeline, setPlayheadPosition, setSelectedClipIds, setPast, setFuture]);

    // Lifecycle: Restore project on load
    useEffect(() => {
        if (!projectId) {
            const stored = localStorage.getItem('currentProjectId');
            if (stored) setProjectId(stored);
            return;
        }

        localStorage.setItem('currentProjectId', projectId);

        if (hasInitializedRef.current) return;
        hasInitializedRef.current = true;

        const fetchProject = async () => {
            try {
                const res = await fetch(`${API_BASE}/project/${projectId}`);
                if (!res.ok) return;
                const data = await res.json();

                if (data.mediaPath && data.originalFileName) {
                    const cleanPath = data.mediaPath.replace(/\\/g, '/');
                    const remoteSrc = cleanPath.startsWith('public/') ? '/' + cleanPath.substring(7) : '/' + cleanPath;

                    const restoredAsset: Asset = {
                        id: data.projectId,
                        name: data.originalFileName,
                        type: data.originalFileName.endsWith('.mp3') || data.originalFileName.endsWith('.wav') ? 'audio' : 'video',
                        src: null,
                        remoteSrc: remoteSrc,
                        duration: data.duration || 0,
                    };

                    if (data.segments && data.segments.length > 0) {
                        restoredAsset.transcription = {
                            source: 'ai',
                            transcription: data.segments.map((s: any) => s.text).join(' '),
                            words: data.segments.map((s: any) => ({
                                word: s.text,
                                start: s.start * 1000,
                                end: s.end * 1000,
                                isDeleted: s.isDeleted
                            }))
                        };
                    }

                    setAssets(prev => prev.length > 0 ? prev : [restoredAsset]);
                }

                if (data.segments) setSegments(data.segments);
            } catch (e) {
                console.error("Failed to fetch project state", e);
            }
        };
        fetchProject();
    }, [projectId, setProjectId, setAssets, setSegments]);

    // Session Recovery: Rough Cut
    useEffect(() => {
        if (!projectId || hasRestoredRef.current) return;

        const checkForSavedRoughCut = async () => {
            try {
                const res = await fetch(`${API_BASE}/rough-cut-status/${projectId}`);
                if (!res.ok) return;
                const data = await res.json();

                if (data.found && data.clips && data.clips.length > 0) {
                    const hasExistingClips = timelineRef.current.tracks.some(t => t.clips.length > 0);
                    if (!hasExistingClips) {
                        hasRestoredRef.current = true;
                        setTimeline(prev => ({
                            ...prev,
                            tracks: prev.tracks.map(track =>
                                track.id === 'v1' ? { ...track, clips: data.clips } : track
                            )
                        }));
                    }
                }
            } catch (e) {
                console.error("Session recovery failed", e);
            }
        };
        checkForSavedRoughCut();
    }, [projectId, setTimeline]);

    const resetAll = useCallback(async () => {
        if (!confirm("⚠️ DANGER: This will delete ALL projects and ALL uploaded videos from the server. This cannot be undone. Continue?")) return;
        if (!confirm("FINAL CONFIRMATION: Are you absolutely sure?")) return;

        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`${API_BASE}/system/reset`, {
                method: 'POST',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            
            if (res.ok) {
                // Clear everything locally
                setProjectId(null);
                setAssets([]);
                setSegments([]);
                setTimeline({ tracks: [{ id: 'track-1', clips: [] }] });
                
                alert("System Reset Complete. All storage cleared.");
                window.location.reload(); 
            } else {
                const err = await res.text();
                alert(`Reset failed: ${err}`);
            }
        } catch (e) {
            console.error("Failed to reset system:", e);
            alert("Network error during reset.");
        }
    }, [setProjectId, setAssets, setSegments, setTimeline]);

    return {
        addMediaFiles,
        deleteProject,
        resetAll
    };
};
