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
    const [peaks, setPeaks] = useState<number[]>([]);

    useEffect(() => {
        // Check if we already have cached waveform data
        if (asset.waveformPeaks) {
            setPeaks(asset.waveformPeaks);
            return;
        }

        // Generate waveform peaks from audio
        const generateWaveform = async () => {
            if (!asset.src || asset.type !== 'video') return;

            try {
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                const response = await fetch(asset.src);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                // Extract peaks (downsample to manageable size)
                const targetSamples = 500; // 500 bars max
                const channelData = audioBuffer.getChannelData(0); // Mono or left channel
                const blockSize = Math.floor(channelData.length / targetSamples);
                const newPeaks: number[] = [];

                for (let i = 0; i < targetSamples; i++) {
                    let sum = 0;
                    for (let j = 0; j < blockSize; j++) {
                        sum += Math.abs(channelData[i * blockSize + j] || 0);
                    }
                    newPeaks.push(sum / blockSize);
                }

                // Normalize peaks
                const max = Math.max(...newPeaks);
                const normalized = newPeaks.map(p => p / max);

                setPeaks(normalized);

                // Cache in asset (ideally this would be stored globally)
                asset.waveformPeaks = normalized;
            } catch (error) {
                console.warn('Waveform generation failed:', error);
            }
        };

        generateWaveform();
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
