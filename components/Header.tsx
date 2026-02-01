import React from 'react';
import { MenuIcon } from './icons';

interface HeaderProps {
  onImportClick: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Header: React.FC<HeaderProps> = ({ onImportClick }) => {
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
          <button className="text-gray-400 hover:text-white px-2 py-1 text-[11px] font-medium transition-colors border border-[#333] rounded">
            Pro
          </button>
          <label className="cursor-pointer bg-[#26c6da] hover:bg-[#4dd0e1] text-[#0f0f0f] px-4 py-1.5 rounded text-[11px] font-bold transition-transform active:scale-95 flex items-center gap-1">
            Import XML
            <input type="file" className="hidden" accept=".xml" onChange={onImportClick} />
          </label>
        </div>
      </div>
    </header>
  );
};
