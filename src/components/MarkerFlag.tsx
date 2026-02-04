import React, { useState } from 'react';
import { TimelineMarker } from '../types';
import { formatTime } from '../utils/time';

interface MarkerFlagProps {
    marker: TimelineMarker;
    pixelsPerSecond: number;
    onClick: (time: number) => void;
    onRemove: (id: string) => void;
    onUpdate: (id: string, updates: Partial<TimelineMarker>) => void;
}

const colorClasses = {
    blue: {
        bg: 'bg-blue-500',
        hover: 'hover:bg-blue-400',
        border: 'border-blue-400',
        text: 'text-blue-500',
    },
    red: {
        bg: 'bg-red-500',
        hover: 'hover:bg-red-400',
        border: 'border-red-400',
        text: 'text-red-500',
    },
    green: {
        bg: 'bg-green-500',
        hover: 'hover:bg-green-400',
        border: 'border-green-400',
        text: 'text-green-500',
    },
    yellow: {
        bg: 'bg-yellow-500',
        hover: 'hover:bg-yellow-400',
        border: 'border-yellow-400',
        text: 'text-yellow-500',
    },
};

export const MarkerFlag: React.FC<MarkerFlagProps> = ({
    marker,
    pixelsPerSecond,
    onClick,
    onRemove,
    onUpdate
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editLabel, setEditLabel] = useState(marker.label || '');

    const colors = colorClasses[marker.color];
    const position = marker.time * pixelsPerSecond;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onClick(marker.time);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowMenu(true);
    };

    const handleRemove = () => {
        onRemove(marker.id);
        setShowMenu(false);
    };

    const handleColorChange = (color: TimelineMarker['color']) => {
        onUpdate(marker.id, { color });
        setShowMenu(false);
    };

    const handleLabelSave = () => {
        onUpdate(marker.id, { label: editLabel.trim() || undefined });
        setIsEditing(false);
        setShowMenu(false);
    };

    const handleLabelKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleLabelSave();
        } else if (e.key === 'Escape') {
            setEditLabel(marker.label || '');
            setIsEditing(false);
        }
    };

    return (
        <>
            <div
                className="absolute top-0 bottom-0 pointer-events-none z-30"
                style={{ left: `${position}px` }}
            >
                {/* Vertical Line */}
                <div className={`w-[2px] h-full ${colors.bg} opacity-60 pointer-events-none`} />

                {/* Flag at top */}
                <div
                    className={`absolute -top-1 left-0 w-5 h-4 ${colors.bg} ${colors.hover} cursor-pointer pointer-events-auto transition-all hover:scale-110 shadow-lg`}
                    style={{
                        clipPath: 'polygon(0 0, 100% 0, 100% 100%, 20% 50%)',
                    }}
                    onClick={handleClick}
                    onContextMenu={handleContextMenu}
                    onMouseEnter={() => setShowTooltip(true)}
                    onMouseLeave={() => setShowTooltip(false)}
                />

                {/* Tooltip */}
                {showTooltip && !showMenu && (
                    <div className="absolute -top-10 left-6 bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none z-50 shadow-lg">
                        <div className="font-mono">{formatTime(marker.time)}</div>
                        {marker.label && <div className="text-gray-300">{marker.label}</div>}
                    </div>
                )}
            </div>

            {/* Context Menu */}
            {showMenu && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowMenu(false)}
                    />
                    <div
                        className="absolute bg-[#2a2a2a] border border-[#444] rounded-md shadow-2xl z-50 min-w-[180px]"
                        style={{
                            left: `${position + 25}px`,
                            top: '20px',
                        }}
                    >
                        {/* Edit Label */}
                        <div className="border-b border-[#444] p-2">
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={editLabel}
                                    onChange={(e) => setEditLabel(e.target.value)}
                                    onKeyDown={handleLabelKeyDown}
                                    onBlur={handleLabelSave}
                                    placeholder="Label (optional)"
                                    className="w-full bg-[#1a1a1a] text-white text-xs px-2 py-1 rounded border border-[#555] focus:border-cyan-500 focus:outline-none"
                                    autoFocus
                                />
                            ) : (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="w-full text-left text-xs text-gray-300 hover:text-white px-2 py-1 rounded hover:bg-white/10"
                                >
                                    {marker.label || 'Add label...'}
                                </button>
                            )}
                        </div>

                        {/* Color Options */}
                        <div className="p-2 border-b border-[#444]">
                            <div className="text-[10px] text-gray-500 uppercase mb-1.5 px-2">Color</div>
                            <div className="flex gap-2 px-2">
                                {(['blue', 'red', 'green', 'yellow'] as const).map(color => (
                                    <button
                                        key={color}
                                        onClick={() => handleColorChange(color)}
                                        className={`w-6 h-6 rounded ${colorClasses[color].bg} ${colorClasses[color].hover} transition-transform hover:scale-110 ${marker.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-[#2a2a2a]' : ''
                                            }`}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Delete */}
                        <button
                            onClick={handleRemove}
                            className="w-full text-left text-xs text-red-400 hover:text-red-300 px-4 py-2 hover:bg-white/10"
                        >
                            Delete Marker
                        </button>
                    </div>
                </>
            )}
        </>
    );
};
