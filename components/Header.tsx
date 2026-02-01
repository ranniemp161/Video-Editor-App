
import React, { useRef } from 'react';
import { FilmIcon } from './icons';

interface HeaderProps {
  onImportClick: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Header: React.FC<HeaderProps> = ({ onImportClick }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <header className="flex-shrink-0 bg-[#2D2D2D] p-2 flex items-center justify-between border-b border-gray-700">
      <div className="flex items-center space-x-2">
        <FilmIcon className="w-6 h-6 text-blue-400" />
        <h1 className="text-lg font-semibold text-gray-200">Web Video Editor</h1>
      </div>
      <div>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={onImportClick}
          className="hidden"
          accept=".xml"
        />
        <button 
          onClick={handleButtonClick}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-1 px-3 rounded-md transition-colors"
        >
          Import FCP7 XML
        </button>
      </div>
    </header>
  );
};
