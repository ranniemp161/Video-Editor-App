import React from 'react';
import { MenuIcon } from './icons';

interface HeaderProps {
  onImportClick: (event: React.ChangeEvent<HTMLInputElement>) => void;
  renderToMP4: () => void;
  renderStatus: 'idle' | 'rendering' | 'success' | 'error';
  renderProgress: number;
  lastRenderPath: string | null;
}

export const Header: React.FC<HeaderProps> = ({ onImportClick, renderToMP4, renderStatus, renderProgress, lastRenderPath }) => {
  const getButtonContent = () => {
    switch (renderStatus) {
      case 'rendering':
        return (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            RENDERING ({renderProgress}%)
          </>
        );
      case 'success':
        return (
          <>
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
            DONE!
          </>
        );
      case 'error':
        return 'RETRY RENDER';
      default:
        return (
          <>
            <svg className="w-3.5 h-3.5 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            RENDER MP4
          </>
        );
    }
  };

  return (
    <header className="h-10 bg-[#0f0f0f] border-b border-[#2d2d2d] flex items-center justify-between px-4 z-50">
      <div className="flex items-center gap-4">
        <button className="text-gray-400 hover:text-white transition-colors">
          <MenuIcon className="w-5 h-5" />
        </button>
        <div className="h-4 w-[1px] bg-[#333]"></div>
        <span className="text-xs text-gray-500 font-medium tracking-wide">
          {renderStatus === 'success' && lastRenderPath ? (
            <span className="text-green-500 animate-pulse">Saved to: {lastRenderPath.split('\\').pop()}</span>
          ) : 'Menu'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-white uppercase tracking-wider">0130</span>
        <div className="bg-[#2d2d2d] px-1 text-[8px] text-gray-500 rounded">0130</div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={renderToMP4}
            disabled={renderStatus === 'rendering'}
            className={`px-3 py-1.5 text-[11px] font-bold transition-all rounded shadow-lg flex items-center gap-0.5
              ${renderStatus === 'rendering' ? 'bg-gray-700 cursor-wait' :
                renderStatus === 'success' ? 'bg-green-600 hover:bg-green-700' :
                  renderStatus === 'error' ? 'bg-red-800' : 'bg-red-600 hover:bg-red-700 animate-pulse hover:animate-none'} 
              text-white`}
          >
            {getButtonContent()}
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
