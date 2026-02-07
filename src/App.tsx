``
import React, { useState, ChangeEvent } from 'react';
import { MediaPool } from '@/components/MediaPool';
import { Preview } from '@/components/Preview';
import { Timeline } from '@/components/Timeline';
import { PlaybackControls } from '@/components/PlaybackControls';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { Inspector } from '@/components/Inspector';
import { TranscriptView } from '@/components/TranscriptView';
import { AddIcon } from '@/components/icons';
import { Login } from '@/components/Login';
import { useTimeline } from '@/hooks/useTimeline';
import { useMarkers } from '@/hooks/useMarkers';
import { Asset } from '@/types';
import { formatTime } from '@/utils/time';

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

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return <VideoEditor onLogout={handleLogout} />;
};

const VideoEditor: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const {
    timeline,
    assets,
    playheadPosition,
    isPlaying,
    currentClip,
    totalDuration,
    setPlayheadPosition,
    togglePlayback,
    addClipToTimeline,
    importXML,
    addMediaFiles,
    moveClip,
    moveClips,
    nudgeClips,
    nudgeClipEdge,
    splitClip,
    deleteClip,
    updateClip,
    selectedClipIds,
    onSelectClip,
    selectAllClips,
    renderToMP4,
    renderStatus,
    renderProgress,
    lastRenderPath,
    isMagnetic,
    setIsMagnetic,
    toggleTrackMute,
    toggleTrackLock,
    undo,
    redo,
    canUndo,
    canRedo,
    isTranscribing,
    transcribeAsset,
    autoCutAsset,
    exportToXML,
    exportToEDL,
    exportTranscript,
    uploadTranscript,
    transcriptionProgress,
    // New imports from hook
    toggleSegmentDelete,
    projectId,
    segments,
    // NEW UX Enhancements
    splitClipAtPlayhead,
    selectClipsInRange,
    setTrackHeight,
    deleteProject,
    deleteClipRange,
    restoreClipRange,
  } = useTimeline();

  const [activeTab, setActiveTab] = useState('media');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // Marker management
  const {
    markers,
    addMarker,
    removeMarker,
    updateMarker,
    getNextMarker,
    getPreviousMarker,
  } = useMarkers();

  // Pre-calculate mapped words to avoid doing it per-frame
  const transcriptWords = React.useMemo(() => {
    return segments.map((s: any) => ({
      word: s.text,
      start: s.start * 1000,
      end: s.end * 1000,
      isDeleted: s.isDeleted
    }));
  }, [segments]);

  // Helper to construct a viewable asset for the transcript view based on backend segments
  const activeTranscriptAsset = React.useMemo(() => {
    // If we have backend segments, use them to overlay onto the current clip's asset or create a dummy one
    if (segments && segments.length > 0) {
      // Find the asset that corresponds to the project media
      // (For now assuming single asset project flow)
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
  }, [segments, assets, transcriptWords, currentClip?.asset.id]); // Optimization: depend on ID, not object


  // --- Keyboard Shortcuts ---
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

      switch (e.key.toLowerCase()) {
        case ' ': // Space: Play/Pause
          e.preventDefault();
          togglePlayback();
          break;
        case 's': // S: Split
          const targetClipS = timeline.tracks.flatMap((t: any) => t.clips).find((c: any) => playheadPosition >= c.start && playheadPosition < c.end);
          if (targetClipS) splitClip(targetClipS.id, playheadPosition);
          break;
        case 'q': // Q: Ripple Trim Start to Playhead (Standard Mapping)
          {
            const allClips = timeline.tracks.flatMap((t: any) => t.clips);
            let target = selectedClipIds.length > 0 ? allClips.find((c: any) => c.id === selectedClipIds[0]) : null;
            if (!target || !(playheadPosition > target.start && playheadPosition < target.end)) {
              target = allClips.find((c: any) => playheadPosition > c.start && playheadPosition < c.end);
            }

            if (target) {
              const delta = playheadPosition - target.start;
              updateClip(target.id, {
                start: playheadPosition,
                trimStart: target.trimStart + delta
              });
            }
          }
          break;
        case 'w': // W: Ripple Trim End to Playhead (Standard Mapping)
          {
            const allClips = timeline.tracks.flatMap((t: any) => t.clips);
            let target = selectedClipIds.length > 0 ? allClips.find((c: any) => c.id === selectedClipIds[0]) : null;
            if (!target || !(playheadPosition > target.start && playheadPosition < target.end)) {
              target = allClips.find((c: any) => playheadPosition > c.start && playheadPosition < c.end);
            }

            if (target) {
              const delta = target.end - playheadPosition;
              updateClip(target.id, {
                end: playheadPosition,
                trimEnd: target.trimEnd - delta
              });
            }
          }
          break;
        case 'y': // Ctrl + Y: Redo
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            redo();
          }
          break;
        case 'z': // Ctrl + Z (Undo) or Ctrl + Shift + Z (Redo)
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
          }
          break;
        case 'a': // Ctrl + A: Select All
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            selectAllClips();
          }
          break;
        case 'delete':
        case 'backspace': // Del/Backspace: Delete
          deleteClip();
          break;
        case 'arrowleft': // Left
          e.preventDefault();
          if (e.altKey) {
            // Alt + Left: UNHIDE/REVEAL START edge (Expand Left)
            if (selectedClipIds.length === 1) nudgeClipEdge(selectedClipIds[0], 'start', 'left');
          } else if (e.shiftKey) {
            // Shift + Left: HIDE/SHRINK END edge (Trim Left)
            if (selectedClipIds.length === 1) nudgeClipEdge(selectedClipIds[0], 'end', 'left');
          } else if (e.ctrlKey || e.metaKey) {
            // Ctrl + Left: Jump to previous marker
            const prevMarker = getPreviousMarker(playheadPosition);
            if (prevMarker) setPlayheadPosition(prevMarker.time);
          } else {
            // Default: step back 1 frame
            setPlayheadPosition(Math.max(0, playheadPosition - 0.1));
          }
          break;
        case 'arrowright': // Right
          e.preventDefault();
          if (e.altKey) {
            // Alt + Right: UNHIDE/REVEAL END edge (Expand Right)
            if (selectedClipIds.length === 1) nudgeClipEdge(selectedClipIds[0], 'end', 'right');
          } else if (e.shiftKey) {
            // Shift + Right: HIDE/SHRINK START edge (Trim Right)
            if (selectedClipIds.length === 1) nudgeClipEdge(selectedClipIds[0], 'start', 'right');
          } else if (e.ctrlKey || e.metaKey) {
            // Ctrl + Right: Jump to next marker
            const nextMarker = getNextMarker(playheadPosition);
            if (nextMarker) setPlayheadPosition(nextMarker.time);
          } else {
            // Default: step forward 1 frame
            setPlayheadPosition(Math.min(totalDuration, playheadPosition + 0.1));
          }
          break;
        case 'm': // M: Add marker at playhead
          e.preventDefault();
          addMarker(playheadPosition);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayback, timeline, playheadPosition, splitClip, selectedClipIds, deleteClip, selectAllClips, totalDuration, setPlayheadPosition, undo, redo, addMarker, getNextMarker, getPreviousMarker, nudgeClips, nudgeClipEdge, updateClip]);

  const handleAssetSelect = (asset: Asset) => {
    setSelectedAsset(asset);
  };

  const handleAddToTimeline = (asset: Asset) => {
    addClipToTimeline(asset);
    setSelectedAsset(asset);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const xmlString = e.target?.result as string;
        importXML(xmlString);
      };
      reader.readAsText(file);
    }
    event.target.value = '';
  };

  const handleMediaUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      addMediaFiles(files);
    }
    event.target.value = '';
  };

  return (
    <div className="h-screen w-screen bg-[#050505] flex flex-col font-sans text-gray-200 overflow-hidden selection:bg-[#26c6da]/30">
      <Header
        onImportClick={handleFileChange}
        renderToMP4={renderToMP4}
        renderStatus={renderStatus}
        renderProgress={renderProgress}
        lastRenderPath={lastRenderPath}
        exportToXML={exportToXML}
        exportToEDL={exportToEDL}
        deleteProject={deleteProject}
        timelineState={timeline}
        onLogout={onLogout}
      />

      <div className="flex-grow flex overflow-hidden">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        <div className="flex-grow flex flex-col overflow-hidden bg-[#050505]">
          <div className="flex-[3] flex overflow-hidden border-b border-white/[0.05]">
            <div className={`${activeTab === 'transcript' ? 'w-[500px]' : 'w-[320px]'} bg-[#0a0a0a] border-r border-white/[0.05] flex flex-col transition-all duration-300 ease-in-out`}>
              {activeTab === 'media' && (
                <MediaPool
                  assets={assets}
                  onAddToTimeline={handleAddToTimeline}
                  onMediaUpload={handleMediaUpload}
                />
              )}
              {activeTab === 'transcript' && (
                <TranscriptView
                  asset={activeTranscriptAsset}
                  playheadPosition={playheadPosition}
                  timeline={timeline}
                  onSeek={(originalTime) => {
                    console.log('🎯 SEEK DEBUG: Word clicked at source time:', originalTime.toFixed(3), 'seconds');

                    // 1. Try to find precise clip
                    const EPSILON = 0.001;

                    for (const track of timeline.tracks) {
                      for (const clip of track.clips) {
                        const matchesAsset = clip.assetId === activeTranscriptAsset?.id || clip.sourceFileName === activeTranscriptAsset?.name;

                        console.log(`  Checking clip: trimStart=${clip.trimStart.toFixed(2)}, trimEnd=${clip.trimEnd.toFixed(2)}, timelineStart=${clip.start.toFixed(2)}`);

                        // Check if time is within the TRIMMED range of the clip
                        if (matchesAsset && originalTime >= (clip.trimStart - EPSILON) && originalTime < (clip.trimEnd + EPSILON)) {
                          // Calculates exact timeline position
                          const offsetInClip = originalTime - clip.trimStart;
                          const timelineTime = clip.start + offsetInClip;

                          // Apply pre-roll (0.1s) HERE, on the timeline time
                          const targetPosition = Math.max(0, timelineTime - 0.1);

                          console.log('✅ FOUND CLIP! Timeline position:', targetPosition.toFixed(3));
                          setPlayheadPosition(targetPosition);
                          return;
                        }
                      }
                    }

                    console.log('⚠️ No exact clip match, using fallback...');

                    // 2. Fallback: Smart Seek for words that might be slightly outside cut boundaries
                    // Find the nearest clip in the timeline that contains this source time range
                    const assetClips = timeline.tracks
                      .flatMap(t => t.clips)
                      .filter(c => c.assetId === activeTranscriptAsset?.id || c.sourceFileName === activeTranscriptAsset?.name)
                      .sort((a, b) => a.start - b.start);

                    if (assetClips.length > 0) {
                      let closestClip = null;
                      let minDistance = Number.MAX_VALUE;

                      for (const clip of assetClips) {
                        // Check distance to clip boundaries
                        const distStart = Math.abs(originalTime - clip.trimStart);
                        const distEnd = Math.abs(originalTime - clip.trimEnd);
                        const localMin = Math.min(distStart, distEnd);

                        if (localMin < minDistance) {
                          minDistance = localMin;
                          closestClip = clip;
                        }
                      }

                      if (closestClip) {
                        console.log('📍 Closest clip found:', closestClip.trimStart.toFixed(2), 'to', closestClip.trimEnd.toFixed(2));

                        // If original time is before clip, jump to start
                        if (originalTime < closestClip.trimStart) {
                          console.log('  → Seeking to clip START');
                          setPlayheadPosition(closestClip.start);
                        }
                        // If original time is after clip, jump to end (or start of next?)
                        else if (originalTime > closestClip.trimEnd) {
                          setPlayheadPosition(closestClip.end - 0.1);
                        }
                        // Should be covered by main loop, but theoretically possible fallback
                        else {
                          const offset = originalTime - closestClip.trimStart;
                          setPlayheadPosition(closestClip.start + offset - 0.1);
                        }
                      }
                    }
                  }}
                  onTranscribe={transcribeAsset}
                  onAutoCut={autoCutAsset}
                  onExport={exportTranscript}
                  onUploadTranscript={uploadTranscript}
                  isTranscribing={!!isTranscribing}
                  progress={transcriptionProgress}
                  onToggleWord={(start) => toggleSegmentDelete(start)}
                  onDeleteRange={(start, end) => {
                    if (activeTranscriptAsset?.id) {
                      deleteClipRange(activeTranscriptAsset.id, start, end);
                    }
                  }}
                  onRestoreRange={(start, end) => {
                    if (activeTranscriptAsset?.id) {
                      restoreClipRange(activeTranscriptAsset.id, start, end);
                    }
                  }}
                />
              )}
              {activeTab !== 'media' && activeTab !== 'transcript' && (
                <div className="flex-grow flex items-center justify-center text-gray-500 italic text-xs">
                  {activeTab.toUpperCase()} Panel - Coming Soon
                </div>
              )}
            </div>

            <div className="flex-grow flex flex-col bg-[#050505] relative group">
              <div className="absolute top-0 left-0 right-0 h-10 px-4 flex items-center glass border-b border-white/[0.05] opacity-0 group-hover:opacity-100 transition-all duration-300 z-10">
                <span className="text-[9px] uppercase font-bold tracking-[0.3em] text-[#fafafa] font-display">Live Preview / Stage</span>
              </div>
              <div className="flex-grow flex items-center justify-center overflow-hidden">
                <Preview clip={currentClip} playheadPosition={playheadPosition} isPlaying={isPlaying} />
              </div>
              <div className="bg-[#0a0a0a] border-t border-white/[0.05]">
                <PlaybackControls
                  isPlaying={isPlaying}
                  togglePlayback={togglePlayback}
                  playheadPosition={playheadPosition}
                  totalDuration={totalDuration}
                  onSeek={setPlayheadPosition}
                />
              </div>
            </div>

            {/* Inspector Panel - Hidden in Transcript tab, visible in Media tab */}
            {activeTab !== 'transcript' && (
              <div className="w-[300px] border-l border-white/[0.05] bg-[#0a0a0a]">
                <Inspector
                  selectedAsset={selectedAsset || (currentClip?.asset ?? null)}
                  selectedClip={timeline.tracks.flatMap((t: any) => t.clips).find((c: any) => selectedClipIds.includes(c.id)) || null}
                  onUpdateClip={updateClip}
                />
              </div>
            )}
          </div>

          <div className="flex-[2] flex flex-col bg-[#050505] overflow-hidden">
            <div className="h-10 px-4 flex items-center justify-between border-b border-white/[0.05] glass">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <button className="text-gray-400 hover:text-white p-1 transition-colors" title="Import Media"><AddIcon className="w-4 h-4" /></button>
                  <div className="h-4 w-[1px] bg-[#333]"></div>

                  {/* Magnetic Toggle */}
                  <button
                    onClick={() => setIsMagnetic(!isMagnetic)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all border ${isMagnetic
                      ? 'bg-[#26c6da1a] text-[#26c6da] border-[#26c6da44] hover:bg-[#26c6da2a]'
                      : 'bg-[#2d2d2d] text-gray-500 border-[#444] hover:bg-[#3d3d3d]'
                      }`}
                    title="Toggle Magnetic Timeline (Ripple Editing)"
                  >
                    MAGNET: {isMagnetic ? 'ON' : 'OFF'}
                  </button>

                  <div className="h-4 w-[1px] bg-[#333]"></div>

                  <button
                    onClick={() => {
                      const targetClip = timeline.tracks.flatMap((t: any) => t.clips).find((c: any) => playheadPosition >= c.start && playheadPosition < c.end);
                      if (targetClip) splitClip(targetClip.id, playheadPosition);
                    }}
                    className="flex items-center gap-1 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-gray-300 hover:text-white px-2 py-0.5 rounded text-[10px] font-bold transition-colors border border-[#444]"
                    title="Split Clip (S)"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 5L6 9l5 4M13 19l5-4-5-4" /></svg>
                    SPLIT
                  </button>
                  <button
                    onClick={() => {
                      deleteClip();
                    }}
                    disabled={selectedClipIds.length === 0}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-colors border ${selectedClipIds.length > 0
                      ? 'bg-[#2d2d2d] hover:bg-red-900/40 text-red-500 border-red-900/50 hover:border-red-500/50'
                      : 'bg-[#1a1a1a] text-gray-700 border-[#2d2d2d] cursor-not-allowed'
                      }`}
                    title="Delete Selected (Del)"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                    DELETE
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
                <span className="text-[#26c6da] tabular-nums">{formatTime(playheadPosition)}</span>
                <span>/</span>
                <span className="tabular-nums">{formatTime(totalDuration)}</span>
              </div>
            </div>

            <div className="flex-grow overflow-auto">
              <Timeline
                timeline={timeline}
                assets={assets}
                playheadPosition={playheadPosition}
                onPlayheadUpdate={setPlayheadPosition}
                onClipMove={moveClip}
                onClipsMove={moveClips}
                onClipSplit={splitClip}
                onClipDelete={deleteClip}
                onClipUpdate={updateClip}
                selectedClipIds={selectedClipIds}
                onSelectClip={onSelectClip}
                totalDuration={totalDuration}
                onToggleMute={toggleTrackMute}
                onToggleLock={toggleTrackLock}
                markers={markers}
                onAddMarker={addMarker}
                onRemoveMarker={removeMarker}
                onUpdateMarker={updateMarker}
                onSplitAtPlayhead={splitClipAtPlayhead}
                onSelectClipsInRange={selectClipsInRange}
                onSetTrackHeight={setTrackHeight}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
