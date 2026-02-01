import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * render.js
 * 
 * Takes a timeline JSON and renders it to output.mp4 using FFmpeg.
 * Usage: node render.js <timeline.json> [output.mp4]
 */

const timelineFile = process.argv[2];
const outputFile = process.argv[3] || 'output.mp4';

if (!timelineFile) {
    console.error('Usage: node render.js <timeline.json> [output.mp4]');
    process.exit(1);
}

const timelineData = JSON.parse(fs.readFileSync(timelineFile, 'utf8'));
const { tracks } = timelineData.timeline;

// Assume video files are in the same directory as this script or absolute
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
    return filename; // Fallback to raw filename
}

const videoTrack = tracks.find(t => t.type === 'video');
const videoClips = (videoTrack?.clips || []).sort((a, b) => a.start - b.start);
const assets = timelineData.assets || [];

if (videoClips.length === 0) {
    console.error('No video clips found to render.');
    process.exit(1);
}

// Generate Concat Demuxer Script
let concatScript = '';
videoClips.forEach(clip => {
    const asset = assets.find(a => a.id === clip.assetId) || assets[0];
    const sourceDuration = asset ? asset.duration : Infinity;

    const filePath = path.resolve(findFile(clip.sourceFileName || clip.name));
    // FFmpeg concat demuxer requires escaped paths
    const escapedPath = filePath.replace(/'/g, "'\\''");

    // Trim durations
    const trimStart = clip.trimStart || 0;
    const clipDuration = clip.end - clip.start;

    // Skip if invalid
    if (trimStart >= sourceDuration || clipDuration <= 0) return;

    const outpoint = Math.min(trimStart + clipDuration, sourceDuration);

    // Skip if outpoint is not greater than inpoint
    if (outpoint <= trimStart) return;

    concatScript += `file '${escapedPath}'\n`;
    concatScript += `inpoint ${trimStart}\n`;
    concatScript += `outpoint ${outpoint}\n`;
});

const scriptFile = 'concat_list.txt';
fs.writeFileSync(scriptFile, concatScript);

const command = `ffmpeg -y -f concat -safe 0 -i ${scriptFile} -c:v libx264 -pix_fmt yuv420p -c:a aac "${outputFile}"`;

console.log('Executing FFmpeg concat demuxer command...');

exec(command, (error, stdout, stderr) => {
    // Cleanup script file
    // fs.unlinkSync(scriptFile); 

    if (error) {
        console.error(`Error: ${error.message}`);
        return;
    }
    if (stderr) {
        // console.error(`stderr: ${stderr}`); // FFmpeg prints a lot to stderr
    }
    console.log(`stdout: ${stdout}`);
    console.log(`Successfully rendered: ${outputFile}`);
});
