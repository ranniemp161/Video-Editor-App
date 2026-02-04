import React from 'react';
import { formatTime } from '../utils/time';

export interface Thought {
    id: number;
    start_time: number;
    end_time: number;
    text: string;
    word_indices: number[];
    word_count: number;
    coherence_score: number;
    type: 'main_point' | 'tangent' | 'filler' | 'repetition';
    is_kept?: boolean;
}

interface ThoughtBoundaryProps {
    thought: Thought;
    isActive: boolean;
    onClick?: () => void;
}

/**
 * Visual separator showing thought boundaries
 */
export const ThoughtBoundary: React.FC<ThoughtBoundaryProps> = ({ thought, isActive, onClick }) => {
    const getTypeColor = (type: Thought['type']) => {
        switch (type) {
            case 'main_point':
                return 'border-cyan-500 bg-cyan-500/10';
            case 'tangent':
                return 'border-yellow-500 bg-yellow-500/10';
            case 'filler':
                return 'border-gray-500 bg-gray-500/10';
            case 'repetition':
                return 'border-red-500 bg-red-500/10';
            default:
                return 'border-gray-600 bg-gray-600/10';
        }
    };

    const getTypeLabel = (type: Thought['type']) => {
        switch (type) {
            case 'main_point':
                return 'Main Point';
            case 'tangent':
                return 'Tangent';
            case 'filler':
                return 'Filler';
            case 'repetition':
                return 'Repeat';
            default:
                return type;
        }
    };

    return (
        <div
            className={`
                w-full border-l-4 pl-3 py-2 mb-3
                ${getTypeColor(thought.type)}
                ${isActive ? 'opacity-100 scale-100' : 'opacity-70 hover:opacity-100'}
                transition-all cursor-pointer
            `}
            onClick={onClick}
        >
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                        Thought {thought.id + 1}
                    </span>
                    <span className={`
                        text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase
                        ${thought.type === 'main_point' ? 'bg-cyan-900/40 text-cyan-400' : ''}
                        ${thought.type === 'tangent' ? 'bg-yellow-900/40 text-yellow-400' : ''}
                        ${thought.type === 'filler' ? 'bg-gray-900/40 text-gray-400' : ''}
                        ${thought.type === 'repetition' ? 'bg-red-900/40 text-red-400' : ''}
                    `}>
                        {getTypeLabel(thought.type)}
                    </span>
                    {thought.is_kept !== undefined && (
                        <span className={`
                            text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase
                            ${thought.is_kept ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}
                        `}>
                            {thought.is_kept ? 'KEPT' : 'CUT'}
                        </span>
                    )}
                </div>
                <div className="text-[9px] text-gray-500 font-mono">
                    {formatTime(thought.start_time)} - {formatTime(thought.end_time)}
                </div>
            </div>

            <div className="flex items-center gap-3 text-[10px] text-gray-400">
                <span>{thought.word_count} words</span>
                <span>•</span>
                <span>Coherence: {Math.round(thought.coherence_score * 100)}%</span>
            </div>

            <div className="text-[11px] text-gray-300 mt-2 line-clamp-2">
                {thought.text}
            </div>
        </div>
    );
};

interface ThoughtListViewProps {
    thoughts: Thought[];
    currentTime: number;
    onSeek: (time: number) => void;
}

/**
 * Display list of thoughts with visual boundaries
 */
export const ThoughtListView: React.FC<ThoughtListViewProps> = ({
    thoughts,
    currentTime,
    onSeek
}) => {
    if (!thoughts || thoughts.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500 text-xs italic">
                No thoughts identified yet. Try Auto-Cut to analyze.
            </div>
        );
    }

    const currentThought = thoughts.find(
        t => currentTime >= t.start_time && currentTime <= t.end_time
    );

    return (
        <div className="flex flex-col gap-0">
            {thoughts.map((thought) => (
                <ThoughtBoundary
                    key={thought.id}
                    thought={thought}
                    isActive={currentThought?.id === thought.id}
                    onClick={() => onSeek(thought.start_time)}
                />
            ))}
        </div>
    );
};

interface ThoughtStatsProps {
    summary?: {
        total_thoughts: number;
        total_words: number;
        avg_words_per_thought: number;
        avg_coherence: number;
        type_distribution: Record<string, number>;
        total_duration: number;
    };
}

/**
 * Display thought analysis statistics
 */
export const ThoughtStats: React.FC<ThoughtStatsProps> = ({ summary }) => {
    if (!summary) {
        return null;
    }

    return (
        <div className="p-3 bg-[#252525] border-t border-[#2d2d2d]">
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                Thought Analysis
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                    <div className="text-gray-500">Total Thoughts</div>
                    <div className="text-cyan-400 font-bold">{summary.total_thoughts}</div>
                </div>
                <div>
                    <div className="text-gray-500">Avg Coherence</div>
                    <div className="text-cyan-400 font-bold">{Math.round(summary.avg_coherence * 100)}%</div>
                </div>
                <div>
                    <div className="text-gray-500">Words/Thought</div>
                    <div className="text-gray-300 font-bold">{summary.avg_words_per_thought.toFixed(1)}</div>
                </div>
                <div>
                    <div className="text-gray-500">Duration</div>
                    <div className="text-gray-300 font-bold">{Math.round(summary.total_duration)}s</div>
                </div>
            </div>

            {summary.type_distribution && Object.keys(summary.type_distribution).length > 0 && (
                <div className="mt-3 pt-2 border-t border-[#2d2d2d]">
                    <div className="text-[9px] text-gray-500 mb-1">Type Distribution</div>
                    <div className="flex flex-wrap gap-1">
                        {Object.entries(summary.type_distribution).map(([type, count]) => (
                            <span
                                key={type}
                                className="text-[9px] px-2 py-0.5 rounded-full bg-[#333] text-gray-300"
                            >
                                {type}: {count}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
