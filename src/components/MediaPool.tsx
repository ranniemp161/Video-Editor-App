import React, { useRef } from 'react';
import { Asset } from '../types';
import { AddIcon, MediaIcon, EffectsIcon, FilmIcon } from './icons';

interface MediaPoolProps {
  assets: Asset[];
  onAddToTimeline: (asset: Asset) => void;
  onMediaUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const MediaPoolComponent: React.FC<MediaPoolProps> = ({ assets, onAddToTimeline, onMediaUpload }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      <div className="px-4 h-10 border-b border-white/5 flex items-center justify-between glass sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold text-[#fafafa] uppercase tracking-[0.2em] font-display">Project</span>
          <div className="h-3 w-[1px] bg-white/10"></div>
          <span className="text-[10px] font-bold text-[#26c6da] uppercase tracking-[0.2em] font-display">Media</span>
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
            className="w-full aspect-[4/3] bg-white/[0.02] border-2 border-dashed border-white/[0.05] hover:border-[#26c6da]/40 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group mb-6 hover:bg-[#26c6da]/5"
          >
            <div className="w-14 h-14 bg-[#26c6da] rounded-full flex items-center justify-center text-[#0f0f0f] shadow-[0_0_30px_rgba(38,198,218,0.3)] group-hover:scale-110 group-hover:shadow-[0_0_40px_rgba(38,198,218,0.5)] transition-all duration-300 mb-4">
              <AddIcon className="w-8 h-8" />
            </div>
            <span className="text-[14px] font-bold text-white uppercase tracking-wider font-display">Import Media</span>
            <span className="text-[11px] text-gray-500 mt-2 text-center px-6 leading-relaxed opacity-60">Drag and drop your creative assets here to begin your journey</span>
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
                  className="group relative aspect-video bg-white/[0.03] rounded-xl overflow-hidden cursor-pointer border border-white/[0.05] hover:border-[#26c6da]/50 transition-all duration-300 shadow-lg active:scale-[0.98]"
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

      <div className="p-4 glass-light border-t border-white/5 grid grid-cols-3 gap-2">
        {[{ icon: MediaIcon, label: 'AI Assets' }, { icon: EffectsIcon, label: 'FX' }, { icon: FilmIcon, label: 'Record' }].map((item, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-white/[0.03] border border-transparent hover:border-white/10 hover:bg-white/5 cursor-pointer group transition-all duration-300">
            <item.icon className="w-5 h-5 text-gray-500 group-hover:text-[#26c6da] transition-all duration-300 group-hover:scale-110" />
            <span className="text-[8px] font-bold uppercase tracking-widest text-gray-500 group-hover:text-gray-300">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const MediaPool = React.memo(MediaPoolComponent);
