import React, { memo, RefObject } from 'react';
import { formatTime } from '../../utils/time';
import { RulerData } from './types';

interface TimelineRulerProps {
    rulerRef: RefObject<HTMLDivElement>;
    handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
    handleScrubStart: (e: React.MouseEvent) => void;
    handleContextMenu: (e: React.MouseEvent) => void;
    setIsPanning: (value: boolean) => void;
    lastMouseXRef: RefObject<number>;
    timelineWidth: number;
    pixelsPerSecond: number;
    rulerData: RulerData;
}

export const TimelineRuler = memo(({
    rulerRef,
    handleScroll,
    handleScrubStart,
    handleContextMenu,
    setIsPanning,
    lastMouseXRef,
    timelineWidth,
    pixelsPerSecond,
    rulerData
}: TimelineRulerProps) => (
    <div
        className="flex-grow overflow-hidden relative cursor-pointer select-none border-l border-[#333]"
        ref={rulerRef}
        onScroll={handleScroll}
        onMouseDown={(e) => {
            if (e.button === 2 || e.altKey) {
                e.preventDefault();
                setIsPanning(true);
                if (lastMouseXRef.current !== undefined) {
                    (lastMouseXRef as React.MutableRefObject<number>).current = e.clientX;
                }
                return;
            }
            handleScrubStart(e);
        }}
        onContextMenu={handleContextMenu}
        style={{
            backgroundImage: 'linear-gradient(to bottom, #1a1a1a, #121212)',
        }}
    >
        <div className="h-full relative" style={{ width: `${timelineWidth}px` }}>
            {rulerData.ticks.map((tick, idx) => (
                <div
                    key={idx}
                    style={{ left: `${tick.time * pixelsPerSecond}px` }}
                    className={`absolute bottom-0 border-l ${tick.isMajor
                        ? 'h-[10px] border-white/20'
                        : tick.isMid
                            ? 'h-[6px] border-white/10'
                            : 'h-[4px] border-white/5'
                        }`}
                >
                    {tick.isMajor && (
                        <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[8px] text-white/40 font-mono tracking-wider pointer-events-none select-none">
                            {formatTime(tick.time)}
                        </span>
                    )}
                </div>
            ))}
        </div>
    </div>
));

TimelineRuler.displayName = 'TimelineRuler';
