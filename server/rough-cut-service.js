
/**
 * rough-cut-service.js
 * 
 * Logic to analyze transcription words and generate an optimized edit list (timeline clips).
 * Based on Gling-style silence removal and SOP rules.
 */

export function generateSmartCut(words, asset, trackId) {
    if (!words || words.length === 0) return [];

    const keeperSegments = [];

    // SOP Rules
    const MAX_GAP = 0.5; // Merge if gap < 0.5s
    const PADDING = 0.05; // 50ms padding at start/end

    let currentSegment = null;

    words.forEach((word) => {
        // Whisper.cpp provides timestamps in milliseconds
        const start = word.start / 1000;
        const end = word.end / 1000;

        if (!currentSegment) {
            currentSegment = {
                start,
                end,
                text: word.word
            };
        } else {
            const gap = start - currentSegment.end;
            if (gap < MAX_GAP) {
                // Merge
                currentSegment.end = end;
                currentSegment.text += " " + word.word;
            } else {
                // Save current, start new
                keeperSegments.push(currentSegment);
                currentSegment = {
                    start,
                    end,
                    text: word.word
                };
            }
        }
    });

    if (currentSegment) {
        keeperSegments.push(currentSegment);
    }

    // Convert keeper segments to TimelineClips
    let timelinePosition = 0;
    return keeperSegments.map((seg, idx) => {
        const duration = seg.end - seg.start;
        const clip = {
            id: `autocut-${idx}-${Date.now()}`,
            assetId: asset.id,
            trackId: trackId,
            name: asset.name,
            sourceFileName: asset.name,
            start: timelinePosition,
            end: timelinePosition + duration,
            trimStart: Math.max(0, seg.start - PADDING),
            trimEnd: Math.min(asset.duration, seg.end + PADDING)
        };
        timelinePosition += (clip.trimEnd - clip.trimStart);
        return clip;
    });
}
