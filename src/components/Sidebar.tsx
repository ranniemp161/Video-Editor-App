import React from 'react';
import { MediaIcon, AudioIcon, TextIcon, EffectsIcon, FilmIcon } from './icons';

interface SidebarProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
    const tabs = [
        { id: 'media', icon: MediaIcon, label: 'Media' },
        { id: 'transcript', icon: TextIcon, label: 'Transcript' },
        { id: 'audio', icon: AudioIcon, label: 'Audio' },
        { id: 'text', icon: FilmIcon, label: 'Text' }, // Swapping icon labels for demo
        { id: 'effects', icon: EffectsIcon, label: 'Effects' },
    ];

    return (
        <div className="w-[72px] bg-[#0f0f0f] flex flex-col items-center py-4 gap-6 border-r border-[#2d2d2d]">
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex flex-col items-center gap-1 group transition-colors ${isActive ? 'text-[#26c6da]' : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <div className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-[#26c6da]/10' : 'group-hover:bg-[#ffffff]/5'
                            }`}>
                            <Icon className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-medium">{tab.label}</span>
                    </button>
                );
            })}
        </div>
    );
};
