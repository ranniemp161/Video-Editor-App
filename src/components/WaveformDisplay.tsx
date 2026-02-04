import React, { useEffect, useRef, useState } from 'react';
import { Asset } from '../types';

interface WaveformDisplayProps {
    asset: Asset;
    clipStart: number;
    clipEnd: number;
    trimStart: number;
    trimEnd: number;
    width: number;
    height: number;
    color?: string;
}

// Global cache for waveform peaks to prevent redundant fetches and decoding
const peaksCache = new Map<string, number[]>();
const pendingFetches = new Map<string, Promise<number[]>>();

export const WaveformDisplay: React.FC<WaveformDisplayProps> = ({
    asset,
    clipStart,
    clipEnd,
    trimStart,
    trimEnd,
    width,
    height,
    color = 'rgba(255, 255, 255, 0.3)'
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [peaks, setPeaks] = useState<number[]>(peaksCache.get(asset.id) || []);

    useEffect(() => {
        // 1. Check local state cache
        if (peaks.length > 0) return;

        // 2. Check global cache
        if (peaksCache.has(asset.id)) {
            setPeaks(peaksCache.get(asset.id)!);
            return;
        }

        // 3. Handle concurrent fetches for the same asset
        if (pendingFetches.has(asset.id)) {
            pendingFetches.get(asset.id)!.then(data => {
                setPeaks(data);
            });
            return;
        }

        const generateWaveform = async () => {
            if (!asset.src || asset.type !== 'video') return [];

            try {
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

                // Fetch the file
                const response = await fetch(asset.src);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                const targetSamples = 500;
                const channelData = audioBuffer.getChannelData(0);
                const blockSize = Math.floor(channelData.length / targetSamples);
                const newPeaks: number[] = [];

                for (let i = 0; i < targetSamples; i++) {
                    let sum = 0;
                    for (let j = 0; j < blockSize; j++) {
                        sum += Math.abs(channelData[i * blockSize + j] || 0);
                    }
                    newPeaks.push(sum / blockSize);
                }

                const max = Math.max(...newPeaks);
                const normalized = newPeaks.map(p => p / (max || 1));

                peaksCache.set(asset.id, normalized);
                // Also update the asset object if possible (shallow copy might be an issue)
                asset.waveformPeaks = normalized;

                return normalized;
            } catch (error) {
                console.warn('Waveform generation failed:', error);
                return [];
            }
        };

        const fetchPromise = generateWaveform();
        pendingFetches.set(asset.id, fetchPromise);

        fetchPromise.then(data => {
            setPeaks(data);
            pendingFetches.delete(asset.id);
        });

    }, [asset]);

    useEffect(() => {
        if (!canvasRef.current || peaks.length === 0) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Calculate which portion of the waveform to show based on trim
        const clipDuration = clipEnd - clipStart;
        const trimmedDuration = trimEnd - trimStart;
        const startRatio = trimStart / asset.duration;
        const endRatio = trimEnd / asset.duration;

        const startIdx = Math.floor(startRatio * peaks.length);
        const endIdx = Math.ceil(endRatio * peaks.length);
        const visiblePeaks = peaks.slice(startIdx, endIdx);

        // Draw waveform bars
        const barWidth = width / visiblePeaks.length;
        ctx.fillStyle = color;

        visiblePeaks.forEach((peak, i) => {
            const barHeight = peak * height;
            const x = i * barWidth;
            const y = (height - barHeight) / 2;

            ctx.fillRect(x, y, Math.max(1, barWidth - 0.5), barHeight);
        });
    }, [peaks, width, height, trimStart, trimEnd, asset.duration, clipStart, clipEnd, color]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{ mixBlendMode: 'screen' }}
        />
    );
};
