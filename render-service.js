import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * render-service.js
 * 
 * Logic to render a timeline JSON to MP4.
 */

const searchDirs = [
    '.',
    './videos',
    '../../claude project rannie/my-video',
    '../../claude project rannie/my-video/public',
    '../../claude project rannie/my-video/my-video'
];

function findFile(filename) {
    if (!filename) return '';
    if (fs.existsSync(filename)) return filename;
    for (const dir of searchDirs) {
        const fullPath = path.join(dir, filename);
        if (fs.existsSync(fullPath)) return fullPath;
    }
    return filename;
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

        let concatScript = '';
        videoClips.forEach(clip => {
            const asset = assets.find(a => a.id === clip.assetId) || assets[0];
            const sourceDuration = asset ? asset.duration : Infinity;

            const filePath = path.resolve(findFile(clip.sourceFileName || clip.name));
            const escapedPath = filePath.replace(/'/g, "'\\''");

            const trimStart = clip.trimStart || 0;
            const clipDuration = clip.end - clip.start;

            if (trimStart >= sourceDuration || clipDuration <= 0) return;

            const outpoint = Math.min(trimStart + clipDuration, sourceDuration);
            if (outpoint <= trimStart) return;

            concatScript += `file '${escapedPath}'\n`;
            concatScript += `inpoint ${trimStart}\n`;
            concatScript += `outpoint ${outpoint}\n`;
        });

        const scriptFile = 'concat_list_auto.txt';
        fs.writeFileSync(scriptFile, concatScript);

        const command = `ffmpeg -y -f concat -safe 0 -i ${scriptFile} -c:v libx264 -pix_fmt yuv420p -c:a aac "${outputFile}"`;

        console.log('[Render Service] Executing FFmpeg...');

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`[Render Service] Error: ${error.message}`);
                return reject(error);
            }
            console.log(`[Render Service] Render complete: ${outputFile}`);
            resolve(outputFile);
        });
    });
}
