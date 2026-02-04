import { useState, useCallback, useEffect } from 'react';
import { TimelineMarker } from '../types';

const STORAGE_KEY = 'timeline-markers';

export const useMarkers = () => {
    // Initialize from localStorage
    const [markers, setMarkers] = useState<TimelineMarker[]>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Failed to load markers from localStorage:', error);
            return [];
        }
    });

    // Persist to localStorage whenever markers change
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(markers));
        } catch (error) {
            console.error('Failed to save markers to localStorage:', error);
        }
    }, [markers]);

    // Add a new marker
    const addMarker = useCallback((time: number, color: TimelineMarker['color'] = 'blue', label?: string) => {
        const newMarker: TimelineMarker = {
            id: `marker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            time,
            label,
            color,
            createdAt: Date.now(),
        };
        setMarkers(prev => [...prev, newMarker].sort((a, b) => a.time - b.time));
        return newMarker;
    }, []);

    // Remove a marker by ID
    const removeMarker = useCallback((id: string) => {
        setMarkers(prev => prev.filter(m => m.id !== id));
    }, []);

    // Update a marker
    const updateMarker = useCallback((id: string, updates: Partial<Omit<TimelineMarker, 'id' | 'createdAt'>>) => {
        setMarkers(prev => prev.map(m =>
            m.id === id ? { ...m, ...updates } : m
        ).sort((a, b) => a.time - b.time));
    }, []);

    // Get next marker after given time
    const getNextMarker = useCallback((currentTime: number): TimelineMarker | null => {
        const next = markers.find(m => m.time > currentTime);
        return next || null;
    }, [markers]);

    // Get previous marker before given time
    const getPreviousMarker = useCallback((currentTime: number): TimelineMarker | null => {
        const previous = [...markers].reverse().find(m => m.time < currentTime);
        return previous || null;
    }, [markers]);

    // Clear all markers
    const clearMarkers = useCallback(() => {
        setMarkers([]);
    }, []);

    return {
        markers,
        addMarker,
        removeMarker,
        updateMarker,
        getNextMarker,
        getPreviousMarker,
        clearMarkers,
    };
};
