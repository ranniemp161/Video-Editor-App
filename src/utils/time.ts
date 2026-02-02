
/**
 * Formats time in seconds to a string HH:MM:SS:FF
 * @param seconds Total time in seconds
 * @param fps Frames per second (default 24)
 */
export const formatTime = (seconds: number, fps: number = 24): string => {
    const pad = (num: number) => num.toString().padStart(2, '0');

    const hh = Math.floor(seconds / 3600);
    const mm = Math.floor((seconds % 3600) / 60);
    const ss = Math.floor(seconds % 60);
    const ff = Math.floor((seconds * fps) % fps);

    return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
};
