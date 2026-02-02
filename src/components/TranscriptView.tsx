import React from 'react';
import { Asset, Transcription } from '../types';
import { formatTime } from '../utils/time';

interface TranscriptViewProps {
    asset: Asset | null;
    playheadPosition: number;
    onSeek: (time: number) => void;
    onTranscribe: (assetId: string, fileName: string) => void;
    onAutoCut: (assetId: string) => void;
    isTranscribing: boolean;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({ asset, playheadPosition, onSeek, onTranscribe, onAutoCut, isTranscribing }) => {
    if (!asset) {
        return (
            <div className="flex-grow flex items-center justify-center text-gray-500 italic text-xs p-4 text-center">
                Select a video clip to see the transcript
            </div>
        );
    }

    if (isTranscribing) {
        return (
            <div className="flex-grow flex flex-col items-center justify-center gap-3 p-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#26c6da]"></div>
                <div className="text-gray-400 text-xs font-medium animate-pulse">Transcribing Video...</div>
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
                    <button
                        onClick={() => onTranscribe(asset.id, asset.name)}
                        className="bg-[#26c6da] hover:bg-[#4dd0e1] text-[#0f0f0f] px-6 py-2 rounded-full text-xs font-bold transition-all active:scale-95 shadow-lg shadow-[#26c6da]/20"
                    >
                        GENERATE TRANSCRIPT
                    </button>
                </div>
            </div>
        );
    }

    const words = asset.transcription.words || [];

    return (
        <div className="flex-grow flex flex-col overflow-hidden bg-[#1a1a1a]">
            <div className="h-8 px-3 flex items-center justify-between border-b border-[#2d2d2d] bg-[#252525]">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Transcript</span>
                {asset?.transcription && (
                    <button
                        onClick={() => onAutoCut(asset.id)}
                        className="text-[9px] text-[#26c6da] hover:underline font-bold uppercase"
                    >
                        Auto-Cut Silence
                    </button>
                )}
            </div>
            <div className="flex-grow overflow-y-auto p-4 custom-scrollbar">
                <div className="flex flex-wrap gap-x-1.5 gap-y-2 leading-relaxed">
                    {words.map((word, i) => {
                        const isCurrent = playheadPosition >= word.start / 1000 && playheadPosition < word.end / 1000;
                        return (
                            <span
                                key={i}
                                onClick={() => onSeek(word.start / 1000)}
                                className={`cursor-pointer px-1 py-0.5 rounded transition-all text-sm
                  ${isCurrent ? 'bg-[#26c6da] text-[#0f0f0f] font-bold scale-110 shadow-lg z-10' : 'text-gray-300 hover:bg-[#333] hover:text-white'}
                `}
                                title={`${formatTime(word.start / 1000)}`}
                            >
                                {word.word}
                            </span>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
