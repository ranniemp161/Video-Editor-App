import React, { useState, ChangeEvent, useMemo, useEffect } from 'react';
import { Login } from '@/components/Login';
import { EditorLayout } from '@/components/EditorLayout';
import { useTimeline } from '@/hooks/useTimeline';
import { useMarkers } from '@/hooks/useMarkers';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Asset } from '@/types';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('isAuthenticated') === 'true';
  });

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return <VideoEditor onLogout={handleLogout} />;
};

const VideoEditor: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const timelineProps = useTimeline();
  const {
    timeline, assets, playheadPosition, isPlaying, currentClip, totalDuration,
    setPlayheadPosition, togglePlayback, addClipToTimeline, importXML, addMediaFiles,
    moveClip, moveClips, nudgeClipEdge, splitClip, deleteClip, updateClip,
    selectedClipIds, selectAllClips, renderToMP4, renderStatus, renderProgress,
    lastRenderPath, isMagnetic, setIsMagnetic, toggleTrackMute, toggleTrackLock,
    undo, redo, isTranscribing, transcribeAsset, refineTranscript, autoCutAsset,
    exportToXML, exportToEDL, exportTranscript, uploadTranscript, transcriptionProgress,
    isAutoCutting, toggleSegmentDelete, segments, splitClipAtPlayhead,
    selectClipsInRange, setTrackHeight, deleteProject, deleteClipRange, restoreClipRange
  } = timelineProps;

  const [activeTab, setActiveTab] = useState('media');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [transcriptOffset, setTranscriptOffset] = useState(0);

  const markerProps = useMarkers();
  const { addMarker, getPreviousMarker, getNextMarker } = markerProps;

  // Keyboards Shortcuts Hook
  useKeyboardShortcuts({
    togglePlayback, timeline, playheadPosition, splitClip, selectedClipIds,
    deleteClip, selectAllClips, totalDuration, setPlayheadPosition, undo, redo,
    addMarker, getPreviousMarker, getNextMarker, nudgeClipEdge, updateClip
  });

  // Transcript Memoizations
  const transcriptWords = useMemo(() => {
    return segments.map((s: any) => ({
      word: s.text,
      start: s.start * 1000,
      end: s.end * 1000,
      isDeleted: s.isDeleted
    }));
  }, [segments]);

  const activeTranscriptAsset = useMemo(() => {
    if (segments && segments.length > 0) {
      const baseAsset = assets[0] || currentClip?.asset;
      if (!baseAsset) return null;
      return {
        ...baseAsset,
        transcription: {
          transcription: segments.map((s: any) => s.text).join(' '),
          words: transcriptWords
        }
      } as Asset;
    }
    return currentClip?.asset ?? assets[0] ?? null;
  }, [segments, assets, transcriptWords, currentClip?.asset?.id]);

  const activeAssetRanges = useMemo(() => {
    const asset = activeTranscriptAsset;
    if (!asset) return [];
    const clean = (s: string) => (s || '').toLowerCase().split('.')[0].trim();
    const targetNameClean = clean(asset.name);
    return timeline.tracks.flatMap(t => t.clips)
      .filter(c => c.assetId === asset.id || clean(c.sourceFileName) === targetNameClean || clean(c.name) === targetNameClean)
      .map(c => ({ start: c.trimStart, end: c.trimEnd }));
  }, [activeTranscriptAsset, timeline.tracks]);

  const wordInclusionStatus = useMemo(() => {
    const words = activeTranscriptAsset?.transcription?.words || [];
    if (activeAssetRanges.length === 0) return new Array(words.length).fill(false);
    return words.map((word: any) => {
      const midPoint = (word.start + word.end) / 2000;
      return activeAssetRanges.some(range => midPoint >= range.start - 0.05 && midPoint <= range.end + 0.05);
    });
  }, [activeTranscriptAsset?.transcription?.words, activeAssetRanges]);

  // Event Handlers
  const onSeekFromTranscript = (sourceTime: number) => {
    const adjustedSourceTime = sourceTime + transcriptOffset;
    const EPSILON = 0.1;
    const targetAsset = assets[0] || activeTranscriptAsset;
    if (!targetAsset) return;

    const clipMatchesAsset = (clip: any) => {
      const clipName = (clip.sourceFileName || clip.name || '').toLowerCase();
      const assetName = (targetAsset.name || '').toLowerCase();
      return clip.assetId === targetAsset.id || clipName === assetName || clipName.includes(assetName) || assetName.includes(clipName);
    };

    const assetClips = timeline.tracks.flatMap(t => t.clips).filter(clipMatchesAsset).sort((a, b) => a.start - b.start);
    if (assetClips.length === 0) return;

    for (const clip of assetClips) {
      if (adjustedSourceTime >= (clip.trimStart - EPSILON) && adjustedSourceTime <= (clip.trimEnd + EPSILON)) {
        setPlayheadPosition(Math.max(clip.start, Math.min(clip.end, clip.start + (adjustedSourceTime - clip.trimStart))));
        return;
      }
    }

    let bestClip = null, bestDistance = Infinity, seekToStart = true;
    for (const clip of assetClips) {
      const dS = Math.abs(adjustedSourceTime - clip.trimStart), dE = Math.abs(adjustedSourceTime - clip.trimEnd);
      if (dS < bestDistance) { bestDistance = dS; bestClip = clip; seekToStart = true; }
      if (dE < bestDistance) { bestDistance = dE; bestClip = clip; seekToStart = false; }
    }
    if (bestClip) setPlayheadPosition(Math.max(0, seekToStart ? bestClip.start : bestClip.end - 0.05));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => importXML(e.target?.result as string);
      reader.readAsText(file);
    }
    event.target.value = '';
  };

  const handleMediaUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) addMediaFiles(files);
    event.target.value = '';
  };

  return (
    <EditorLayout
      {...timelineProps}
      {...markerProps}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onLogout={onLogout}
      activeTranscriptAsset={activeTranscriptAsset}
      isTranscribing={!!isTranscribing}
      transcriptOffset={transcriptOffset}
      setTranscriptOffset={setTranscriptOffset}
      activeAssetRanges={activeAssetRanges}
      wordInclusionStatus={wordInclusionStatus}
      onSeekFromTranscript={onSeekFromTranscript}
      handleFileChange={handleFileChange}
      handleMediaUpload={handleMediaUpload}
      selectedAsset={selectedAsset}
      handleAssetSelect={setSelectedAsset}
      addMarker={addMarker}
      removeMarker={markerProps.removeMarker}
      updateMarker={markerProps.updateMarker}
      markers={markerProps.markers}
    />
  );
};

export default App;
