
import React, { memo } from 'react';
import { Asset, TimelineClip } from '../types';

interface InspectorProps {
    selectedAsset: Asset | null;
    selectedClip: TimelineClip | null;
    onUpdateClip: (clipId: string, updates: Partial<TimelineClip>) => void;
}

const InspectorComponent: React.FC<InspectorProps> = ({ selectedAsset, selectedClip, onUpdateClip }) => {
    return (
        <div className="w-full h-full bg-[#1a1a1a] flex flex-col text-gray-300">
            <div className="px-4 py-3 border-b border-[#2d2d2d] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Inspector</h2>
            </div>

            <div className="flex-grow overflow-y-auto p-4 space-y-6">
                {selectedClip ? (
                    <>
                        <div className="space-y-4">
                            <h3 className="text-[10px] text-gray-500 uppercase tracking-wider font-bold border-b border-[#2d2d2d] pb-1">Video</h3>
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[11px]">
                                        <label className="text-gray-400">Opacity</label>
                                        <span className="text-[#26c6da]">{selectedClip.opacity ?? 100}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={selectedClip.opacity ?? 100}
                                        onChange={(e) => onUpdateClip(selectedClip.id, { opacity: parseInt(e.target.value) })}
                                        className="w-full h-1 bg-[#2d2d2d] rounded-lg appearance-none cursor-pointer accent-[#26c6da]"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-[10px] text-gray-500 uppercase tracking-wider font-bold border-b border-[#2d2d2d] pb-1">Audio</h3>
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[11px]">
                                        <label className="text-gray-400">Volume</label>
                                        <span className="text-[#26c6da]">{selectedClip.volume ?? 100}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={selectedClip.volume ?? 100}
                                        onChange={(e) => onUpdateClip(selectedClip.id, { volume: parseInt(e.target.value) })}
                                        className="w-full h-1 bg-[#2d2d2d] rounded-lg appearance-none cursor-pointer accent-[#26c6da]"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-[10px] text-gray-500 uppercase tracking-wider font-bold border-b border-[#2d2d2d] pb-1">Asset Info</h3>
                            <div className="space-y-2">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-500 uppercase">Name</label>
                                    <div className="text-xs text-white truncate bg-[#0f0f0f] p-2 rounded border border-[#2d2d2d]">{selectedAsset?.name}</div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-gray-500 uppercase">Start</label>
                                        <div className="text-xs text-white bg-[#0f0f0f] p-2 rounded border border-[#2d2d2d]">{selectedClip.start.toFixed(2)}s</div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-gray-500 uppercase">End</label>
                                        <div className="text-xs text-white bg-[#0f0f0f] p-2 rounded border border-[#2d2d2d]">{selectedClip.end.toFixed(2)}s</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : selectedAsset ? (
                    <div className="space-y-4">
                        <h3 className="text-[10px] text-gray-500 uppercase tracking-wider font-bold border-b border-[#2d2d2d] pb-1">Asset Preview</h3>
                        <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 uppercase">Name</label>
                            <div className="text-sm text-white truncate">{selectedAsset.name}</div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 uppercase">Duration</label>
                            <div className="text-sm text-white">{selectedAsset.duration.toFixed(2)}s</div>
                        </div>
                        <p className="text-[10px] text-gray-500 italic pt-4">Add this asset to the timeline to unlock more controls.</p>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4 space-y-2 opacity-30">
                        <div className="text-xs text-gray-500 italic">Select a clip on the timeline to inspect properties</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export const Inspector = memo(InspectorComponent);
