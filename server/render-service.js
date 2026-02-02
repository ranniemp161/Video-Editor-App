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

        let concatScript = '';
        videoClips.forEach(clip => {
            const asset = assets.find(a => a.id === clip.assetId);
            const fileName = asset?.name || 'unknown';
            const absolutePath = asset ? findFile(asset.src ? asset.src : fileName) : '';

            const filePath = path.resolve(findFile(clip.sourceFileName || clip.name));
            const escapedPath = filePath.replace(/'/g, "'\\''");

            const trimStart = clip.trimStart || 0;
            const clipDuration = clip.end - clip.start;

            concatScript += `file '${escapedPath}'\n`;
            concatScript += `inpoint ${trimStart}\n`;
            concatScript += `outpoint ${trimStart + clipDuration}\n`;
        });

        const scriptFile = path.join('data', 'concat_list_auto.txt');
        fs.writeFileSync(scriptFile, concatScript);

        const args = [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', scriptFile,
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            outputFile
        ];

        console.log('[Render Service] Spawning FFmpeg pool...');
        const ffmpeg = spawn('ffmpeg', args);

        currentProgress = 0;
        isRendering = true;

        ffmpeg.stderr.on('data', (data) => {
            const line = data.toString();
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
