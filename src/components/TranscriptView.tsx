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
    progress?: number;
    onToggleWord?: (start: number) => void;
    timeline: TimelineState; // Use TimelineState type
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
    asset,
    playheadPosition,
    onSeek,
    onTranscribe,
    onAutoCut,
    onExport,
    onUploadTranscript,
    isTranscribing,
    progress = 0,
    onToggleWord,
    timeline
}) => {
    // ALL HOOKS MUST BE AT THE TOP - React Rules of Hooks
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const currentWordRef = useRef<HTMLSpanElement>(null);
    const [isDeleteMode, setIsDeleteMode] = React.useState(false);
    const [showThoughts, setShowThoughts] = React.useState(false); // New: thought view toggle

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && asset) {
            onUploadTranscript(asset.id, e.target.files[0]);
        }
    };

    // Auto-scroll to current word
    useEffect(() => {
        if (currentWordRef.current && scrollContainerRef.current) {
            currentWordRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        }
    }, [playheadPosition]);

    if (!asset) {
        return (
            <div className="flex-grow flex items-center justify-center text-gray-500 italic text-xs p-4 text-center">
                Select a video clip to see the transcript
            </div>
        );
    }

    if (isTranscribing) {
        return (
            <div className="flex-grow flex flex-col items-center justify-center gap-4 p-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#26c6da]"></div>
                <div className="text-gray-400 text-xs font-medium animate-pulse text-center">
                    Transcribing Video...
                    <div className="text-[#26c6da] font-bold text-lg mt-1">{progress}%</div>
                </div>
                {/* Progress Bar Track */}
                <div className="w-48 h-1.5 bg-[#252525] rounded-full overflow-hidden">
                    <div
                        className="h-full bg-[#26c6da] transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                    ></div>
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

    const words = asset.transcription.words || [];

    return (
        <div className="flex-grow flex flex-col overflow-hidden bg-[#1a1a1a]">
            <div className="h-8 px-3 flex items-center justify-between border-b border-[#2d2d2d] bg-[#252525]">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Transcript</span>
                    {asset.transcription.source && (
                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase ${asset.transcription.source === 'ai' ? 'bg-[#26c6da22] text-[#26c6da]' : 'bg-purple-900/40 text-purple-400'}`}>
                            {asset.transcription.source === 'ai' ? 'AI GEN' : 'UPLOADED'}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsDeleteMode(!isDeleteMode)}
                        className={`text-[9px] font-bold uppercase transition-colors px-2 py-0.5 rounded ${isDeleteMode ? 'bg-red-900/40 text-red-500' : 'text-gray-400 hover:text-white'}`}
                        title={isDeleteMode ? "Click words to delete" : "Click words to seek"}
                    >
                        {isDeleteMode ? "MODE: DELETE" : "MODE: NAVIGATE"}
                    </button>
                    <div className="w-[1px] h-3 bg-[#333]"></div>
                    {/* Thought View Toggle */}
                    {asset.transcription.thoughts && (
                        <>
                            <button
                                onClick={() => setShowThoughts(!showThoughts)}
                                className={`text-[9px] font-bold uppercase transition-colors px-2 py-0.5 rounded ${showThoughts ? 'bg-cyan-900/40 text-cyan-400' : 'text-gray-400 hover:text-white'}`}
                                title={showThoughts ? "Show words" : "Show thought groups"}
                            >
                                {showThoughts ? "VIEW: THOUGHTS" : "VIEW: WORDS"}
                            </button>
                            <div className="w-[1px] h-3 bg-[#333]"></div>
                        </>
                    )}
                    <label className="cursor-pointer text-[9px] text-[#26c6da] hover:underline font-bold uppercase" title="Upload Replacement Transcript">
                        REPLACE
                        <input type="file" accept=".srt,.vtt,.json,.txt" className="hidden" onChange={handleUpload} />
                    </label>
                    <div className="w-[1px] h-3 bg-[#333]"></div>
                    <button
                        onClick={() => onAutoCut(asset.id)}
                        className="text-[9px] text-[#26c6da] hover:underline font-bold uppercase"
                    >
                        Auto-Cut
                    </button>
                    <div className="w-[1px] h-3 bg-[#333]"></div>
                    {asset?.transcription && (
                        <button
                            onClick={() => onExport(asset.transcription!)}
                            className="text-[9px] text-gray-400 hover:text-white hover:underline font-bold uppercase transition-colors"
                        >
                            TXT
                        </button>
                    )}
                </div>
            </div>
            <div className="flex-grow overflow-y-auto p-4 custom-scrollbar" ref={scrollContainerRef}>
                {showThoughts && asset.transcription.thoughts ? (
                    // Thought View
                    <ThoughtListView
                        thoughts={asset.transcription.thoughts.thoughts}
                        currentTime={playheadPosition}
                        onSeek={onSeek}
                    />
                ) : (
                    // Word View (Default)
                    <div className="flex flex-wrap gap-x-1.5 gap-y-2 leading-relaxed">
                        {words.map((word, i) => {
                            // Map timeline position to original video time
                            const allClips = timeline.tracks.flatMap(t => t.clips);
                            let originalTime = allClips.length > 0 ? -1 : playheadPosition;

                            // Find which clip contains the playhead (only if timeline exists)
                            if (allClips.length > 0) {
                                let found = false;
                                for (const track of timeline.tracks) {
                                    for (const clip of track.clips) {
                                        if (playheadPosition >= clip.start && playheadPosition <= clip.end) {
                                            // Calculate offset within clip
                                            const offsetInClip = playheadPosition - clip.start;
                                            // Map to original video time
                                            originalTime = clip.trimStart + offsetInClip;
                                            found = true;
                                            break;
                                        }
                                    }
                                    if (found) break;
                                }
                            }

                            const EPSILON = 0.05; // 50ms tolerance
                            const isCurrent = originalTime >= (word.start / 1000 - EPSILON) && originalTime < (word.end / 1000 + EPSILON);
                            const isDeleted = (word as any).isDeleted || false;

                            return (
                                <span
                                    key={i}
                                    ref={isCurrent ? currentWordRef : null}
                                    onClick={(e) => {
                                        // Navigate mode: standard seek
                                        // Delete mode: toggle delete
                                        if (isDeleteMode && onToggleWord) {
                                            onToggleWord(word.start / 1000);
                                        } else {
                                            onSeek(word.start / 1000);
                                        }
                                    }}
                                    className={`cursor-pointer px-1.5 py-1 rounded transition-all text-sm
                  ${isCurrent ? 'bg-[#26c6da] text-[#0f0f0f] font-bold scale-110 shadow-lg z-10' : ''}
                  ${isDeleted ? 'line-through text-red-500 opacity-50 bg-red-900/20' : 'text-gray-300 hover:bg-[#333] hover:text-white'}
                `}
                                    title={`${formatTime(word.start / 1000)} ${isDeleteMode ? '(Click to Delete)' : '(Click to Seek)'}`}
                                >
                                    {word.word}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
