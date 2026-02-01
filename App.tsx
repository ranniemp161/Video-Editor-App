
import React, { useState, ChangeEvent } from 'react';
import { MediaPool } from './components/MediaPool';
import { Preview } from './components/Preview';
import { Timeline } from './components/Timeline';
import { PlaybackControls } from './components/PlaybackControls';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Inspector } from './components/Inspector';
import { AddIcon } from './components/icons';
import { useTimeline } from './hooks/useTimeline';
import { Asset } from './types';
import { formatTime } from './utils/time';

const App: React.FC = () => {
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
    splitClip,
    deleteClip,
    updateClip,
    selectedClipId,
    setSelectedClipId,
    isMagnetic,
    setIsMagnetic,
  } = useTimeline();

  const [activeTab, setActiveTab] = useState('media');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

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
    <div className="h-screen w-screen bg-[#0f0f0f] flex flex-col font-sans text-gray-200 overflow-hidden">
      <Header onImportClick={handleFileChange} />

      <div className="flex-grow flex overflow-hidden">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        <div className="flex-grow flex flex-col overflow-hidden">
          <div className="flex-[3] flex overflow-hidden border-b border-[#2d2d2d]">
            <div className="w-[320px] bg-[#1a1a1a] border-r border-[#2d2d2d] flex flex-col">
              {activeTab === 'media' && (
                <MediaPool
                  assets={assets}
                  onAddToTimeline={handleAddToTimeline}
                  onMediaUpload={handleMediaUpload}
                />
              )}
              {activeTab !== 'media' && (
                <div className="flex-grow flex items-center justify-center text-gray-500 italic text-xs">
                  {activeTab.toUpperCase()} Panel - Coming Soon
                </div>
              )}
            </div>

            <div className="flex-grow flex flex-col bg-[#0f0f0f] relative group">
              <div className="absolute top-0 left-0 right-0 h-8 px-4 flex items-center bg-[#1a1a1a]/40 border-b border-[#2d2d2d]/30 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">Player-Timeline 01</span>
              </div>
              <div className="flex-grow flex items-center justify-center overflow-hidden">
                <Preview clip={currentClip} playheadPosition={playheadPosition} isPlaying={isPlaying} />
              </div>
              <div className="bg-[#1a1a1a] border-t border-[#2d2d2d]">
                <PlaybackControls
                  isPlaying={isPlaying}
                  togglePlayback={togglePlayback}
                  playheadPosition={playheadPosition}
                  totalDuration={totalDuration}
                  onSeek={setPlayheadPosition}
                />
              </div>
            </div>

            <div className="w-[300px] border-l border-[#2d2d2d]">
              <Inspector
                selectedAsset={selectedAsset || (currentClip?.asset ?? null)}
                selectedClip={timeline.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId) || null}
                onUpdateClip={updateClip}
              />
            </div>
          </div>

          <div className="flex-[2] flex flex-col bg-[#0f0f0f] overflow-hidden">
            <div className="h-9 px-4 flex items-center justify-between border-b border-[#2d2d2d] bg-[#1a1a1a]">
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
                      const targetClip = timeline.tracks.flatMap(t => t.clips).find(c => playheadPosition >= c.start && playheadPosition < c.end);
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
                      if (selectedClipId) deleteClip(selectedClipId);
                    }}
                    disabled={!selectedClipId}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-colors border ${selectedClipId
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
                onClipSplit={splitClip}
                onClipDelete={deleteClip}
                onClipUpdate={updateClip}
                selectedClipId={selectedClipId}
                onSelectClip={setSelectedClipId}
                totalDuration={totalDuration}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
