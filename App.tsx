
import React from 'react';
import { MediaPool } from './components/MediaPool';
import { Preview } from './components/Preview';
import { Timeline } from './components/Timeline';
import { PlaybackControls } from './components/PlaybackControls';
import { Header } from './components/Header';
import { useTimeline } from './hooks/useTimeline';

const App: React.FC = () => {
  const {
    timeline,
    assets,
    playheadPosition,
    isPlaying,
    currentClip,
    totalDuration,
    setPlayheadPosition,
    togglePlayback,
    addClipToTimeline,
    importXML,
    addMediaFiles
  } = useTimeline();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const xmlString = e.target?.result as string;
        importXML(xmlString);
      };
      reader.readAsText(file);
    }
    // Reset file input to allow re-selection of the same file
    event.target.value = '';
  };

  const handleMediaUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      addMediaFiles(files);
    }
     event.target.value = '';
  };


  return (
    <div className="h-screen w-screen bg-[#1A1A1A] flex flex-col font-sans">
      <Header onImportClick={handleFileChange} />
      <main className="flex-grow grid grid-cols-3 grid-rows-2 gap-2 p-2">
        <div className="col-span-1 row-span-1 bg-[#2D2D2D] rounded-md overflow-hidden">
          <MediaPool assets={assets} onAddToTimeline={addClipToTimeline} onMediaUpload={handleMediaUpload} />
        </div>
        <div className="col-span-2 row-span-1 bg-[#2D2D2D] rounded-md overflow-hidden flex flex-col">
          <Preview clip={currentClip} playheadPosition={playheadPosition} isPlaying={isPlaying} />
          <PlaybackControls 
            isPlaying={isPlaying} 
            togglePlayback={togglePlayback} 
            playheadPosition={playheadPosition} 
            totalDuration={totalDuration}
            onSeek={setPlayheadPosition}
          />
        </div>
        <div className="col-span-3 row-span-1 bg-[#2D2D2D] rounded-md overflow-y-auto">
          <Timeline 
            timeline={timeline}
            assets={assets}
            playheadPosition={playheadPosition}
            onPlayheadUpdate={setPlayheadPosition}
            totalDuration={totalDuration}
          />
        </div>
      </main>
    </div>
  );
};

export default App;
