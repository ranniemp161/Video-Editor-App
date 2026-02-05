import fs from 'fs';
import path from 'path';
import { findFile, getMediaMetadata } from './path-utils.js';

function escapeXML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[<>&"']/g, (m) => {
    switch (m) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return m;
    }
  });
}

export function generateXML(timelineData, outputFile) {
  const { tracks } = timelineData.timeline;
  const assets = timelineData.assets || [];

  const videoTrack = tracks.find(t => t.type === 'video');
  const videoClips = (videoTrack?.clips || []).sort((a, b) => a.start - b.start);

  if (videoClips.length === 0) {
    throw new Error('No video clips to export.');
  }

  // Detect metadata from the first asset if possible
  const firstAsset = assets.find(a => a.id === videoClips[0].assetId);
  const firstAbsPath = firstAsset ? findFile(firstAsset.src ? firstAsset.src : firstAsset.name) : '';
  const meta = getMediaMetadata(firstAbsPath) || { fps: 30, width: 1920, height: 1080 };

  const isNTSC_first = Math.abs(meta.fps - 23.976) < 0.01 ||
    Math.abs(meta.fps - 29.97) < 0.01 ||
    Math.abs(meta.fps - 59.94) < 0.01;
  const NTSC = isNTSC_first ? 'TRUE' : 'FALSE';
  const FPS = meta.fps;
  // Force sequence to 1920x1080 to avoid Resolve display issues with non-standard resolutions
  const WIDTH = 1920;
  const HEIGHT = 1080;
  const TIMEBASE = Math.round(FPS);

  const toFrames = (seconds) => Math.round(seconds * FPS);

  // Total duration of the sequence
  const totalFrames = videoClips.reduce((acc, c) => {
    const dur = c.end - c.start;
    return dur > 0 ? acc + toFrames(dur) : acc;
  }, 0);

  console.log(`[XML Export] Using FPS: ${FPS}, Timebase: ${TIMEBASE}, Resolution: ${WIDTH}x${HEIGHT}, NTSC: ${NTSC}`);
  console.log(`[XML Export] Sequence total duration (est): ${totalFrames} frames`);

  // Pre-collect unique assets and their metadata
  const uniqueAssets = [];
  const assetMap = new Map();

  videoClips.forEach(clip => {
    if (!assetMap.has(clip.assetId)) {
      const asset = assets.find(a => a.id === clip.assetId);
      if (asset) {
        const originalFileName = asset.name || asset.originalFileName || 'unknown';
        const absolutePath = findFile(asset.src ? asset.src : originalFileName);
        const meta = getMediaMetadata(absolutePath) || { fps: 30, width: 1920, height: 1080 };

        // Robust NTSC detection
        const isNTSC = Math.abs(meta.fps - 23.976) < 0.01 ||
          Math.abs(meta.fps - 29.97) < 0.01 ||
          Math.abs(meta.fps - 59.94) < 0.01;

        const assetInfo = {
          ...asset,
          absolutePath,
          meta,
          fileName: absolutePath ? path.basename(absolutePath) : originalFileName,
          ntsc: isNTSC ? 'TRUE' : 'FALSE',
          timebase: Math.round(meta.fps)
        };
        assetMap.set(clip.assetId, assetInfo);
        uniqueAssets.push(assetInfo);
      }
    }
  });

  // FCP XML v5 - Industry Standard for Resolve
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<xmeml version="5">
  <project>
    <name>Gling Export</name>
    <children>\n`;

  // 1. Define files in the "Bin" (children) first for better Resolve linking
  uniqueAssets.forEach(asset => {
    const escapedFileName = escapeXML(asset.fileName);
    // Priority: 1. asset.src (which should be the server path), 2. original fileName
    const absolutePath = findFile(asset.src) || findFile(asset.fileName);
    asset.absolutePath = absolutePath;

    let pathUrl = '';
    if (asset.absolutePath) {
      // Standard file:/// prefix with three slashes for Windows
      const normalizedPath = asset.absolutePath.replace(/\\/g, '/');
      pathUrl = `file:///${normalizedPath}`;
    }
    const escapedPathUrl = escapeXML(pathUrl);

    xml += `      <file id="file-${asset.id}">
        <name>${escapedFileName}</name>
        <pathurl>${escapedPathUrl}</pathurl>
        <rate>
          <timebase>${asset.timebase}</timebase>
          <ntsc>${asset.ntsc}</ntsc>
        </rate>
        <duration>${toFrames(asset.duration || 3600)}</duration>
        <timecode>
          <rate>
            <timebase>${asset.timebase}</timebase>
            <ntsc>${asset.ntsc}</ntsc>
          </rate>
          <string>00:00:00:00</string>
          <frame>0</frame>
          <displayformat>NDF</displayformat>
        </timecode>
        <media>
          <video>
            <samplecharacteristics>
              <width>${asset.meta.width}</width>
              <height>${asset.meta.height}</height>
              <pixelaspectratio>square</pixelaspectratio>
              <fielddominance>none</fielddominance>
            </samplecharacteristics>
          </video>
          <audio>
            <numChannels>2</numChannels>
            <samplecharacteristics>
              <depth>16</depth>
              <samplerate>48000</samplerate>
            </samplecharacteristics>
          </audio>
        </media>
        <logginginfo>
          <scene></scene>
          <shottake></shottake>
          <lognote></lognote>
        </logginginfo>
      </file>\n`;
  });

  // 2. Define the Sequence
  xml += `      <sequence id="RoughCutSequence">
        <name>Rough Cut Sequence</name>
        <duration>${totalFrames}</duration>
        <rate>
          <timebase>${TIMEBASE}</timebase>
          <ntsc>${NTSC}</ntsc>
        </rate>
        <timecode>
          <rate>
            <timebase>${TIMEBASE}</timebase>
            <ntsc>${NTSC}</ntsc>
          </rate>
          <string>00:00:00:00</string>
          <frame>0</frame>
          <displayformat>NDF</displayformat>
        </timecode>
        <media>
          <video>
            <format>
              <samplecharacteristics>
                <width>${WIDTH}</width>
                <height>${HEIGHT}</height>
                <anamorphic>FALSE</anamorphic>
                <pixelaspectratio>square</pixelaspectratio>
                <fielddominance>none</fielddominance>
                <rate>
                  <timebase>${TIMEBASE}</timebase>
                  <ntsc>${NTSC}</ntsc>
                </rate>
              </samplecharacteristics>
            </format>
            <track>\n`;

  let currentTimelineFrame = 0;
  videoClips.forEach((clip, index) => {
    const asset = assetMap.get(clip.assetId);
    if (!asset) return;

    const durationSeconds = clip.end - clip.start;
    if (durationSeconds <= 0) return;

    const durationFrames = toFrames(durationSeconds);
    const inFrame = toFrames(clip.trimStart || 0);
    const outFrame = inFrame + durationFrames;
    const startFrameSeq = currentTimelineFrame;
    const endFrameSeq = currentTimelineFrame + durationFrames;

    currentTimelineFrame += durationFrames;
    const escapedFileName = escapeXML(asset.fileName);

    xml += `              <clipitem id="clipitem-v-${index}">
                <masterclipid>file-${asset.id}</masterclipid>
                <name>${escapedFileName}</name>
                <enabled>TRUE</enabled>
                <rate>
                  <timebase>${asset.timebase}</timebase>
                  <ntsc>${asset.ntsc}</ntsc>
                </rate>
                <duration>${durationFrames}</duration>
                <start>${startFrameSeq}</start>
                <end>${endFrameSeq}</end>
                <in>${inFrame}</in>
                <out>${outFrame}</out>
                <alphatype>none</alphatype>
                <sourcetrack>
                  <mediatype>video</mediatype>
                  <trackindex>1</trackindex>
                </sourcetrack>
                <labels>
                  <label2>Iris</label2>
                </labels>
                <comments>
                  <mastercomment1></mastercomment1>
                  <mastercomment2></mastercomment2>
                  <mastercomment3></mastercomment3>
                  <mastercomment4></mastercomment4>
                </comments>
                <link>
                  <linkclipref>clipitem-a-${index}</linkclipref>
                  <mediatype>audio</mediatype>
                  <trackindex>1</trackindex>
                  <clipindex>1</clipindex>
                </link>
                <file ref="file-${asset.id}" />
              </clipitem>\n`;
  });

  xml += `            </track>
          </video>
          <audio>
            <track>\n`;

  // Add matching audio track
  currentTimelineFrame = 0;
  videoClips.forEach((clip, index) => {
    const asset = assetMap.get(clip.assetId);
    if (!asset) return;

    const durationSeconds = clip.end - clip.start;
    if (durationSeconds <= 0) return;

    const durationFrames = toFrames(durationSeconds);
    const inFrame = toFrames(clip.trimStart || 0);
    const outFrame = inFrame + durationFrames;
    const startFrameSeq = currentTimelineFrame;
    const endFrameSeq = currentTimelineFrame + durationFrames;

    currentTimelineFrame += durationFrames;

    const escapedFileName = escapeXML(asset.fileName);

    xml += `              <clipitem id="clipitem-a-${index}">
                <masterclipid>file-${asset.id}</masterclipid>
                <name>${escapedFileName}</name>
                <enabled>TRUE</enabled>
                <rate>
                  <timebase>${asset.timebase}</timebase>
                  <ntsc>${asset.ntsc}</ntsc>
                </rate>
                <duration>${durationFrames}</duration>
                <start>${startFrameSeq}</start>
                <end>${endFrameSeq}</end>
                <in>${inFrame}</in>
                <out>${outFrame}</out>
                <sourcetrack>
                  <mediatype>audio</mediatype>
                  <trackindex>1</trackindex>
                </sourcetrack>
                <labels>
                  <label2>Iris</label2>
                </labels>
                <link>
                  <linkclipref>clipitem-v-${index}</linkclipref>
                  <mediatype>video</mediatype>
                  <trackindex>1</trackindex>
                  <clipindex>1</clipindex>
                </link>
                <file ref="file-${asset.id}" />
              </clipitem>\n`;
  });

  xml += `            </track>
          </audio>
        </media>
      </sequence>
    </children>
  </project>
</xmeml>`;

  fs.writeFileSync(outputFile, xml, 'utf8');
  return outputFile;
}
