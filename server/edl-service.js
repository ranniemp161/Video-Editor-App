import fs from 'fs';
import path from 'path';
import { findFile } from './path-utils.js';

/**
 * Generate CMX 3600 EDL format for DaVinci Resolve
 * Much simpler and more reliable than XML
 */
export function generateEDL(timelineData, outputFile) {
    const { tracks } = timelineData.timeline;
    const assets = timelineData.assets || [];

    const videoTrack = tracks.find(t => t.type === 'video');
    const videoClips = (videoTrack?.clips || []).sort((a, b) => a.start - b.start);

    if (videoClips.length === 0) {
        throw new Error('No video clips to export.');
    }

    // EDL uses 30fps timebase for calculations
    const FPS = 30;
    const toTimecode = (seconds) => {
        const totalFrames = Math.round(seconds * FPS);
        const hours = Math.floor(totalFrames / (FPS * 3600));
        const minutes = Math.floor((totalFrames % (FPS * 3600)) / (FPS * 60));
        const secs = Math.floor((totalFrames % (FPS * 60)) / FPS);
        const frames = totalFrames % FPS;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
    };

    // EDL Header
    let edl = 'TITLE: Rough Cut Export\n';
    edl += 'FCM: NON-DROP FRAME\n\n';

    let recordIn = 0; // Timeline position in seconds

    videoClips.forEach((clip, index) => {
        const asset = assets.find(a => a.id === clip.assetId);
        if (!asset) return;

        const durationSeconds = clip.end - clip.start;
        if (durationSeconds <= 0) return;

        const fileName = asset.name || asset.originalFileName || 'unknown';
        const absolutePath = findFile(asset.src ? asset.src : fileName);
        const clipName = absolutePath ? path.basename(absolutePath, path.extname(absolutePath)) : fileName;

        // Source in/out points (from original video)
        const sourceIn = clip.trimStart || 0;
        const sourceOut = sourceIn + durationSeconds;

        // Record in/out points (on timeline)
        const recordOut = recordIn + durationSeconds;

        // EDL event format:
        // {event} {reel} {track} {edit_type} {source_in} {source_out} {record_in} {record_out}
        const eventNum = String(index + 1).padStart(3, '0');
        const reelName = clipName.substring(0, 8).toUpperCase(); // Max 8 chars

        edl += `${eventNum}  ${reelName.padEnd(8)} V     C        `;
        edl += `${toTimecode(sourceIn)} ${toTimecode(sourceOut)} `;
        edl += `${toTimecode(recordIn)} ${toTimecode(recordOut)}\n`;

        // Add clip name comment
        edl += `* FROM CLIP NAME: ${clipName}\n`;

        // Add source file path
        if (absolutePath) {
            edl += `* SOURCE FILE: ${absolutePath}\n`;
        }

        edl += '\n';

        recordIn = recordOut;
    });

    fs.writeFileSync(outputFile, edl, 'utf8');
    console.log(`[EDL Export] Generated: ${outputFile}`);
    return outputFile;
}
