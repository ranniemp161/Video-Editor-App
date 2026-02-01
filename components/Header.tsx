import React from 'react';
import { MenuIcon } from './icons';

interface HeaderProps {
  onImportClick: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onExport: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onImportClick, onExport }) => {
  return (
    <header className="h-10 bg-[#0f0f0f] border-b border-[#2d2d2d] flex items-center justify-between px-4 z-50">
      <div className="flex items-center gap-4">
        <button className="text-gray-400 hover:text-white transition-colors">
          <MenuIcon className="w-5 h-5" />
        </button>
        <div className="h-4 w-[1px] bg-[#333]"></div>
        <span className="text-xs text-gray-500 font-medium tracking-wide">Menu</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-white uppercase tracking-wider">0130</span>
        <div className="bg-[#2d2d2d] px-1 text-[8px] text-gray-500 rounded">0130</div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onExport}
            className="text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 text-[11px] font-bold transition-all rounded shadow-lg flex items-center gap-1.5 animate-pulse hover:animate-none"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            RENDER MP4
          </button>
          <div className="h-4 w-[1px] bg-[#333] mx-1"></div>
          <label className="cursor-pointer bg-[#26c6da] hover:bg-[#4dd0e1] text-[#0f0f0f] px-4 py-1.5 rounded text-[11px] font-bold transition-transform active:scale-95 flex items-center gap-1">
            Import XML
            <input type="file" className="hidden" accept=".xml" onChange={onImportClick} />
          </label>
        </div>
      </div>
    </header>
  );
};
