
import React, { useRef } from 'react';
import { Asset } from '../types';
import { AddIcon } from './icons';

interface MediaPoolProps {
  assets: Asset[];
  onAddToTimeline: (asset: Asset) => void;
  onMediaUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const MediaPool: React.FC<MediaPoolProps> = ({ assets, onAddToTimeline, onMediaUpload }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
      fileInputRef.current?.click();
  }

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, asset: Asset) => {
    e.dataTransfer.setData('application/json', JSON.stringify(asset));
  };
    
  // Only show assets that are "online" (have a source URL)
  const onlineAssets = assets.filter(asset => asset.src);

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 bg-gray-800 border-b border-gray-700 flex justify-between items-center">
        <h2 className="text-sm font-bold text-gray-300">Media Pool</h2>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={onMediaUpload}
          className="hidden"
          accept="video/*"
          multiple
        />
        <button 
          onClick={handleUploadClick}
          className="bg-gray-600 hover:bg-gray-700 text-white text-xs font-semibold py-1 px-2 rounded-md transition-colors"
        >
            Upload Media
        </button>
      </div>
      <div className="flex-grow p-2 overflow-y-auto grid grid-cols-2 gap-2">
        {onlineAssets.map(asset => (
          <div 
            key={asset.id} 
            className="group relative bg-gray-900 rounded-md overflow-hidden aspect-video cursor-pointer"
            draggable
            onDragStart={(e) => handleDragStart(e, asset)}
          >
            <video src={asset.src!} className="w-full h-full object-cover pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-full p-1 bg-black bg-opacity-50">
              <p className="text-xs text-white truncate">{asset.name}</p>
            </div>
            <button
                onClick={() => onAddToTimeline(asset)}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="Add to timeline"
            >
                <AddIcon className="w-6 h-6" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
