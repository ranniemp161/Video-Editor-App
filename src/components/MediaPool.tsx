import React, { useRef, useState } from 'react';
import { Asset } from '../types';
import { AddIcon, MediaIcon, EffectsIcon, FilmIcon } from './icons';

interface MediaPoolProps {
  assets: Asset[];
  onAddToTimeline: (asset: Asset) => void;
  onMediaUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const AssetThumbnail: React.FC<{ asset: Asset; onAddToTimeline: (a: Asset) => void }> = ({ asset, onAddToTimeline }) => {
  const [thumbError, setThumbError] = useState(false);

  // Prefer the H.264 proxy for thumbnail; fall back to blob src
  const thumbSrc = asset.proxySrc || (!thumbError ? asset.src : null);
  const isTranscoding = asset.isGeneratingProxy || (thumbError && !asset.proxySrc);

  return (
    <div
      onClick={() => onAddToTimeline(asset)}
      className="group relative aspect-video bg-white/[0.03] rounded-xl overflow-hidden cursor-pointer border border-white/[0.05] hover:border-[#26c6da]/50 transition-all duration-300 shadow-lg active:scale-[0.98]"
    >
      {asset.isUploading ? (
        /* Upload in progress */
        <div className="w-full h-full relative">
          {asset.src && <video src={asset.src} className="w-full h-full object-cover opacity-30" />}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-3 bg-black/60 backdrop-blur-[2px]">
            <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mb-2">
              <div
                className="bg-[#26c6da] h-full transition-all duration-300 shadow-[0_0_10px_rgba(38,198,218,0.5)]"
                style={{ width: `${asset.uploadProgress || 0}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-[#fafafa] uppercase tracking-wider animate-pulse">
              Uploading {asset.uploadProgress || 0}%
            </span>
          </div>
        </div>
      ) : isTranscoding ? (
        /* Codec unsupported or proxy still generating — show spinner */
        <div className="w-full h-full flex flex-col items-center justify-center bg-violet-950/20 gap-2">
          <svg style={{ width: 20, height: 20, color: '#a78bfa', animation: 'spin 1.2s linear infinite' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <span className="text-[8px] font-bold text-violet-400 uppercase tracking-widest text-center px-2">Transcoding…</span>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : thumbSrc ? (
        /* Normal thumbnail */
        <div className="w-full h-full relative">
          <video
            src={thumbSrc}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            onError={() => { if (!asset.proxySrc) setThumbError(true); }}
            onLoadedData={(e) => {
              const v = e.currentTarget;
              requestAnimationFrame(() => {
                if (v.videoWidth === 0 && !asset.proxySrc) setThumbError(true);
              });
            }}
          />
          <div className="absolute top-1 right-1 bg-black/60 backdrop-blur-md px-1 rounded text-[9px] text-gray-300 font-mono">
            {Math.floor(asset.duration)}s
          </div>
        </div>
      ) : (
        /* Truly offline */
        <div className="w-full h-full flex items-center justify-center bg-red-900/10">
          <span className="text-[9px] text-red-500 font-bold tracking-tighter uppercase">OFFLINE</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[10px] text-gray-200 font-medium truncate">{asset.name}</p>
      </div>
    </div>
  );
};

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
            accept="video/*,.mkv,.avi,.mov,.wmv,.flv,.webm,.mp4,.m4v,.mpeg,.mpg,.3gp,.ts,.mts,.m2ts,.vob,.ogv,.hevc,.h265,.h264"
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
                <AssetThumbnail key={asset.id} asset={asset} onAddToTimeline={onAddToTimeline} />
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
