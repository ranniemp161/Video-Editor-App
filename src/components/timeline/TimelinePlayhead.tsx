import React, { memo } from 'react';

interface PlayheadProps {
    position: number;
    pixelsPerSecond: number;
}

export const TimelinePlayhead = memo(({ position, pixelsPerSecond }: PlayheadProps) => {
    return (
        <div
            className="absolute top-0 bottom-0 w-[2px] bg-[#26c6da] z-40 pointer-events-none will-change-transform"
            style={{
                transform: `translateX(${position * pixelsPerSecond}px)`,
                boxShadow: '0 0 15px rgba(38, 198, 218, 0.8)'
            }}
        >
            <div className="absolute -top-[1px] left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-[#26c6da] rounded-sm transform scale-x-[0.3] scale-y-[1.5] shadow-[0_0_10px_rgba(38,198,218,0.5)]"></div>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#26c6da] rounded-full opacity-20 blur-sm scale-150"></div>
        </div>
    );
});

TimelinePlayhead.displayName = 'TimelinePlayhead';
