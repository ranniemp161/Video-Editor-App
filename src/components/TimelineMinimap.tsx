import React, { useRef } from 'react';
import { TimelineState, Asset } from '../types';

interface TimelineMinimapProps {
    timeline: TimelineState;
    totalDuration: number;
    viewportStart: number; // in seconds
    viewportEnd: number; // in seconds
    onNavigate: (newStart: number) => void;
}

export const TimelineMinimap: React.FC<TimelineMinimapProps> = ({
    timeline,
    totalDuration,
    viewportStart,
    viewportEnd,
    onNavigate
}) => {
    const minimapRef = useRef<HTMLDivElement>(null);
    const MINIMAP_HEIGHT = 60;

    const handleClick = (e: React.MouseEvent) => {
        if (!minimapRef.current) return;
        const rect = minimapRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const clickedTime = (x / rect.width) * totalDuration;

        // Center viewport on clicked position
        const viewportDuration = viewportEnd - viewportStart;
        const newStart = Math.max(0, clickedTime - viewportDuration / 2);
        onNavigate(newStart);
    };

    const handleDrag = (e: React.MouseEvent) => {
        if (e.buttons !== 1) return; // Only on left mouse drag
        handleClick(e);
    };

    const viewportWidth = ((viewportEnd - viewportStart) / totalDuration) * 100;
    const viewportLeft = (viewportStart / totalDuration) * 100;

    return (
        <div className="w-full bg-[#0a0a0a] border-t border-[#333] p-2">
            <div
                ref={minimapRef}
                className="relative w-full bg-[#1a1a1a] rounded cursor-pointer"
                style={{ height: `${MINIMAP_HEIGHT}px` }}
                onClick={handleClick}
                onMouseMove={handleDrag}
            >
                {/* Render all clips as condensed blocks */}
                {timeline.tracks.map((track, trackIdx) => (
                    <div
                        key={track.id}
                        className="absolute w-full"
                        style={{
                            top: `${(trackIdx / timeline.tracks.length) * MINIMAP_HEIGHT}px`,
                            height: `${MINIMAP_HEIGHT / timeline.tracks.length}px`
                        }}
                    >
                        {track.clips.map(clip => {
                            const left = (clip.start / totalDuration) * 100;
                            const width = ((clip.end - clip.start) / totalDuration) * 100;
                            const clipColor = track.type === 'video' ? '#4a8faa' : '#64a064';

                            return (
                                <div
                                    key={clip.id}
                                    className="absolute rounded-sm opacity-70"
                                    style={{
                                        left: `${left}%`,
                                        width: `${width}%`,
                                        height: '80%',
                                        top: '10%',
                                        backgroundColor: clipColor
                                    }}
                                />
                            );
                        })}
                    </div>
                ))}

                {/* Viewport indicator */}
                <div
                    className="absolute top-0 bottom-0 border-2 border-cyan-400 bg-cyan-400/10 pointer-events-none"
                    style={{
                        left: `${viewportLeft}%`,
                        width: `${viewportWidth}%`
                    }}
                >
                    <div className="absolute top-0 left-0 w-1 h-full bg-cyan-400" />
                    <div className="absolute top-0 right-0 w-1 h-full bg-cyan-400" />
                </div>
            </div>
        </div>
    );
};
