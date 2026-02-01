
import React, { useRef } from 'react';
import { TimelineState, Asset } from '../types';
import { TIMELINE_CONSTANTS } from '../constants';

interface TimelineProps {
    timeline: TimelineState;
    assets: Asset[];
    playheadPosition: number;
    onPlayheadUpdate: (newPosition: number) => void;
    totalDuration: number;
}

const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    const ms = Math.floor((seconds * 100) % 100);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
};

export const Timeline: React.FC<TimelineProps> = ({ timeline, assets, playheadPosition, onPlayheadUpdate, totalDuration }) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const { PIXELS_PER_SECOND, TRACK_HEIGHT, TRACK_GAP } = TIMELINE_CONSTANTS;
  const timelineWidth = totalDuration * PIXELS_PER_SECOND;

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const newPosition = (e.clientX - rect.left) / PIXELS_PER_SECOND;
    onPlayheadUpdate(Math.max(0, newPosition));
  };
  
  const renderTimeMarkers = () => {
      const markers = [];
      const interval = totalDuration > 30 ? 5 : 1; // 5s interval for longer timelines, 1s for shorter
      for (let i = 0; i <= totalDuration; i += interval) {
          markers.push(
              <div key={i} style={{ left: `${i * PIXELS_PER_SECOND}px` }} className="absolute top-0 h-full text-xs text-gray-500">
                  <div className="h-2 border-l border-gray-600"></div>
                  {formatTime(i)}
              </div>
          )
      }
      return markers;
  }

  const getAssetById = (assetId: string) => assets.find(a => a.id === assetId);

  return (
    <div className="w-full h-full relative overflow-x-auto">
      <div className="sticky top-0 h-8 bg-gray-800 z-10" ref={rulerRef} onClick={handleRulerClick}>
          <div className="relative h-full" style={{width: `${timelineWidth}px`}}>
              {renderTimeMarkers()}
          </div>
      </div>
      <div className="relative" style={{width: `${timelineWidth}px`, height: `${timeline.tracks.length * (TRACK_HEIGHT + TRACK_GAP)}px`}}>
        {timeline.tracks.map((track, index) => (
          <div
            key={track.id}
            className="absolute w-full bg-gray-700"
            style={{
              top: `${index * (TRACK_HEIGHT + TRACK_GAP)}px`,
              height: `${TRACK_HEIGHT}px`,
            }}
          >
            {track.clips.map(clip => {
                const clipDuration = clip.end - clip.start;
                const asset = getAssetById(clip.assetId);
                const isOffline = !asset || !asset.src;

                const clipBgColor = isOffline ? 'bg-red-800 border-red-600' : 'bg-blue-500 border-blue-300';

                return (
                    <div
                        key={clip.id}
                        className={`absolute rounded-sm overflow-hidden text-white text-xs p-1 border-2 ${clipBgColor}`}
                        style={{
                            left: `${clip.start * PIXELS_PER_SECOND}px`,
                            width: `${clipDuration * PIXELS_PER_SECOND}px`,
                            height: `${TRACK_HEIGHT}px`,
                        }}
                    >
                        <p className="font-semibold truncate">{asset?.name || 'Unknown Clip'}</p>
                        {isOffline && <p className="font-bold">Media Offline</p>}
                    </div>
                );
            })}
          </div>
        ))}
        {/* Playhead */}
        <div
          className="absolute top-0 w-0.5 h-full bg-red-500 z-20 pointer-events-none"
          style={{ left: `${playheadPosition * PIXELS_PER_SECOND}px` }}
        >
          <div className="absolute -top-1 -left-1 w-3 h-3 bg-red-500 rounded-full transform -translate-x-1/2"></div>
        </div>
      </div>
    </div>
  );
};
