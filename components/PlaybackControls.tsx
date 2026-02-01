
import React from 'react';
import { PlayIcon, PauseIcon } from './icons';

interface PlaybackControlsProps {
  isPlaying: boolean;
  togglePlayback: () => void;
  playheadPosition: number;
  totalDuration: number;
  onSeek: (position: number) => void;
}

const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({ isPlaying, togglePlayback, playheadPosition, totalDuration, onSeek }) => {
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSeek(parseFloat(e.target.value));
  };
    
  return (
    <div className="flex-shrink-0 bg-gray-800 p-2 flex items-center space-x-4">
      <button onClick={togglePlayback} className="text-white hover:text-blue-400">
        {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
      </button>
      <span className="text-sm text-gray-400 font-mono">{formatTime(playheadPosition)}</span>
      <input
        type="range"
        min="0"
        max={totalDuration}
        step="0.01"
        value={playheadPosition}
        onChange={handleSeek}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
      />
      <span className="text-sm text-gray-400 font-mono">{formatTime(totalDuration)}</span>
    </div>
  );
};
