/**
 * usePlayback - Playback controls for video timeline
 * Manages play/pause state and playhead position
 */
import { useState, useCallback, useRef, useMemo } from 'react';
import { TimelineState, Asset } from '../types';

export const usePlayback = (timeline: TimelineState, assets: Asset[]) => {
    const [playheadPosition, setPlayheadPosition] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    const animationFrameRef = useRef<number | null>(null);
    const lastUpdateTimeRef = useRef<number | null>(null);

    const togglePlayback = useCallback(() => {
        setIsPlaying(prev => !prev);
    }, []);

    const play = useCallback(() => {
        setIsPlaying(true);
    }, []);

    const pause = useCallback(() => {
        setIsPlaying(false);
    }, []);

    const seekTo = useCallback((position: number) => {
        setPlayheadPosition(Math.max(0, position));
    }, []);

    const totalDuration = useMemo(() => {
        let max = 10; // Minimum 10s
        timeline.tracks.forEach(track => {
            track.clips.forEach(clip => {
                if (clip.end > max) max = clip.end;
            });
        });
        return max + 5; // Extra padding
    }, [timeline]);

    // Find current clip at playhead position
    const currentClip = useMemo(() => {
        for (const track of timeline.tracks) {
            for (const clip of track.clips) {
                if (playheadPosition >= clip.start && playheadPosition < clip.end) {
                    const asset = assets.find(a => a.id === clip.assetId);
                    if (asset) return { clip, asset };
                }
            }
        }
        return null;
    }, [timeline, playheadPosition, assets]);

    return {
        playheadPosition,
        setPlayheadPosition,
        isPlaying,
        setIsPlaying,
        togglePlayback,
        play,
        pause,
        seekTo,
        totalDuration,
        currentClip,
        animationFrameRef,
        lastUpdateTimeRef,
    };
};
