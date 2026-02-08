import React, { memo } from 'react';
import { TIMELINE_CONSTANTS } from '../../constants';
import { Asset, TimelineClip } from '../../types';
import { WaveformDisplay } from '../WaveformDisplay';
import { ClipProps } from './types';

export const TimelineClipItem = memo(({
    clip,
    asset,
    pixelsPerSecond,
    isSelected,
    isLocked,
    onSelect,
    onDragStart,
    onDragEnd,
    onTrimStart,
    onTrimEnd,
    onShowTooltip,
    onHideTooltip,
}: ClipProps) => {
    const { TRACK_HEIGHT, TRACK_GAP } = TIMELINE_CONSTANTS;

    const isOffline = !asset || !asset.src;
    const isVideo = asset?.type === 'video';
    const clipBaseColor = isOffline ? '#3d0b0b' : (isVideo ? '#26c6da' : '#64a064');
    const clipDuration = clip.end - clip.start;
    const clipWidthPx = Math.max(2, clipDuration * pixelsPerSecond);
    const showText = clipWidthPx > 40;

    const handleMouseEnter = (e: React.MouseEvent) => {
        if (onShowTooltip) {
            const duration = `Duration: ${clipDuration.toFixed(2)}s`;
            const trimInfo = `Trim: ${clip.trimStart.toFixed(2)}s - ${clip.trimEnd.toFixed(2)}s`;
            onShowTooltip({
                clipId: clip.id,
                x: e.clientX,
                y: e.clientY,
                name: clip.name || 'Unknown Clip',
                duration,
                trimInfo
            });
        }
    };

    return (
        <div
            draggable={!isLocked}
            onDragStart={(e) => !isLocked && onDragStart(e, clip.id)}
            onDragEnd={onDragEnd}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={onHideTooltip}
            onClick={(e) => {
                e.stopPropagation();
                onSelect(clip.id, e.ctrlKey || e.metaKey);
            }}
            className={`absolute rounded-lg overflow-hidden text-white text-[10px] flex flex-col transition-all select-none group border border-white/[0.08] ${isSelected
                ? 'ring-2 ring-white z-20 shadow-[0_10px_30px_rgba(0,0,0,0.5)]'
                : 'shadow-[0_2px_10px_rgba(0,0,0,0.3)]'
                } ${isLocked ? 'opacity-40 grayscale-[0.8] cursor-not-allowed' : 'cursor-move active:scale-[0.98]'}`}
            style={{
                left: `${clip.start * pixelsPerSecond}px`,
                width: `${clipWidthPx}px`,
                height: `${TRACK_HEIGHT}px`,
                top: `${TRACK_GAP / 2}px`,
                background: `linear-gradient(to bottom, ${clipBaseColor}dd, ${clipBaseColor}ff)`,
                boxShadow: isSelected ? '0 0 20px rgba(255,255,255,0.1)' : 'inset 0 1px 1px rgba(255,255,255,0.1)'
            }}
        >
            {asset && isVideo && clipWidthPx > 20 && (
                <WaveformDisplay
                    asset={asset}
                    clipStart={clip.start}
                    clipEnd={clip.end}
                    trimStart={clip.trimStart}
                    trimEnd={clip.trimEnd}
                    width={clipWidthPx}
                    height={TRACK_HEIGHT}
                />
            )}

            {!isLocked && (
                <>
                    <div
                        onMouseDown={(e) => onTrimStart(e, clip)}
                        className={`absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-green-400/60 z-30 transition-all flex items-center justify-center ${isSelected ? 'opacity-100 bg-green-500/30' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                        <div className="w-[2px] h-6 bg-green-300 rounded-full shadow-lg" />
                    </div>
                    <div
                        onMouseDown={(e) => onTrimEnd(e, clip)}
                        className={`absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-red-400/60 z-30 transition-all flex items-center justify-center ${isSelected ? 'opacity-100 bg-red-500/30' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                        <div className="w-[2px] h-6 bg-red-300 rounded-full shadow-lg" />
                    </div>
                </>
            )}

            <div className="relative w-full h-full flex items-center overflow-hidden">
                {showText && (
                    <div className={`px-2 w-full truncate font-medium drop-shadow-md flex items-center gap-1.5 ${isLocked ? 'text-white/60' : 'text-white/95'}`}>
                        {isOffline && <span className="text-red-400 font-bold bg-black/50 px-1 rounded">!</span>}
                        <span>{clip.name || 'Unknown Clip'}</span>
                        <span className="text-[9px] opacity-60 ml-auto font-mono">{clipDuration.toFixed(2)}s</span>
                    </div>
                )}
            </div>

            {isLocked && (
                <div className="absolute top-1 right-1 opacity-40">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                </div>
            )}

            {isOffline && <div className="absolute inset-0 flex items-center justify-center bg-red-900/40 text-[9px] font-bold text-red-100 uppercase tracking-wider backdrop-blur-[1px]">Media Offline</div>}
        </div>
    );
});

TimelineClipItem.displayName = 'TimelineClipItem';
