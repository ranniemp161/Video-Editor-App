
import { useMemo, useCallback, useRef, useEffect } from 'react';
import { useTimelineState } from './useTimelineState';
import { useClipManagement } from './useClipManagement';
import { useExportActions } from './useExportActions';
import { useTranscriptSync } from './useTranscriptSync';
import { useProjectManagement } from './useProjectManagement';

export const useTimeline = () => {
  const state = useTimelineState();
  const {
    timeline, assets, playheadPosition, setPlayheadPosition,
    isPlaying, setIsPlaying,
  } = state;

  const clipManagement = useClipManagement(state);
  const exportActions = useExportActions(state);
  const transcriptSync = useTranscriptSync(state);
  const projectManagement = useProjectManagement(state);

  // Derived State & Utilities that are easier to keep in the orchestrator
  const currentClip = useMemo(() => {
    for (const track of timeline.tracks) {
      const clip = track.clips.find(c => playheadPosition >= c.start && playheadPosition <= c.end);
      if (clip) {
        const asset = assets.find(a => a.id === clip.assetId);
        return { clip, asset };
      }
    }
    return null;
  }, [timeline, playheadPosition, assets]);

  const findMatchingAsset = useCallback((assetId: string) => {
    return assets.find(a => a.id === assetId);
  }, [assets]);

  const togglePlayback = useCallback(() => setIsPlaying(prev => !prev), [setIsPlaying]);

  // Animation Loop for Playback
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastUpdateTimeRef = useRef<number | undefined>(undefined);

  const animatePlayback = useCallback(() => {
    if (!lastUpdateTimeRef.current) return;
    const now = performance.now();
    const delta = (now - lastUpdateTimeRef.current) / 1000;
    lastUpdateTimeRef.current = now;

    setPlayheadPosition(prev => {
      const next = prev + delta;
      const total = timeline.tracks.reduce((max, track) => {
        const lastClip = track.clips[track.clips.length - 1];
        return Math.max(max, lastClip ? lastClip.end : 0);
      }, 0);
      return next > total ? 0 : next;
    },);

    animationFrameRef.current = requestAnimationFrame(animatePlayback);
  }, [timeline, setPlayheadPosition]);

  useEffect(() => {
    if (isPlaying) {
      lastUpdateTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(animatePlayback);
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [isPlaying, animatePlayback]);

  // Calculate actual total duration for export/rendering
  const calcTotalDuration = useMemo(() => {
    return timeline.tracks.reduce((max, track) => {
      const lastClip = track.clips[track.clips.length - 1];
      return Math.max(max, lastClip ? lastClip.end : 0);
    }, 0);
  }, [timeline]);

  return {
    ...state,
    ...clipManagement,
    ...exportActions,
    ...transcriptSync,
    ...projectManagement,
    currentClip,
    findMatchingAsset,
    togglePlayback,
    totalDuration: calcTotalDuration
  };
};