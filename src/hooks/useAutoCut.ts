import { useCallback, useState } from 'react';
import { TimelineStateHook } from './useTimelineState';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const useAutoCut = (state: TimelineStateHook) => {
    const {
        assets,
        projectId,
        setTimeline
    } = state;

    const [isAutoCutting, setIsAutoCutting] = useState(false);

    const autoCutAsset = useCallback(async (assetId: string) => {
        const asset = assets.find(a => a.id === assetId);
        if (!asset || !asset.transcription) return;

        const backendAssetId = projectId || assetId;
        setIsAutoCutting(true);
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${API_BASE}/auto-cut`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
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

    return {
        isAutoCutting,
        autoCutAsset
    };
};
