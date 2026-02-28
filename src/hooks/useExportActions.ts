
import { useCallback, useState } from 'react';
import { TimelineStateHook } from './useTimelineState';

const basename = (path: string) => path.split(/[\\/]/).pop() || '';
const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const useExportActions = (state: TimelineStateHook) => {
    const { timeline, assets } = state;
    const [renderStatus, setRenderStatus] = useState<'idle' | 'rendering' | 'success' | 'error'>('idle');
    const [renderProgress, setRenderProgress] = useState(0);
    const [lastRenderPath, setLastRenderPath] = useState<string | null>(null);

    const renderToMP4 = useCallback(async () => {
        setRenderStatus('rendering');
        const data = {
            timeline,
            assets: assets.map(a => ({ id: a.id, name: a.name, duration: a.duration }))
        };

        try {
            const response = await fetch(`${API_BASE}/render`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (result.success) {
                const pollInterval = setInterval(async () => {
                    try {
                        const progressRes = await fetch(`${API_BASE}/render-progress`);
                        const progressData = await progressRes.json();
                        setRenderProgress(progressData.progress);

                        if (!progressData.isRendering && progressData.progress === 100) {
                            clearInterval(pollInterval);
                            setRenderStatus('success');
                            setLastRenderPath(result.path);
                            setTimeout(() => {
                                setRenderStatus('idle');
                                setRenderProgress(0);
                            }, 5000);
                        }
                    } catch (e) {
                        console.error('Progress poll failed:', e);
                    }
                }, 1000);
            } else {
                setRenderStatus('error');
            }
        } catch (err) {
            console.error('Render trigger failed:', err);
            setRenderStatus('error');
        }
    }, [timeline, assets]);

    const exportToXML = useCallback(async () => {
        const data = {
            timeline,
            assets: assets.map(a => ({
                id: a.id,
                name: a.name,
                duration: a.duration,
                src: a.remoteSrc || a.src
            }))
        };

        try {
            const response = await fetch(`${API_BASE}/export-xml`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`Export failed: ${response.status}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const result = await response.json();
                if (result.success === false) {
                    alert(result.error || 'Export failed');
                    return;
                }
                if (result.path) {
                    const link = document.createElement('a');
                    link.href = result.path;
                    link.download = basename(result.path);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    return;
                }
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `rough_cut_${Date.now()}.xml`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('XML Export failed:', err);
            alert('XML Export failed. Please try again.');
        }
    }, [timeline, assets]);

    const exportToEDL = useCallback(async () => {
        const data = {
            timeline,
            assets: assets.map(a => ({
                id: a.id,
                name: a.name,
                duration: a.duration,
                src: a.remoteSrc || a.src
            }))
        };

        try {
            const response = await fetch(`${API_BASE}/export-edl`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`Export failed: ${response.status}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const result = await response.json();
                if (result.success === false) {
                    alert(result.error || 'Export failed');
                    return;
                }
                if (result.path) {
                    const link = document.createElement('a');
                    link.href = result.path;
                    link.download = basename(result.path);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    return;
                }
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `rough_cut_${Date.now()}.edl`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('EDL Export failed:', err);
            alert('EDL Export failed. Please try again.');
        }
    }, [timeline, assets]);

    const exportTranscript = useCallback(async (transcription: any) => {
        try {
            const response = await fetch(`${API_BASE}/export-transcript`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ transcription, format: 'txt' }),
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `transcript_${Date.now()}.txt`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
            } else {
                console.error('Failed to export transcript');
            }
        } catch (error) {
            console.error('Error exporting transcript:', error);
        }
    }, []);

    const importXML = useCallback((xmlString: string) => {
        const { setTimeline, setPast, setFuture } = state;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        const clipTags = xmlDoc.getElementsByTagName('clipitem');
        const framerate = 24;

        const newClips: any[] = [];
        Array.from(clipTags).forEach((tag, idx) => {
            const name = tag.getElementsByTagName('name')[0]?.textContent || 'Imported Clip';
            const startFrames = parseInt(tag.getElementsByTagName('start')[0]?.textContent || '0');
            const endFrames = parseInt(tag.getElementsByTagName('end')[0]?.textContent || '0');
            const sourceInFrames = parseInt(tag.getElementsByTagName('in')[0]?.textContent || '0');
            const sourceOutFrames = parseInt(tag.getElementsByTagName('out')[0]?.textContent || '0');

            const fileElement = tag.getElementsByTagName('file')[0];
            const fileId = fileElement?.getAttribute('id') || `file-${idx}`;
            const sourceFileName = fileElement?.getElementsByTagName('name')[0]?.textContent || '';

            newClips.push({
                id: `imported-${idx}-${Date.now()}`,
                assetId: fileId,
                trackId: 'v1',
                name,
                sourceFileName,
                start: startFrames / framerate,
                end: endFrames / framerate,
                trimStart: sourceInFrames / framerate,
                trimEnd: sourceOutFrames / framerate,
                opacity: 100,
                volume: 100,
            });
        });

        setTimeline(prev => {
            setPast(p => [...p, prev].slice(-50));
            setFuture([]);
            return {
                ...prev,
                tracks: prev.tracks.map((t, i) => i === 0 ? { ...t, clips: newClips } : t)
            };
        });
    }, [state]);

    return {
        renderStatus,
        renderProgress,
        lastRenderPath,
        renderToMP4,
        exportToXML,
        exportToEDL,
        exportTranscript,
        importXML,
    };
};
