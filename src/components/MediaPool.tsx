import React, { useRef } from 'react';
import { Asset } from '../types';
import { AddIcon, MediaIcon, EffectsIcon, FilmIcon } from './icons';

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

  return (
    <div className="h-full flex flex-col bg-[#1a1a1a]">
      <div className="px-4 py-2 border-b border-[#2d2d2d] flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold text-white">Import</span>
          <div className="h-3 w-[1px] bg-[#333]"></div>
          <span className="text-xs font-semibold text-[#26c6da]">Media</span>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto">
        <div className="p-4">
          {/* CapCut-style Import Button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={onMediaUpload}
            className="hidden"
            accept="video/*"
            multiple
          />
          <div
            onClick={handleUploadClick}
            className="w-full aspect-[4/3] bg-[#0f0f0f] border-2 border-dashed border-[#2d2d2d] hover:border-[#26c6da]/40 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all group mb-6 hover:bg-[#26c6da]/5"
          >
            <div className="w-12 h-12 bg-[#26c6da] rounded-full flex items-center justify-center text-[#0f0f0f] shadow-lg shadow-[#26c6da]/20 group-hover:scale-110 transition-transform mb-4">
              <AddIcon className="w-7 h-7" />
            </div>
            <span className="text-[14px] font-bold text-white uppercase tracking-tight">Import</span>
            <span className="text-[11px] text-gray-500 mt-2 text-center px-4 leading-tight">Drag and drop videos, photos, and audio files here</span>
          </div>

          {/* Assets List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Project Media</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => onAddToTimeline(asset)}
                  className="group relative aspect-video bg-[#0f0f0f] rounded-lg overflow-hidden cursor-pointer border border-[#2d2d2d] hover:border-[#26c6da] transition-all shadow-sm active:scale-[0.98]"
                >
                  {asset.src ? (
                    <div className="w-full h-full relative">
                      <video
                        src={asset.src}
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                      />
                      <div className="absolute top-1 right-1 bg-black/60 backdrop-blur-md px-1 rounded text-[9px] text-gray-300 font-mono">
                        {Math.floor(asset.duration)}s
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-red-900/10">
                      <span className="text-[9px] text-red-500 font-bold tracking-tighter uppercase">OFFLINE</span>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-gray-200 font-medium truncate">{asset.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-[#2d2d2d] grid grid-cols-3 gap-2 bg-[#1a1a1a]">
        {[{ icon: MediaIcon, label: 'AI Media' }, { icon: EffectsIcon, label: 'Effects' }, { icon: FilmIcon, label: 'Record' }].map((item, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 p-2 rounded bg-[#252525] border border-transparent hover:border-[#333] hover:bg-[#2d2d2d] cursor-pointer group transition-all">
            <item.icon className="w-5 h-5 text-gray-400 group-hover:text-[#26c6da] transition-colors" />
            <span className="text-[9px] font-medium text-gray-400 group-hover:text-gray-200">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
