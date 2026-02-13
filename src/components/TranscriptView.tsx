import React, { useEffect, useRef } from 'react';
import { Asset, Transcription, TimelineState } from '../types';
import { formatTime } from '../utils/time';
import { ThoughtListView, ThoughtStats } from './ThoughtView';

interface TranscriptViewProps {
    asset: Asset | null;
    playheadPosition: number;
    onSeek: (time: number) => void;
    onTranscribe: (assetId: string, fileName: string) => void;
    onAutoCut: (assetId: string) => void;
    onExport: (transcription: Transcription) => void;
    onUploadTranscript: (assetId: string, file: File) => void;
    isTranscribing: boolean;
    isAutoCutting?: boolean;
    progress?: number;
    onToggleWord?: (start: number) => void;
    onDeleteRange?: (start: number, end: number) => void;
    onRestoreRange?: (start: number, end: number) => void;
    onRefine?: (assetId: string) => void;
    timeline: TimelineState;
    transcriptOffset?: number; // Time offset for SRT calibration (seconds)
    onOffsetChange?: (offset: number) => void; // Callback to update offset
    activeAssetRanges?: Array<{ start: number; end: number }>;
    wordInclusionStatus?: boolean[];
}

// Optimized Word Component to prevent 50,000 re-renders per frame
// Optimized Word Component to prevent 50,000 re-renders per frame
const TranscriptWord = React.memo(({
    word,
    index,
    // isCurrent, // REMOVED: Managed via Direct DOM
    isIncluded,
    isSelected,
    handleWordClick,
    handleContextMenu
}: any) => {
    // const wordRef = useRef<HTMLSpanElement>(null); // REMOVED: Using ID for selection

    return (
        <span
            id={`word-${index}`} // Added ID for O(1) DOM access
            onClick={(e) => handleWordClick(index, e)}
            onContextMenu={(e) => handleContextMenu(e, index, isIncluded)}
            className={`transcript-word cursor-pointer px-2 py-0.5 rounded-sm transition-all duration-75 text-sm border border-transparent
                  ${isSelected ? 'bg-[#26c6da] text-[#0f0f0f] font-bold' : ''}
                  ${!isIncluded && !isSelected
                    ? 'text-red-500/80 bg-red-500/10 line-through decoration-red-500/50'
                    : !isSelected ? 'text-[#fafafa] hover:bg-white/5 hover:text-white' : ''}
                `}
            title={`${formatTime(word.start / 1000)}`}
        >
            {word.word}
        </span>
    );
}, (prev, next) => {
    // Custom comparison for performance
    return (
        prev.isIncluded === next.isIncluded &&
        prev.isSelected === next.isSelected &&
        prev.word === next.word &&
        prev.handleWordClick === next.handleWordClick &&
        prev.handleContextMenu === next.handleContextMenu
    );
});
TranscriptWord.displayName = 'TranscriptWord';

export const TranscriptView: React.FC<TranscriptViewProps> = ({
    asset,
    playheadPosition,
    onSeek,
    onTranscribe,
    onAutoCut,
    onExport,
    onUploadTranscript,
    isTranscribing,
    isAutoCutting = false,
    progress = 0,
    onToggleWord,
    onDeleteRange,
    onRestoreRange,
    onRefine,
    timeline,
    transcriptOffset = 0,
    onOffsetChange,
    activeAssetRanges = [],
    wordInclusionStatus = []
}) => {
    // ALL HOOKS MUST BE AT THE TOP - React Rules of Hooks
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const currentWordRef = useRef<HTMLSpanElement>(null);
    const [isDeleteMode, setIsDeleteMode] = React.useState(false);
    const [showThoughts, setShowThoughts] = React.useState(false); // New: thought view toggle

    // Context Menu State
    const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; index: number; isIncluded: boolean } | null>(null);

    // Close context menu on click elsewhere
    useEffect(() => {
        const checkClose = () => setContextMenu(null);
        window.addEventListener('click', checkClose);
        return () => window.removeEventListener('click', checkClose);
    }, []);

    // --- SELECTION LOGIC ---
    const [selectionStart, setSelectionStart] = React.useState<number | null>(null);
    const [selectionEnd, setSelectionEnd] = React.useState<number | null>(null);

    const words = React.useMemo(() => asset?.transcription?.words || [], [asset]);

    const handleWordClick = React.useCallback((index: number, e: React.MouseEvent) => {
        if (e.button === 2) return; // Ignore right click here, handled by onContextMenu

        if (e.shiftKey && selectionStart !== null) {
            // Range Selection
            setSelectionEnd(index);
        } else {
            // Single Selection / Seek
            setSelectionStart(index);
            setSelectionEnd(null);

            // Seeking logic
            const word = words[index];
            if (word) {
                // Seek directly to word start (pre-roll handled in App.tsx now for accuracy)
                if (isDeleteMode && onToggleWord) {
                    onToggleWord(word.start / 1000);
                } else {
                    onSeek(word.start / 1000);
                }
            }
        }
    }, [selectionStart, words, isDeleteMode, onToggleWord, onSeek]);

    const handleContextMenu = React.useCallback((e: React.MouseEvent, index: number, isIncluded: boolean) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            index,
            isIncluded
        });

        // If the right-clicked word is NOT part of the current selection, update selection to just this word
        const isInsideSelection = selectionStart !== null && (
            (selectionEnd === null && index === selectionStart) ||
            (selectionEnd !== null && index >= Math.min(selectionStart, selectionEnd) && index <= Math.max(selectionStart, selectionEnd))
        );

        if (!isInsideSelection) {
            setSelectionStart(index);
            setSelectionEnd(null);
        }
    }, [selectionStart, selectionEnd]);

    const handleDeleteRange = React.useCallback(() => {
        if (selectionStart === null || !onDeleteRange) return;

        const startIdx = selectionStart;
        const endIdx = selectionEnd !== null ? selectionEnd : selectionStart;
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
        const startWord = words[min];
        const endWord = words[max];

        if (startWord && endWord) {
            onDeleteRange(startWord.start / 1000, endWord.end / 1000);
            // Clear selection after delete
            setSelectionStart(null);
            setSelectionEnd(null);
        }
    }, [selectionStart, selectionEnd, words, onDeleteRange]);

    const handleRestoreRange = React.useCallback(() => {
        if (selectionStart === null || !onRestoreRange) return;

        const startIdx = selectionStart;
        const endIdx = selectionEnd !== null ? selectionEnd : selectionStart;

        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);

        const startWord = words[min];
        const endWord = words[max];

        if (startWord && endWord) {
            onRestoreRange(startWord.start / 1000, endWord.end / 1000);
            setSelectionStart(null);
            setSelectionEnd(null);
        }
    }, [selectionStart, selectionEnd, words, onRestoreRange]);


    // Handle Delete Key
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (selectionStart !== null && (e.key === 'Delete' || e.key === 'Backspace')) {
                handleDeleteRange();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectionStart, handleDeleteRange]);

    // OPTIMIZATION: Calculate originalTime ONCE per render
    const originalVideoTime = React.useMemo(() => {
        if (!asset) return -1;

        // Find the clip at the playhead
        for (const track of timeline.tracks) {
            for (const clip of track.clips) {
                if (playheadPosition >= clip.start && playheadPosition <= clip.end) {
                    // CRITICAL FIX: Only sync if this clip actually belongs to the current transcript asset
                    if (clip.assetId === asset.id || clip.sourceFileName === asset.name) {
                        const offsetInClip = playheadPosition - clip.start;
                        return clip.trimStart + offsetInClip;
                    }
                }
            }
        }
        return -1;
    }, [playheadPosition, timeline.tracks, asset]);

    // Inclusion ranges and status now received as props from App.tsx 
    // to centralize timeline-sync logic and allow actions to use the same logic.

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && asset) {
            onUploadTranscript(asset.id, e.target.files[0]);
        }
    };


    // OPTIMIZATION: Direct DOM Manipulation for Highlighting
    // This bypasses the React Render Cycle entirely for the frequent "current word" updates
    const activeWordIndexRef = useRef<number>(-1);

    useEffect(() => {
        const EPSILON = 0.05;
        // Binary Search for performance O(log N)
        let low = 0;
        let high = words.length - 1;
        let foundIndex = -1;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const word = words[mid];
            const start = word.start / 1000;
            const end = word.end / 1000;

            if (originalVideoTime >= (start - EPSILON) && originalVideoTime < (end + EPSILON)) {
                foundIndex = mid;
                break;
            } else if (originalVideoTime < start) {
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }

        // DOM Update
        if (foundIndex !== activeWordIndexRef.current) {
            // Remove highlight from previous
            if (activeWordIndexRef.current !== -1) {
                const prevEl = document.getElementById(`word-${activeWordIndexRef.current}`);
                if (prevEl) {
                    prevEl.classList.remove('bg-[#26c6da22]', 'text-[#26c6da]', 'font-bold', 'shadow-[0_0_10px_rgba(38,198,218,0.2)]');
                    prevEl.classList.add('text-[#fafafa]'); // Restore default color
                }
            }

            // Add highlight to new
            if (foundIndex !== -1) {
                const newEl = document.getElementById(`word-${foundIndex}`);
                if (newEl) {
                    newEl.classList.remove('text-[#fafafa]');
                    newEl.classList.add('bg-[#26c6da22]', 'text-[#26c6da]', 'font-bold', 'shadow-[0_0_10px_rgba(38,198,218,0.2)]');

                    // Scroll into view DISABLED as per user request to avoid annoyance
                    // if (scrollContainerRef.current) {
                    //     const container = scrollContainerRef.current;
                    //     const offset = newEl.offsetTop - container.offsetTop - (container.clientHeight / 2) + (newEl.clientHeight / 2);
                    //     container.scrollTo({ top: offset, behavior: 'smooth' });
                    // }
                }
            }
            activeWordIndexRef.current = foundIndex;
        }

    }, [originalVideoTime, words]);

    // Auto-scroll logic is now integrated into the Direct DOM effect above for synchronization

    if (!asset) {
        return (
            <div className="flex-grow flex items-center justify-center text-gray-500 italic text-xs p-4 text-center">
                Select a video clip to see the transcript
            </div>
        );
    }

    if (isTranscribing || isAutoCutting) {
        return (
            <div className="flex-grow flex flex-col p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="h-4 w-24 bg-white/10 rounded animate-pulse"></div>
                        <div className="h-4 w-16 bg-white/5 rounded-full animate-pulse"></div>
                    </div>
                    <div className="h-6 w-20 bg-white/5 rounded animate-pulse"></div>
                </div>

                <div className="flex flex-col gap-6">
                    {/* Progress Info */}
                    <div className="flex flex-col items-center justify-center gap-3 py-4">
                        <div className="relative w-12 h-12 flex items-center justify-center">
                            <div className="absolute inset-0 border-2 border-[#26c6da33] rounded-full"></div>
                            <div className="absolute inset-0 border-2 border-[#26c6da] border-t-transparent rounded-full animate-spin"></div>
                            {isTranscribing && <span className="text-[10px] font-bold text-[#26c6da]">{progress}%</span>}
                        </div>
                        <div className="text-center">
                            <div className="text-xs font-bold text-[#fafafa] uppercase tracking-widest mb-1">
                                {isTranscribing ? 'Transcribing Audio' : 'AI Auto-Cutting'}
                            </div>
                            <div className="text-[10px] text-gray-500 animate-pulse">
                                {isTranscribing ? 'Converting speech to text...' : 'Analyzing repetitions and fluff...'}
                            </div>
                        </div>
                    </div>

                    {/* Skeleton Word Blocks */}
                    <div className="flex flex-wrap gap-x-3 gap-y-4">
                        {[...Array(40)].map((_, i) => (
                            <div
                                key={i}
                                className="h-4 bg-white/5 rounded animate-pulse"
                                style={{
                                    width: `${Math.random() * 40 + 40}px`,
                                    animationDelay: `${i * 0.05}s`,
                                    opacity: Math.random() * 0.5 + 0.3
                                }}
                            ></div>
                        ))}
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-4 opacity-60">
                        {[...Array(30)].map((_, i) => (
                            <div
                                key={i}
                                className="h-4 bg-white/5 rounded animate-pulse"
                                style={{
                                    width: `${Math.random() * 50 + 30}px`,
                                    animationDelay: `${(i + 40) * 0.05}s`,
                                    opacity: Math.random() * 0.4 + 0.2
                                }}
                            ></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!asset.transcription) {
        return (
            <div className="flex-grow flex flex-col items-center justify-center gap-4 p-4 text-center">
                <div className="w-16 h-16 rounded-full bg-[#252525] flex items-center justify-center text-gray-600">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                </div>
                <div>
                    <div className="text-gray-300 text-sm font-bold mb-1">No Transcript Found</div>
                    <div className="text-gray-500 text-[9px] mb-2 font-mono opacity-60">Source: {asset.name}</div>
                    <div className="text-gray-500 text-[10px] uppercase tracking-wider mb-4">Click below to generate with AI</div>
                    <div className="flex flex-col gap-3 items-center">
                        <button
                            onClick={() => onTranscribe(asset.id, asset.name)}
                            className="bg-[#26c6da] hover:bg-[#4dd0e1] text-[#0f0f0f] px-6 py-2 rounded-full text-xs font-bold transition-all active:scale-95 shadow-lg shadow-[#26c6da]/20"
                        >
                            GENERATE TRANSCRIPT
                        </button>
                        <div className="text-[10px] text-gray-600 font-bold">- OR -</div>
                        <label className="cursor-pointer bg-[#252525] hover:bg-[#333] text-gray-400 hover:text-white px-4 py-1.5 rounded-full text-[10px] font-bold transition-all border border-[#333] hover:border-[#444]">
                            UPLOAD FILE (SRT/JSON)
                            <input type="file" accept=".srt,.vtt,.json,.txt" className="hidden" onChange={handleUpload} />
                        </label>
                    </div>
                </div>
            </div>
        );
    }



    return (
        <div className="flex-grow flex flex-col overflow-hidden bg-[#0f0f0f]">
            <div className="h-10 px-4 flex items-center justify-between border-b border-[#ffffff0a] glass sticky top-0 z-20">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-[#fafafa] uppercase tracking-[0.2em] font-display">Transcript</span>
                    {asset.transcription.source && (
                        <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${asset.transcription.source === 'ai' ? 'bg-[#26c6da15] text-[#26c6da] border border-[#26c6da33]' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'}`}>
                            {asset.transcription.source === 'ai' ? 'AI Generated' : 'Uploaded'}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsDeleteMode(!isDeleteMode)}
                        className={`text-[9px] font-bold uppercase tracking-wider transition-all px-2.5 py-1 rounded-md border ${isDeleteMode ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'text-gray-400 hover:text-white border-transparent hover:border-white/10'}`}
                        title={isDeleteMode ? "Click words to delete" : "Click words to seek"}
                    >
                        {isDeleteMode ? "MODE: DELETE" : "MODE: NAVIGATE"}
                    </button>
                    <div className="w-[1px] h-3 bg-white/5"></div>
                    {/* Thought View Toggle */}
                    {asset.transcription.thoughts && (
                        <>
                            <button
                                onClick={() => setShowThoughts(!showThoughts)}
                                className={`text-[9px] font-bold uppercase tracking-wider transition-all px-2.5 py-1 rounded-md border ${showThoughts ? 'bg-cyan-500/10 text-[#26c6da] border-[#26c6da]/20' : 'text-gray-400 hover:text-white border-transparent hover:border-white/10'}`}
                                title={showThoughts ? "Show words" : "Show thought groups"}
                            >
                                {showThoughts ? "VIEW: THOUGHTS" : "VIEW: WORDS"}
                            </button>
                            <div className="w-[1px] h-3 bg-white/5"></div>
                        </>
                    )}
                    <label className="cursor-pointer text-[9px] text-[#26c6da] hover:text-[#4dd0e1] font-bold uppercase tracking-wider transition-colors" title="Upload Replacement Transcript">
                        REPLACE
                        <input type="file" accept=".srt,.vtt,.json,.txt" className="hidden" onChange={handleUpload} />
                    </label>
                    <div className="w-[1px] h-3 bg-white/5"></div>
                    <button
                        onClick={() => onAutoCut(asset.id)}
                        className="text-[9px] text-[#26c6da] hover:text-[#4dd0e1] font-bold uppercase tracking-wider transition-colors"
                    >
                        Auto-Cut
                    </button>
                    <div className="w-[1px] h-3 bg-white/5"></div>
                    {asset?.transcription && (
                        <button
                            onClick={() => onExport(asset.transcription!)}
                            className="text-[9px] text-gray-400 hover:text-white font-bold uppercase tracking-wider transition-colors"
                        >
                            TXT
                        </button>
                    )}
                    <div className="w-[1px] h-3 bg-white/5"></div>
                    {onRefine && asset && (
                        <button
                            onClick={() => onRefine(asset.id)}
                            className="text-[9px] text-blue-400 hover:text-blue-300 font-bold uppercase tracking-wider transition-colors"
                            title="Refine timestamps using audio analysis"
                        >
                            Refine
                        </button>
                    )}
                    {/* Offset Calibration Control */}
                    {onOffsetChange && (
                        <>
                            <div className="w-[1px] h-3 bg-white/5"></div>
                            <div className="flex items-center gap-1" title="Adjust if SRT timing is off from video">
                                <button
                                    onClick={() => onOffsetChange(transcriptOffset - 0.1)}
                                    className="text-[9px] text-gray-500 hover:text-white px-1 py-0.5 rounded hover:bg-white/5 transition-colors"
                                >
                                    −
                                </button>
                                <span className="text-[8px] text-gray-500 font-mono min-w-[40px] text-center">
                                    {transcriptOffset === 0 ? 'SYNC' : `${transcriptOffset > 0 ? '+' : ''}${transcriptOffset.toFixed(1)}s`}
                                </span>
                                <button
                                    onClick={() => onOffsetChange(transcriptOffset + 0.1)}
                                    className="text-[9px] text-gray-500 hover:text-white px-1 py-0.5 rounded hover:bg-white/5 transition-colors"
                                >
                                    +
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
            <div className="flex-grow overflow-y-auto p-4 custom-scrollbar" ref={scrollContainerRef}>
                {showThoughts && asset.transcription.thoughts ? (
                    // Thought View
                    <ThoughtListView
                        thoughts={asset.transcription.thoughts.thoughts}
                        currentTime={playheadPosition}
                        activeAssetRanges={activeAssetRanges}
                        onSeek={onSeek}
                    />
                ) : (
                    // Word View (Default)
                    <div className="flex flex-wrap gap-x-1.5 gap-y-2.5 leading-relaxed font-medium">
                        {words.map((word, i) => {
                            const isIncluded = wordInclusionStatus[i];

                            // Selection state
                            const isSelected = selectionStart !== null && (
                                (selectionEnd === null && i === selectionStart) ||
                                (selectionEnd !== null && i >= Math.min(selectionStart, selectionEnd) && i <= Math.max(selectionStart, selectionEnd))
                            );

                            return (
                                <TranscriptWord
                                    key={i}
                                    word={word}
                                    index={i}
                                    // isCurrent prop REMOVED - Handled by Direct DOM
                                    isIncluded={isIncluded}
                                    isSelected={isSelected}
                                    handleWordClick={handleWordClick}
                                    handleContextMenu={handleContextMenu}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed bg-[#1f1f1f] border border-[#ffffff1a] rounded-lg shadow-xl z-50 py-1 min-w-[120px]"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {contextMenu.isIncluded ? (
                        <button
                            onClick={() => {
                                handleDeleteRange();
                                setContextMenu(null);
                            }}
                            className="w-full text-left px-4 py-2 text-xs hover:bg-[#ffffff0a] text-red-400 hover:text-red-300 transition-colors flex items-center gap-2"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            Delete
                        </button>
                    ) : (
                        <button
                            onClick={() => {
                                handleRestoreRange();
                                setContextMenu(null);
                            }}
                            className="w-full text-left px-4 py-2 text-xs hover:bg-[#ffffff0a] text-[#26c6da] hover:text-[#4dd0e1] transition-colors flex items-center gap-2"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                            Restore
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
