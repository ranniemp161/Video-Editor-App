import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..'); // Video-Editor-App root

export const searchDirs = [
    // Current Project Priorities
    path.join(projectRoot, 'public'),
    path.join(projectRoot, 'videos'),

    // User's Active Folders
    path.resolve(projectRoot, '..', '..', '..', 'cluade-rannie', 'Videos'),
    path.resolve(projectRoot, '..', '..', '..', 'Video Editing', 'Assets'),
    path.resolve(projectRoot, '..', '..', '..', 'Desktop'),
    path.resolve(projectRoot, '..', '..', '..', 'Downloads'),
    path.resolve(projectRoot, '..', '..', '..', 'Videos'),

    // Google Drive
    'H:\\',
    'H:\\.shortcut-targets-by-id\\1mYQl7irQDT7J6BJKWxGyRIBSmk0aPIbH\\Rannie and Tj\'s Projects\\Exported sections',

    // Other Projects (As fallback only)
    path.resolve(projectRoot, '..', '..', 'claude project rannie', 'my-video'),
    path.resolve(projectRoot, '..', '..', 'claude project rannie', 'my-video', 'public'),
    path.resolve(projectRoot, '..', '..', 'claude project rannie', 'my-video', 'public', 'v2'), // User mentioned this is different
];

export function findFile(filename) {
    if (!filename) return '';

    // Remove leading slash if present
    const cleanName = filename.replace(/^\//, '');

    // Check if it's already an absolute path and exists
    if (path.isAbsolute(filename) && fs.existsSync(filename)) {
        return filename;
    }

    // 1. Exact Match Search
    for (const dir of searchDirs) {
        const fullPath = path.join(dir, cleanName);
        if (fs.existsSync(fullPath)) {
            const msg = `[Path Utils] Found file (exact): ${fullPath}`;
            console.log(msg);
            fs.appendFileSync('data/transcribe_log.txt', `${msg}\n`);
            return fullPath;
        }
    }

    // 2. Smart Fallback: If exact match fails, check for ANY video file in priority folders
    // This handles cases like "main-video.mp4" being missing but "RoughCutComposition (1).mp4" existing.
    console.log(`[Path Utils] Exact match failed for ${filename}. Attempting smart fallback...`);
    const extensions = ['.mp4', '.mov', '.mkv', '.webm'];

    // Check main priority folders first
    const priorityDirs = searchDirs.slice(0, 5);
    for (const dir of priorityDirs) {
        if (!fs.existsSync(dir)) continue;

        try {
            const files = fs.readdirSync(dir);
            const videos = files.filter(f => extensions.includes(path.extname(f).toLowerCase()));

            if (videos.length > 0) {
                // If there's only one video, use it!
                const fallbackFile = path.join(dir, videos[0]);
                const msg = `[Path Utils] SMART FALLBACK: Using ${videos[0]} instead of ${filename}`;
                console.log(msg);
                fs.appendFileSync('data/transcribe_log.txt', `${msg}\n`);
                return fallbackFile;
            }
        } catch (e) {
            // Ignore readdir errors
        }
    }

    const warnMsg = `[Path Utils] File NOT FOUND: ${filename}`;
    console.warn(warnMsg);
    fs.appendFileSync('data/transcribe_log.txt', `${warnMsg}\n`);
    return null;
}
