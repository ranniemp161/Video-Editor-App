import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { findFile } from './path-utils.js';

/**
 * render-service.js
 * 
 * Logic to render a timeline JSON to MP4 with progress tracking.
 */


let currentProgress = 0;
let isRendering = false;

export function getRenderProgress() {
    return { progress: currentProgress, isRendering };
}

export function renderTimeline(timelineData, outputFile) {
    return new Promise((resolve, reject) => {
        const { tracks } = timelineData.timeline;
        const assets = timelineData.assets || [];

        const videoTrack = tracks.find(t => t.type === 'video');
        const videoClips = (videoTrack?.clips || []).sort((a, b) => a.start - b.start);

        if (videoClips.length === 0) {
            return reject(new Error('No video clips found to render.'));
        }

        // Calculate total duration for progress parsing
        const totalTimelineDuration = videoClips.length > 0 ? videoClips[videoClips.length - 1].end : 0;

        // Group clips by source file for optimization
        const clipsBySource = new Map();
        videoClips.forEach(clip => {
            const asset = assets.find(a => a.id === clip.assetId);
            const fileName = asset?.name || clip.sourceFileName || clip.name;
            const filePath = path.resolve(findFile(fileName));

            if (!clipsBySource.has(filePath)) {
                clipsBySource.set(filePath, []);
            }
            clipsBySource.get(filePath).push(clip);
        });

        // For now, we'll use the simpler approach: single source file
        // If multiple source files, we'd need a more complex filter_complex
        const sourceFiles = Array.from(clipsBySource.keys());

        if (sourceFiles.length === 0) {
            return reject(new Error('No source files found for clips.'));
        }

        // Build filter_complex for single source (most common case)
        const sourceFile = sourceFiles[0];
        let filterComplex = '';
        let concatInputs = '';

        videoClips.forEach((clip, idx) => {
            const trimStart = clip.trimStart || 0;
            const trimEnd = clip.trimEnd || (clip.end - clip.start + trimStart);

            // Video trim filter
            filterComplex += `[0:v]trim=start=${trimStart}:end=${trimEnd},setpts=PTS-STARTPTS[v${idx}];`;
            // Audio trim filter
            filterComplex += `[0:a]atrim=start=${trimStart}:end=${trimEnd},asetpts=PTS-STARTPTS[a${idx}];`;

            // Collect labels for concat
            concatInputs += `[v${idx}][a${idx}]`;
        });

        // Add concat filter
        const numClips = videoClips.length;
        filterComplex += `${concatInputs}concat=n=${numClips}:v=1:a=1[outv][outa]`;

        console.log('[Render Service] Filter Complex:', filterComplex);

        const args = [
            '-y',
            '-i', sourceFile,
            '-filter_complex', filterComplex,
            '-map', '[outv]',
            '-map', '[outa]',
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '20',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            outputFile
        ];

        console.log('[Render Service] Spawning FFmpeg with filter_complex...');
        console.log('[Render Service] Command:', 'ffmpeg', args.join(' '));

        const ffmpeg = spawn('ffmpeg', args);

        currentProgress = 0;
        isRendering = true;

        let stderrBuffer = '';
        ffmpeg.stderr.on('data', (data) => {
            const line = data.toString();
            stderrBuffer += line;

            // Parse progress from FFmpeg output: time=00:00:05.12
            const timeMatch = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
            if (timeMatch && totalTimelineDuration > 0) {
                const hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);
                const seconds = parseFloat(timeMatch[3]);
                const currentTime = hours * 3600 + minutes * 60 + seconds;
                currentProgress = Math.min(Math.round((currentTime / totalTimelineDuration) * 100), 99);
                console.log(`[Render Service] Progress: ${currentProgress}%`);
            }
        });

        ffmpeg.on('close', (code) => {
            isRendering = false;
            if (code === 0) {
                currentProgress = 100;
                console.log(`[Render Service] Render complete: ${outputFile}`);
                resolve(outputFile);
            } else {
                console.error(`[Render Service] FFmpeg exited with code ${code}`);
                console.error(`[Render Service] FFmpeg stderr:`, stderrBuffer);
                reject(new Error(`FFmpeg exited with code ${code}`));
            }
        });

        ffmpeg.on('error', (err) => {
            isRendering = false;
            console.error(`[Render Service] Failed to start FFmpeg: ${err.message}`);
            reject(err);
        });
    });
}
