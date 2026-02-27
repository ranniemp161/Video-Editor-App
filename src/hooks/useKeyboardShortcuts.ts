import React from 'react';

interface KeyboardShortcutHandlers {
    togglePlayback: () => void;
    splitClip: (clipId: string, position: number) => void;
    timeline: any;
    playheadPosition: number;
    selectedClipIds: string[];
    deleteClip: () => void;
    selectAllClips: () => void;
    totalDuration: number;
    setPlayheadPosition: (pos: number) => void;
    undo: () => void;
    redo: () => void;
    addMarker: (time: number) => void;
    getPreviousMarker: (time: number) => any;
    getNextMarker: (time: number) => any;
    nudgeClipEdge: (id: string, edge: 'start' | 'end', dir: 'left' | 'right') => void;
    updateClip: (id: string, updates: any) => void;
}

export const useKeyboardShortcuts = (handlers: KeyboardShortcutHandlers) => {
    const {
        togglePlayback,
        timeline,
        playheadPosition,
        splitClip,
        selectedClipIds,
        deleteClip,
        selectAllClips,
        totalDuration,
        setPlayheadPosition,
        undo,
        redo,
        addMarker,
        getNextMarker,
        getPreviousMarker,
        nudgeClipEdge,
        updateClip
    } = handlers;

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if user is typing in an input
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

            switch (e.key.toLowerCase()) {
                case ' ': // Space: Play/Pause
                    e.preventDefault();
                    togglePlayback();
                    break;
                case 's': // S: Split
                    const targetClipS = timeline.tracks.flatMap((t: any) => t.clips).find((c: any) => playheadPosition >= c.start && playheadPosition < c.end);
                    if (targetClipS) splitClip(targetClipS.id, playheadPosition);
                    break;
                case 'q': // Q: Ripple Trim Start to Playhead (Standard Mapping)
                    {
                        const allClips = timeline.tracks.flatMap((t: any) => t.clips);
                        let target = selectedClipIds.length > 0 ? allClips.find((c: any) => c.id === selectedClipIds[0]) : null;
                        if (!target || !(playheadPosition > target.start && playheadPosition < target.end)) {
                            target = allClips.find((c: any) => playheadPosition > c.start && playheadPosition < c.end);
                        }

                        if (target) {
                            const delta = playheadPosition - target.start;
                            updateClip(target.id, {
                                start: playheadPosition,
                                trimStart: target.trimStart + delta
                            });
                        }
                    }
                    break;
                case 'w': // W: Ripple Trim End to Playhead (Standard Mapping)
                    {
                        const allClips = timeline.tracks.flatMap((t: any) => t.clips);
                        let target = selectedClipIds.length > 0 ? allClips.find((c: any) => c.id === selectedClipIds[0]) : null;
                        if (!target || !(playheadPosition > target.start && playheadPosition < target.end)) {
                            target = allClips.find((c: any) => playheadPosition > c.start && playheadPosition < c.end);
                        }

                        if (target) {
                            const delta = target.end - playheadPosition;
                            updateClip(target.id, {
                                end: playheadPosition,
                                trimEnd: target.trimEnd - delta
                            });
                        }
                    }
                    break;
                case 'y': // Ctrl + Y: Redo
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        redo();
                    }
                    break;
                case 'z': // Ctrl + Z (Undo) or Ctrl + Shift + Z (Redo)
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        if (e.shiftKey) {
                            redo();
                        } else {
                            undo();
                        }
                    }
                    break;
                case 'a': // Ctrl + A: Select All
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        selectAllClips();
                    }
                    break;
                case 'delete':
                case 'backspace': // Del/Backspace: Delete
                    deleteClip();
                    break;
                case 'arrowleft': // Left
                    e.preventDefault();
                    if (e.altKey) {
                        // Alt + Left: UNHIDE/REVEAL START edge (Expand Left)
                        if (selectedClipIds.length === 1) nudgeClipEdge(selectedClipIds[0], 'start', 'left');
                    } else if (e.shiftKey) {
                        // Shift + Left: HIDE/SHRINK END edge (Trim Left)
                        if (selectedClipIds.length === 1) nudgeClipEdge(selectedClipIds[0], 'end', 'left');
                    } else if (e.ctrlKey || e.metaKey) {
                        // Ctrl + Left: Jump to previous marker
                        const prevMarker = getPreviousMarker(playheadPosition);
                        if (prevMarker) setPlayheadPosition(prevMarker.time);
                    } else {
                        // Default: step back 1 frame
                        setPlayheadPosition(Math.max(0, playheadPosition - 0.1));
                    }
                    break;
                case 'arrowright': // Right
                    e.preventDefault();
                    if (e.altKey) {
                        // Alt + Right: UNHIDE/REVEAL END edge (Expand Right)
                        if (selectedClipIds.length === 1) nudgeClipEdge(selectedClipIds[0], 'end', 'right');
                    } else if (e.shiftKey) {
                        // Shift + Right: HIDE/SHRINK START edge (Trim Right)
                        if (selectedClipIds.length === 1) nudgeClipEdge(selectedClipIds[0], 'start', 'right');
                    } else if (e.ctrlKey || e.metaKey) {
                        // Ctrl + Right: Jump to next marker
                        const nextMarker = getNextMarker(playheadPosition);
                        if (nextMarker) setPlayheadPosition(nextMarker.time);
                    } else {
                        // Default: step forward 1 frame
                        setPlayheadPosition(Math.min(totalDuration, playheadPosition + 0.1));
                    }
                    break;
                case 'm': // M: Add marker at playhead
                    e.preventDefault();
                    addMarker(playheadPosition);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        togglePlayback,
        timeline,
        playheadPosition,
        splitClip,
        selectedClipIds,
        deleteClip,
        selectAllClips,
        totalDuration,
        setPlayheadPosition,
        undo,
        redo,
        addMarker,
        getNextMarker,
        getPreviousMarker,
        nudgeClipEdge,
        updateClip
    ]);
};
