import React from 'react';
import { MediaIcon, AudioIcon, TextIcon, EffectsIcon, FilmIcon } from './icons';

interface SidebarProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

export const SidebarComponent: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
    const tabs = [
        { id: 'media', icon: MediaIcon, label: 'Media' },
        { id: 'transcript', icon: TextIcon, label: 'Transcript' },
        { id: 'audio', icon: AudioIcon, label: 'Audio' },
        { id: 'text', icon: FilmIcon, label: 'Text' }, // Swapping icon labels for demo
        { id: 'effects', icon: EffectsIcon, label: 'Effects' },
    ];

    return (
        <div className="w-[72px] glass flex flex-col items-center py-6 gap-8 border-r border-white/5 z-50">
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex flex-col items-center gap-1.5 group transition-all duration-300 relative ${isActive ? 'text-[#26c6da]' : 'text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        {isActive && (
                            <div className="absolute -left-4 w-1 h-6 bg-[#26c6da] rounded-r-full shadow-[0_0_10px_rgba(38,198,218,0.5)]" />
                        )}
                        <div className={`p-2.5 rounded-xl transition-all duration-300 ${isActive ? 'bg-[#26c6da]/15 shadow-[0_0_20px_rgba(38,198,218,0.1)]' : 'group-hover:bg-white/5'
                            }`}>
                            <Icon className={`w-6 h-6 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} />
                        </div>
                        <span className={`text-[9px] font-bold uppercase tracking-wider transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}>{tab.label}</span>
                    </button>
                );
            })}
        </div>
    );
};

export const Sidebar = React.memo(SidebarComponent);
