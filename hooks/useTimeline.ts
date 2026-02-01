
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { TimelineState, Asset, TimelineClip } from '../types';

export const useTimeline = () => {
  const [timeline, setTimeline] = useState<TimelineState>({
    tracks: [
      { id: 'v1', type: 'video', clips: [] },
      { id: 'v2', type: 'video', clips: [] },
      { id: 'a1', type: 'audio', clips: [] },
    ]
  });

  const [assets, setAssets] = useState<Asset[]>([]);
  const [playheadPosition, setPlayheadPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [isMagnetic, setIsMagnetic] = useState(true);

  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number | null>(null);

  const togglePlayback = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const totalDuration = useMemo(() => {
    let max = 10; // Minimum 10s
    timeline.tracks.forEach(track => {
      track.clips.forEach(clip => {
        if (clip.end > max) max = clip.end;
      });
    });
    return max + 5; // Extra padding
  }, [timeline]);

  // Helper for fuzzy asset matching
  const findMatchingAsset = useCallback((assetId: string, name: string, sourceFileName?: string) => {
    // 1. Direct ID match
    let match = assets.find(a => a.id === assetId);
    if (match) return match;

    const clean = (s: string) => s.toLowerCase().split('.')[0].trim();

    // 2. Source Filename match (Highest priority for XML imports)
    if (sourceFileName) {
      const cleanSource = clean(sourceFileName);
      match = assets.find(a => clean(a.name) === cleanSource);
      if (match) return match;
    }

    // 3. Clean name match (fallback)
    const clipNameClean = clean(name);
    match = assets.find(a => clean(a.name) === clipNameClean);

    return match || null;
  }, [assets]);

  const currentClip = useMemo(() => {
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        if (playheadPosition >= clip.start && playheadPosition < clip.end) {
          const asset = findMatchingAsset(clip.assetId, clip.name, clip.sourceFileName);
          if (asset) return { clip, asset };
        }
      }
    }
    return null;
  }, [timeline, playheadPosition, assets, findMatchingAsset]);

  const addClipToTimeline = useCallback((asset: Asset) => {
    setTimeline(prev => {
      const trackIdx = asset.type === 'video' ? 0 : 2;
      const track = prev.tracks[trackIdx];
      const lastClip = track.clips[track.clips.length - 1];
      const start = lastClip ? lastClip.end : 0;
      const end = start + asset.duration;

      const newClip: TimelineClip = {
        id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        assetId: asset.id,
        trackId: track.id,
        name: asset.name,
        sourceFileName: asset.name,
        start,
        end,
        trimStart: 0,
        trimEnd: asset.duration,
        opacity: 100,
        volume: 100,
      };

      const newTracks = prev.tracks.map((t, idx) =>
        idx === trackIdx ? { ...t, clips: [...t.clips, newClip] } : t
      );

      return { ...prev, tracks: newTracks };
    });
  }, []);

  const addMediaFiles = useCallback((files: FileList) => {
    Array.from(files).forEach(file => {
      const asset: Asset = {
        id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        type: file.type.startsWith('video') ? 'video' : 'audio',
        src: URL.createObjectURL(file),
        duration: 0,
      };

      const dummyVideo = document.createElement('video');
      dummyVideo.src = asset.src;
      dummyVideo.onloadedmetadata = () => {
        asset.duration = dummyVideo.duration;
        setAssets(prev => [...prev, asset]);
      };
    });
  }, []);

  const importXML = useCallback((xmlString: string) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const clipTags = xmlDoc.getElementsByTagName('clipitem');
    const framerate = 24;

    const newClips: TimelineClip[] = [];
    Array.from(clipTags).forEach((tag, idx) => {
      const name = tag.getElementsByTagName('name')[0]?.textContent || 'Imported Clip';
      const startFrames = parseInt(tag.getElementsByTagName('start')[0]?.textContent || '0');
      const endFrames = parseInt(tag.getElementsByTagName('end')[0]?.textContent || '0');
      const sourceInFrames = parseInt(tag.getElementsByTagName('in')[0]?.textContent || '0');
      const sourceOutFrames = parseInt(tag.getElementsByTagName('out')[0]?.textContent || '0');

      const fileElement = tag.getElementsByTagName('file')[0];
      const fileId = fileElement?.getAttribute('id') || `file-${idx}`;

      // Extract source filename from the <file> tag, matching FCP XML structure
      // <file><name>source.mp4</name></file>
      const sourceFileName = fileElement?.getElementsByTagName('name')[0]?.textContent || '';

      newClips.push({
        id: `imported-${idx}-${Date.now()}`,
        assetId: fileId,
        trackId: 'v1',
        name,
        sourceFileName, // Store the actual filename!
        start: startFrames / framerate,
        end: endFrames / framerate,
        trimStart: sourceInFrames / framerate,
        trimEnd: sourceOutFrames / framerate,
        opacity: 100,
        volume: 100,
      });
    });

    setTimeline(prev => ({
      ...prev,
      tracks: prev.tracks.map((t, i) => i === 0 ? { ...t, clips: newClips } : t)
    }));
  }, []);

  const moveClip = useCallback((clipId: string, trackId: string, newStart: number) => {
    setTimeline(prev => {
      const clip = prev.tracks.flatMap(t => t.clips).find(c => c.id === clipId);
      if (!clip) return prev;

      const duration = clip.end - clip.start;
      const updatedTargetClip: TimelineClip = { ...clip, start: newStart, end: newStart + duration, trackId };

      const finalTracks = prev.tracks.map(track => {
        let clips = track.clips.filter(c => c.id !== clipId);
        if (track.id === trackId) clips.push(updatedTargetClip);

        if (isMagnetic) {
          clips.sort((a, b) => a.start - b.start);
          let currentPos = 0;
          clips = clips.map(c => {
            const d = c.end - c.start;
            const updated = { ...c, start: currentPos, end: currentPos + d };
            currentPos += d;
            return updated;
          });
        }
        return { ...track, clips };
      });

      return { ...prev, tracks: finalTracks };
    });
  }, [isMagnetic]);

  const splitClip = useCallback((clipId: string, position: number) => {
    setTimeline(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => {
        const clip = track.clips.find(c => c.id === clipId);
        if (clip && position > clip.start && position < clip.end) {
          const firstHalf = { ...clip, id: `${clip.id}-1`, end: position, trimEnd: clip.trimStart + (position - clip.start) };
          const secondHalf = { ...clip, id: `${clip.id}-2`, start: position, trimStart: clip.trimStart + (position - clip.start) };
          return { ...track, clips: [...track.clips.filter(c => c.id !== clipId), firstHalf, secondHalf] };
        }
        return track;
      })
    }));
  }, []);

  const deleteClip = useCallback((clipId: string) => {
    setTimeline(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => {
        let clips = track.clips.filter(c => c.id !== clipId);
        if (isMagnetic) {
          clips.sort((a, b) => a.start - b.start);
          let currentPos = 0;
          clips = clips.map(c => {
            const d = c.end - c.start;
            const updated = { ...c, start: currentPos, end: currentPos + d };
            currentPos += d;
            return updated;
          });
        }
        return { ...track, clips };
      })
    }));
    if (selectedClipId === clipId) setSelectedClipId(null);
  }, [selectedClipId, isMagnetic]);

  const updateClip = useCallback((clipId: string, updates: Partial<TimelineClip>) => {
    setTimeline(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => {
        let clips = track.clips.map(clip => clip.id === clipId ? { ...clip, ...updates } : clip);
        if (isMagnetic) {
          clips.sort((a, b) => a.start - b.start);
          let currentPos = 0;
          clips = clips.map(c => {
            const d = c.end - c.start;
            const updated = { ...c, start: currentPos, end: currentPos + d };
            currentPos += d;
            return updated;
          });
        }
        return { ...track, clips };
      })
    }));
  }, [isMagnetic]);

  const animatePlayback = useCallback(() => {
    if (!lastUpdateTimeRef.current) return;
    const now = performance.now();
    const delta = (now - lastUpdateTimeRef.current) / 1000;
    lastUpdateTimeRef.current = now;

    setPlayheadPosition(prev => {
      const next = prev + delta;
      return next > totalDuration ? 0 : next;
    });

    animationFrameRef.current = requestAnimationFrame(animatePlayback);
  }, [totalDuration]);

  useEffect(() => {
    if (isPlaying) {
      lastUpdateTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(animatePlayback);
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [isPlaying, animatePlayback]);

  return {
    timeline,
    assets,
    playheadPosition,
    setPlayheadPosition,
    isPlaying,
    togglePlayback,
    currentClip,
    totalDuration,
    addClipToTimeline,
    importXML,
    addMediaFiles,
    moveClip,
    splitClip,
    deleteClip,
    updateClip,
    selectedClipId,
    setSelectedClipId,
    isMagnetic,
    setIsMagnetic,
    findMatchingAsset
  };
};