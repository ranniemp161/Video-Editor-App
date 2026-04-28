
import { useCallback, useEffect, useRef } from 'react';
import { Asset } from '../types';
import { TimelineStateHook } from './useTimelineState';
import { API_BASE, getAuthToken, getAuthHeaders } from '@/config/api';
import { showToast } from '@/utils/toast';

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

        const startXhrUpload = (duration: number) => {
            asset.duration = duration;
            asset.isUploading = true;
            asset.uploadProgress = 0;
            setAssets([asset]);

            // Ironclad: Direct binary upload (no FormData overhead)
            const xhr = new XMLHttpRequest();
            const uploadUrl = `${API_BASE}/upload`;

            console.log(`[Upload] Starting direct binary stream for: ${file.name} to ${uploadUrl}`);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    setAssets(prev => prev.map(a =>
                        a.id === asset.id ? { ...a, uploadProgress: percentComplete } : a
                    ));
                }
            };

            xhr.onload = async () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        if (data.success) {
                            console.log(`[Upload] Success! ProjectID: ${data.projectId}`);
                            setProjectId(data.projectId);
                            setAssets(prev => prev.map(a =>
                                a.id === asset.id ? {
                                    ...a,
                                    remoteSrc: data.filePath,
                                    isUploading: false,
                                    uploadProgress: 100,
                                    isGeneratingProxy: true
                                } : a
                            ));

                            // Poll until the 480p proxy is ready, then switch preview to it.
                            // Stop after 6 minutes (120 × 3s) to avoid infinite polling on FFmpeg failure.
                            let pollCount = 0;
                            const maxPolls = 120;
                            const pollProxy = setInterval(async () => {
                                pollCount++;
                                if (pollCount > maxPolls) {
                                    clearInterval(pollProxy);
                                    setAssets(prev => prev.map(a =>
                                        a.id === asset.id ? { ...a, isGeneratingProxy: false } : a
                                    ));
                                    showToast('error', 'Proxy generation timed out. The file was uploaded but preview encoding failed — check server logs.');
                                    return;
                                }
                                try {
                                    const res = await fetch(`${API_BASE}/project/${data.projectId}/proxy-status`, {
                                        headers: getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}
                                    });
                                    if (!res.ok) {
                                        console.error(`[Proxy] Status check returned ${res.status}`);
                                        return;
                                    }
                                    const status = await res.json();
                                    if (status.error) {
                                        clearInterval(pollProxy);
                                        setAssets(prev => prev.map(a =>
                                            a.id === asset.id ? { ...a, isGeneratingProxy: false } : a
                                        ));
                                        showToast('error', `Proxy generation failed: ${status.error}`);
                                        return;
                                    }
                                    if (status.ready && status.proxySrc) {
                                        clearInterval(pollProxy);
                                        setAssets(prev => prev.map(a =>
                                            a.id === asset.id ? {
                                                ...a,
                                                proxySrc: status.proxySrc,
                                                isGeneratingProxy: false
                                            } : a
                                        ));
                                        showToast('success', 'Preview proxy ready — scrubbing is now smooth.');
                                        console.log(`[Proxy] Ready: ${status.proxySrc}`);
                                    }
                                } catch (e) {
                                    console.error('[Proxy] Poll error:', e);
                                }
                            }, 3000);
                        } else {
                            throw new Error(data.error || 'Server logic failed');
                        }
                    } catch (e: any) {
                        console.error("[Upload] Parse error:", e);
                        showToast('error', 'Upload failed: invalid response from server.');
                        setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, isUploading: false } : a));
                    }
                } else {
                    let errText = xhr.responseText;
                    try { errText = JSON.parse(errText).detail || errText; } catch(e){}
                    console.error("[Upload] Server error:", xhr.status, errText);
                    showToast('error', `Upload failed (${xhr.status}): ${errText}`);
                    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, isUploading: false } : a));
                }
            };

            xhr.onerror = () => {
                const detail = xhr.status ? `HTTP ${xhr.status}` : 'backend unreachable — check Docker/server logs';
                console.error("[Upload] Network Error", { status: xhr.status, response: xhr.responseText });
                showToast('error', `Upload failed: network error (${detail})`);
                setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, isUploading: false } : a));
            };

            xhr.timeout = 3600000; // 1 hour
            xhr.open('POST', uploadUrl);

            const token = getAuthToken();
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

            // Critical metadata in headers
            xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');

            xhr.send(file); // Send raw file binary
        };

        // Read video duration before uploading. If the browser can't parse metadata
        // (unsupported codec, audio-only file, or large file with slow seek), we fall
        // back and start the upload anyway after a 5-second timeout so the upload is
        // never silently swallowed.
        const dummyVideo = document.createElement('video');
        dummyVideo.preload = 'metadata';
        dummyVideo.src = asset.src!;

        let metadataHandled = false;

        const metadataTimeout = setTimeout(() => {
            if (metadataHandled) return;
            metadataHandled = true;
            dummyVideo.onloadedmetadata = null;
            dummyVideo.onerror = null;
            dummyVideo.src = '';
            console.warn('[Upload] onloadedmetadata timed out — starting upload without duration');
            showToast('error', 'Could not read video duration — uploading anyway.');
            startXhrUpload(0);
        }, 5000);

        dummyVideo.onloadedmetadata = () => {
            if (metadataHandled) return;
            metadataHandled = true;
            clearTimeout(metadataTimeout);
            dummyVideo.onerror = null;
            const duration = isFinite(dummyVideo.duration) ? dummyVideo.duration : 0;
            startXhrUpload(duration);
        };

        dummyVideo.onerror = () => {
            if (metadataHandled) return;
            metadataHandled = true;
            clearTimeout(metadataTimeout);
            dummyVideo.onloadedmetadata = null;
            dummyVideo.src = '';
            console.warn('[Upload] dummyVideo error — starting upload without duration', dummyVideo.error?.message);
            showToast('error', `Browser could not decode video metadata — uploading anyway.`);
            startXhrUpload(0);
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

                    // Restore proxy URL if it was already generated
                    const proxySrc = data.proxyReady && data.proxyPath
                        ? `/uploads/${data.projectId}/proxy.mp4`
                        : undefined;

                    const restoredAsset: Asset = {
                        id: data.projectId,
                        name: data.originalFileName,
                        type: data.originalFileName.endsWith('.mp3') || data.originalFileName.endsWith('.wav') ? 'audio' : 'video',
                        src: null,
                        remoteSrc: remoteSrc,
                        proxySrc,
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
            const res = await fetch(`${API_BASE}/system/reset`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            
            if (res.ok) {
                // Clear everything locally
                setProjectId(null);
                setAssets([]);
                setSegments([]);
                setTimeline({ tracks: [{ id: 'track-1', clips: [] }] });
                
                showToast('success', 'System reset complete. All storage cleared.');
                window.location.reload();
            } else {
                const err = await res.text();
                showToast('error', `Reset failed: ${err}`);
            }
        } catch (e) {
            console.error("Failed to reset system:", e);
            showToast('error', 'Network error during reset. Check server connection.');
        }
    }, [setProjectId, setAssets, setSegments, setTimeline]);

    return {
        addMediaFiles,
        deleteProject,
        resetAll
    };
};
