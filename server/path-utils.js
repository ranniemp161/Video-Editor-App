import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..'); // Video-Editor-App root

// Helper to safely append to log file (ensures directory exists)
const logFilePath = path.join(projectRoot, 'data', 'transcribe_log.txt');
function safeAppendLog(message) {
    try {
        const logDir = path.dirname(logFilePath);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        fs.appendFileSync(logFilePath, `${message}\n`);
    } catch (e) {
        // Silently fail if logging fails - don't break the main functionality
    }
}

export const searchDirs = [
    // Application-managed directories only
    path.join(projectRoot, 'public'),
    path.join(projectRoot, 'public', 'uploads'),
    path.join(projectRoot, 'dist', 'uploads'),
    path.join(projectRoot, 'videos'),
];

export function findFile(filename) {
    if (!filename) return '';

    // Remove leading slash if present
    const cleanName = filename.replace(/^\//, '');

    // Check if it's already an absolute path and exists
    if (path.isAbsolute(filename) && fs.existsSync(filename)) {
        return filename;
    }

    // Skip blob URLs - they can't be resolved to disk paths
    if (filename.startsWith('blob:')) {
        return null;
    }

    // 1. Exact Match Search
    for (const dir of searchDirs) {
        const fullPath = path.join(dir, cleanName);
        if (fs.existsSync(fullPath)) {
            const msg = `[Path Utils] Found file (exact): ${fullPath}`;
            console.log(msg);
            safeAppendLog(msg);
            return fullPath;
        }
    }

    const warnMsg = `[Path Utils] File NOT FOUND: ${filename}`;
    console.warn(warnMsg);
    return null;
}

export function getMediaMetadata(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;

    try {
        const args = ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate', '-of', 'json', filePath];
        const output = execFileSync('ffprobe', args).toString();
        const data = JSON.parse(output);
        const stream = data.streams[0];

        if (stream) {
            let fps = 30;
            if (stream.avg_frame_rate && stream.avg_frame_rate.includes('/')) {
                const [num, den] = stream.avg_frame_rate.split('/').map(Number);
                fps = num / den;
            } else if (stream.avg_frame_rate) {
                fps = Number(stream.avg_frame_rate);
            }

            return {
                width: stream.width,
                height: stream.height,
                fps: Math.round(fps * 1000) / 1000 // Keep precision but round slightly
            };
        }
    } catch (e) {
        console.error(`[Path Utils] Failed to get metadata for ${filePath}:`, e.message);
    }
    return null;
}
