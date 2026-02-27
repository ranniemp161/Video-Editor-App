import React from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MediaPool } from './MediaPool';
import { TranscriptView } from './TranscriptView';
import { Preview } from './Preview';
import { PlaybackControls } from './PlaybackControls';
import { Inspector } from './Inspector';
import { Timeline } from './timeline';
import { AddIcon } from './icons';
import { formatTime } from '@/utils/time';
import { Asset } from '@/types';

interface EditorLayoutProps {
    // Common State
    activeTab: string;
    setActiveTab: (tab: string) => void;
    playheadPosition: number;
    setPlayheadPosition: (pos: number) => void;
    totalDuration: number;
    isPlaying: boolean;
    togglePlayback: () => void;
    undo: () => void;
    redo: () => void;
    onLogout: () => void;
    selectAllClips: () => void;

    // Timeline / Media State from useTimeline
    timeline: any;
    assets: Asset[];
    currentClip: any;
    selectedClipIds: string[];
    isMagnetic: boolean;
    setIsMagnetic: (m: boolean) => void;
    renderToMP4: () => void;
    renderStatus: 'idle' | 'rendering' | 'success' | 'error';
    renderProgress: number;
    lastRenderPath: string;
    exportToXML: () => void;
    exportToEDL: () => void;
    deleteProject: () => void;
    addClipToTimeline: (asset: Asset) => void;
    splitClip: (id: string, pos: number) => void;
    deleteClip: () => void;
    updateClip: (id: string, updates: any) => void;
    moveClip: any;
    moveClips: any;
    toggleTrackMute: any;
    toggleTrackLock: any;
    splitClipAtPlayhead: any;
    selectClipsInRange: any;
    setTrackHeight: any;
    onSelectClip: (id: string, shiftKey?: boolean) => void;

    // Transcript State
    activeTranscriptAsset: Asset | null;
    isTranscribing: boolean;
    isAutoCutting: boolean;
    transcriptionProgress: number;
    transcribeAsset: (assetId: string, fileName: string) => Promise<void>;
    autoCutAsset: (assetId: string) => Promise<void>;
    exportTranscript: (transcription: any) => Promise<void>;
    uploadTranscript: (assetId: string, file: File) => Promise<void>;
    refineTranscript: (assetId: string) => Promise<void>;
    toggleSegmentDelete: (start: number) => void;
    deleteClipRange: (id: string, start: number, end: number) => void;
    restoreClipRange: (id: string, start: number, end: number) => void;
    transcriptOffset: number;
    setTranscriptOffset: (o: number) => void;
    activeAssetRanges: any[];
    wordInclusionStatus: boolean[];
    onSeekFromTranscript: (sourceTime: number) => void;

    // Markers
    markers: any[];
    addMarker: (time: number) => void;
    removeMarker: (id: string) => void;
    updateMarker: (id: string, updates: any) => void;

    // Local Handlers
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleMediaUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    selectedAsset: Asset | null;
    handleAssetSelect: (asset: Asset) => void;
}

export const EditorLayout: React.FC<EditorLayoutProps> = (props) => {
    const {
        activeTab, setActiveTab, playheadPosition, setPlayheadPosition, totalDuration, isPlaying, togglePlayback, undo, redo, onLogout,
        timeline, assets, currentClip, selectedClipIds, isMagnetic, setIsMagnetic,
        renderToMP4, renderStatus, renderProgress, lastRenderPath, exportToXML, exportToEDL, deleteProject,
        addClipToTimeline, splitClip, deleteClip, updateClip, moveClip, moveClips, toggleTrackMute, toggleTrackLock,
        splitClipAtPlayhead, selectClipsInRange, setTrackHeight, selectAllClips, onSelectClip,
        activeTranscriptAsset, isTranscribing, isAutoCutting, transcriptionProgress, transcribeAsset, autoCutAsset,
        exportTranscript, uploadTranscript, refineTranscript, toggleSegmentDelete, deleteClipRange, restoreClipRange,
        transcriptOffset, setTranscriptOffset, activeAssetRanges, wordInclusionStatus, onSeekFromTranscript,
        markers, addMarker, removeMarker, updateMarker,
        handleFileChange, handleMediaUpload, selectedAsset, handleAssetSelect
    } = props;

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
                hasActiveProject={assets.length > 0}
            />

            <div className="flex-grow flex overflow-hidden">
                <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

                <div className="flex-grow flex flex-col overflow-hidden bg-[#050505]">
                    <div className="flex-[3] flex overflow-hidden border-b border-white/[0.05]">
                        <div className={`${activeTab === 'transcript' ? 'w-[500px]' : 'w-[320px]'} bg-[#0a0a0a] border-r border-white/[0.05] flex flex-col transition-all duration-300 ease-in-out`}>
                            {activeTab === 'media' && (
                                <MediaPool
                                    assets={assets}
                                    onAddToTimeline={(asset) => {
                                        addClipToTimeline(asset);
                                        handleAssetSelect(asset);
                                    }}
                                    onMediaUpload={handleMediaUpload}
                                />
                            )}
                            {activeTab === 'transcript' && (
                                <TranscriptView
                                    asset={activeTranscriptAsset}
                                    playheadPosition={playheadPosition}
                                    timeline={timeline}
                                    onSeek={onSeekFromTranscript}
                                    onTranscribe={transcribeAsset}
                                    onAutoCut={autoCutAsset}
                                    onExport={exportTranscript}
                                    onUploadTranscript={uploadTranscript}
                                    isTranscribing={isTranscribing}
                                    isAutoCutting={isAutoCutting}
                                    progress={transcriptionProgress}
                                    onToggleWord={(start) => {
                                        const words = activeTranscriptAsset?.transcription?.words || [];
                                        const wordIdx = words.findIndex((w: any) => Math.abs(w.start / 1000 - start) < 0.01);
                                        if (wordIdx === -1) return;

                                        const word = words[wordIdx];
                                        const isIncluded = wordInclusionStatus[wordIdx];

                                        if (activeTranscriptAsset?.id) {
                                            if (isIncluded) {
                                                deleteClipRange(activeTranscriptAsset.id, word.start / 1000, word.end / 1000);
                                            } else {
                                                restoreClipRange(activeTranscriptAsset.id, word.start / 1000, word.end / 1000);
                                            }
                                        }
                                        toggleSegmentDelete(start);
                                    }}
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
                                    onRefine={refineTranscript}
                                    transcriptOffset={transcriptOffset}
                                    onOffsetChange={setTranscriptOffset}
                                    activeAssetRanges={activeAssetRanges}
                                    wordInclusionStatus={wordInclusionStatus}
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
