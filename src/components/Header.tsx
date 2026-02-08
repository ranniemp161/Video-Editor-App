import React from 'react';
import { MenuIcon } from './icons';

// Deployment Support: Use VITE_API_URL for cloud, fallback to /api for local proxy
const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface HeaderProps {
  onImportClick: (event: React.ChangeEvent<HTMLInputElement>) => void;
  renderToMP4: () => void;
  renderStatus: 'idle' | 'rendering' | 'success' | 'error';
  renderProgress: number;
  lastRenderPath: string | null;
  exportToXML: () => void;
  exportToEDL: () => void;
  deleteProject: () => void;
  timelineState?: any; // Pass timeline for training
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onImportClick,
  renderToMP4,
  renderStatus,
  renderProgress,
  lastRenderPath,
  exportToXML,
  exportToEDL,
  deleteProject,
  timelineState,
  onLogout
}) => {
  const [isTraining, setIsTraining] = React.useState(false);

  const handleTrainAI = async () => {
    if (!timelineState) return;
    if (!confirm("This will use your current timeline to train the AI on what you kept vs deleted. Continue?")) return;

    setIsTraining(true);
    try {
      const res = await fetch(`${API_BASE}/train-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'default_project',
          timeline: timelineState
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(`AI Trained! Updated ${data.updated_count} decisions based on your edits.`);
      } else {
        alert('Training failed: ' + data.message);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to send training feedback.');
    } finally {
      setIsTraining(false);
    }
  };

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
    <header className="h-12 glass border-b border-white/5 flex items-center justify-between px-4 z-50 sticky top-0">
      <div className="flex items-center gap-4">
        <button className="text-gray-400 hover:text-white transition-colors">
          <MenuIcon className="w-5 h-5" />
        </button>
        <div className="h-4 w-[1px] bg-[#333]"></div>
        <button
          onClick={onLogout}
          className="px-3 py-1 text-[10px] uppercase tracking-wider font-bold bg-white/[0.05] hover:bg-white/[0.1] text-gray-400 hover:text-white border border-white/[0.05] transition-all rounded-full active:scale-95 flex items-center gap-1.5"
          title="Logout"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          LOGOUT
        </button>
        <div className="h-4 w-[1px] bg-[#333]"></div>
        <span className="text-xs text-gray-500 font-medium tracking-wide flex items-center gap-2">
          {renderStatus === 'success' && lastRenderPath ? (
            <a
              href={lastRenderPath}
              download
              className="text-green-400 hover:text-green-300 transition-colors flex items-center gap-1.5 animate-bounce-short"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              DOWNLOAD FINAL MP4
            </a>
          ) : 'Menu'}
        </span>
      </div>

      <div className="flex items-center gap-1.5 px-3 py-1 bg-white/[0.03] rounded-full border border-white/[0.05]">
        <span className="text-[13px] font-bold text-white uppercase tracking-[0.2em] font-display">0130</span>
        <div className="bg-[#26c6da22] px-1.5 py-0.5 text-[8px] text-[#26c6da] font-bold rounded-sm">4K</div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={renderToMP4}
            disabled={renderStatus === 'rendering'}
            className={`px-4 py-1.5 text-[10px] uppercase tracking-wider font-bold transition-all rounded-full shadow-lg flex items-center gap-1.5
              ${renderStatus === 'rendering' ? 'bg-gray-700 cursor-wait' :
                renderStatus === 'success' ? 'bg-green-600 hover:bg-green-700 shadow-green-500/20' :
                  renderStatus === 'error' ? 'bg-red-800' : 'bg-[#e50914] hover:bg-[#ff0000] shadow-red-500/20'} 
              text-white active:scale-95`}
          >
            {getButtonContent()}
          </button>
          <button
            onClick={handleTrainAI}
            disabled={isTraining || !timelineState}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold bg-white/[0.03] hover:bg-white/[0.08] text-purple-300 border border-purple-500/20 transition-all rounded-full shadow-lg flex items-center gap-1.5 active:scale-95 ${isTraining ? 'opacity-50 cursor-wait' : ''}`}
            title="Train AI with current timeline"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            {isTraining ? 'TRAINING...' : 'TRAIN AI'}
          </button>
          <button
            onClick={exportToXML}
            className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold bg-white/[0.03] hover:bg-white/[0.08] text-gray-300 border border-white/[0.05] transition-all rounded-full shadow-lg flex items-center gap-1.5 active:scale-95"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            XML
          </button>
          <button
            onClick={exportToEDL}
            className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold bg-white/[0.03] hover:bg-white/[0.08] text-gray-300 border border-white/[0.05] transition-all rounded-full shadow-lg flex items-center gap-1.5 active:scale-95"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            EDL
          </button>
          <div className="h-4 w-[1px] bg-white/10 mx-1"></div>
          <label className="cursor-pointer bg-[#26c6da] hover:bg-[#4dd0e1] text-[#0f0f0f] px-4 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-bold transition-all active:scale-95 flex items-center gap-1 shadow-lg shadow-[#26c6da]/20">
            Import
            <input type="file" className="hidden" accept=".xml" onChange={onImportClick} />
          </label>
          <div className="h-4 w-[1px] bg-white/10 mx-1"></div>
          <button
            onClick={deleteProject}
            className="px-3 py-1.5 text-[9px] uppercase tracking-wider font-bold bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 transition-all rounded-full active:scale-95"
            title="Delete current project and all its media files"
          >
            RESET
          </button>
        </div>
      </div>
    </header>
  );
};
