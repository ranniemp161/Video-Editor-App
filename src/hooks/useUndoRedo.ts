/**
 * useUndoRedo - History management for timeline state
 * Provides undo/redo functionality with configurable history size
 */
import { useState, useCallback } from 'react';
import { TimelineState } from '../types';

const MAX_HISTORY = 50;

interface UndoRedoState<T> {
    past: T[];
    future: T[];
}

export const useUndoRedo = (currentState: TimelineState) => {
    const [history, setHistory] = useState<UndoRedoState<TimelineState>>({
        past: [],
        future: []
    });

    const pushToHistory = useCallback((newState: TimelineState) => {
        setHistory(prev => ({
            past: [...prev.past, currentState].slice(-MAX_HISTORY),
            future: []
        }));
        return newState;
    }, [currentState]);

    const undo = useCallback((setTimeline: (state: TimelineState) => void) => {
        if (history.past.length === 0) return;

        const previous = history.past[history.past.length - 1];
        const newPast = history.past.slice(0, -1);

        setHistory({
            past: newPast,
            future: [currentState, ...history.future]
        });
        setTimeline(previous);
    }, [history, currentState]);

    const redo = useCallback((setTimeline: (state: TimelineState) => void) => {
        if (history.future.length === 0) return;

        const next = history.future[0];
        const newFuture = history.future.slice(1);

        setHistory({
            past: [...history.past, currentState],
            future: newFuture
        });
        setTimeline(next);
    }, [history, currentState]);

    const clearHistory = useCallback(() => {
        setHistory({ past: [], future: [] });
    }, []);

    return {
        pushToHistory,
        undo,
        redo,
        clearHistory,
        canUndo: history.past.length > 0,
        canRedo: history.future.length > 0,
        historyLength: history.past.length,
    };
};
