import fs from 'fs';
import path from 'path';
import { findFile } from './path-utils.js';

export function generateXML(timelineData, outputFile) {
  const FPS = 30; // Default to 30
  const { tracks } = timelineData.timeline;
  const assets = timelineData.assets || [];

  const videoTrack = tracks.find(t => t.type === 'video');
  const videoClips = (videoTrack?.clips || []).sort((a, b) => a.start - b.start);

  if (videoClips.length === 0) {
    throw new Error('No video clips to export.');
  }

  const toFrames = (seconds) => Math.round(seconds * FPS);

  // Calculate total duration using frame-accurate math
  const totalFrames = videoClips.reduce((acc, c) => acc + toFrames(c.end - c.start), 0);

  const header = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence id="RoughCut">
    <name>Rough Cut Sequence</name>
    <duration>${totalFrames}</duration>
    <rate>
      <timebase>${FPS}</timebase>
      <ntsc>FALSE</ntsc>
    </rate>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>1920</width>
            <height>1080</height>
            <rate>
              <timebase>${FPS}</timebase>
            </rate>
          </samplecharacteristics>
        </format>
        <track>`;

  const footer = `        </track>
      </video>
    </media>
  </sequence>
</xmeml>`;

  let currentTimelineFrame = 0;
  const clipsXML = videoClips.map((clip, index) => {
    const asset = assets.find(a => a.id === clip.assetId);
    const fileName = asset?.name || 'unknown';
    const absolutePath = asset ? findFile(asset.src ? asset.src : fileName) : '';
    const pathUrl = absolutePath ? `file://localhost/${absolutePath.replace(/\\/g, '/')}` : '';

    const durationSeconds = clip.end - clip.start;
    const durationFrames = toFrames(durationSeconds);

    // In/Out frames on the source asset
    const inFrame = toFrames(clip.trimStart || 0);
    const outFrame = inFrame + durationFrames;

    // Start/End frames on the timeline
    const startFrameSeq = currentTimelineFrame;
    const endFrameSeq = currentTimelineFrame + durationFrames;

    currentTimelineFrame += durationFrames;

    return `
          <clipitem id="clipitem-${index}">
            <name>${fileName}</name>
            <duration>${toFrames(asset?.duration || 3600)}</duration>
            <rate>
              <timebase>${FPS}</timebase>
            </rate>
            <in>${inFrame}</in>
            <out>${outFrame}</out>
            <start>${startFrameSeq}</start>
            <end>${endFrameSeq}</end>
            <file id="file-${asset?.id || '1'}">
              <name>${fileName}</name>
              <pathurl>${pathUrl}</pathurl>
              <rate>
                <timebase>${FPS}</timebase>
              </rate>
              <duration>${toFrames(asset?.duration || 3600)}</duration>
              <media>
                <video>
                  <samplecharacteristics>
                    <width>1920</width>
                    <height>1080</height>
                  </samplecharacteristics>
                </video>
              </media>
            </file>
          </clipitem>`;
  });

  const fullXML = header + clipsXML.join('') + footer;
  fs.writeFileSync(outputFile, fullXML);
  return outputFile;
}
