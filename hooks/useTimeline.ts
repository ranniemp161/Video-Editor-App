
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { TimelineState, Asset, TimelineClip } from '../types';

export const useTimeline = () => {
  const [timeline, setTimeline] = useState<TimelineState>({
    tracks: [
      { id: 'v1', type: 'video', clips: [], muted: false, locked: false },
      { id: 'v2', type: 'video', clips: [], muted: false, locked: false },
      { id: 'a1', type: 'audio', clips: [], muted: false, locked: false },
    ]
  });

  const [past, setPast] = useState<TimelineState[]>([]);
  const [future, setFuture] = useState<TimelineState[]>([]);

  const pushToHistory = useCallback((newState: TimelineState) => {
    setPast(prev => [...prev, timeline].slice(-50)); // Keep last 50
    setFuture([]);
    setTimeline(newState);
  }, [timeline]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    setFuture(prev => [timeline, ...prev]);
    setPast(newPast);
    setTimeline(previous);
  }, [past, timeline]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);

    setPast(prev => [...prev, timeline]);
    setFuture(newFuture);
    setTimeline(next);
  }, [future, timeline]);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [playheadPosition, setPlayheadPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [isMagnetic, setIsMagnetic] = useState(true);
  const [renderStatus, setRenderStatus] = useState<'idle' | 'rendering' | 'success' | 'error'>('idle');
  const [renderProgress, setRenderProgress] = useState(0);
  const [lastRenderPath, setLastRenderPath] = useState<string | null>(null);

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

      const next = { ...prev, tracks: newTracks };
      setPast(p => [...p, prev].slice(-50));
      setFuture([]);
      return next;
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

    setTimeline(prev => {
      const next = {
        ...prev,
        tracks: prev.tracks.map((t, i) => i === 0 ? { ...t, clips: newClips } : t)
      };
      setPast(p => [...p, prev].slice(-50));
      setFuture([]);
      return next;
    });
  }, []);

  const renderToMP4 = useCallback(async () => {
    setRenderStatus('rendering');
    const data = {
      timeline,
      assets: assets.map(a => ({ id: a.id, name: a.name, duration: a.duration }))
    };

    try {
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (result.success) {
        // Start polling progress
        const pollInterval = setInterval(async () => {
          try {
            const progressRes = await fetch('/api/render-progress');
            const progressData = await progressRes.json();
            setRenderProgress(progressData.progress);

            if (!progressData.isRendering && progressData.progress === 100) {
              clearInterval(pollInterval);
              setRenderStatus('success');
              setLastRenderPath(result.path);
              setTimeout(() => {
                setRenderStatus('idle');
                setRenderProgress(0);
              }, 5000);
            }
          } catch (e) {
            console.error('Progress poll failed:', e);
          }
        }, 1000);
      } else {
        setRenderStatus('error');
      }
    } catch (err) {
      console.error('Render trigger failed:', err);
      setRenderStatus('error');
    }
  }, [timeline, assets]);

  const moveClip = useCallback((clipId: string, trackId: string, newStart: number) => {
    setTimeline(prev => {
      const sourceTrack = prev.tracks.find(t => t.clips.some(c => c.id === clipId));
      const targetTrack = prev.tracks.find(t => t.id === trackId);

      if (!sourceTrack || !targetTrack || sourceTrack.locked || targetTrack.locked) return prev;

      const clip = sourceTrack.clips.find(c => c.id === clipId);

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

      const next = { ...prev, tracks: finalTracks };
      setPast(p => [...p, prev].slice(-50));
      setFuture([]);
      return next;
    });
  }, [isMagnetic]);

  const splitClip = useCallback((clipId: string, position: number) => {
    setTimeline(prev => {
      const next = {
        ...prev,
        tracks: prev.tracks.map(track => {
          if (track.locked) return track;
          const clip = track.clips.find(c => c.id === clipId);
          if (clip && position > clip.start && position < clip.end) {
            const firstHalf = { ...clip, id: `${clip.id}-1`, end: position, trimEnd: clip.trimStart + (position - clip.start) };
            const secondHalf = { ...clip, id: `${clip.id}-2`, start: position, trimStart: clip.trimStart + (position - clip.start) };
            return { ...track, clips: [...track.clips.filter(c => c.id !== clipId), firstHalf, secondHalf] };
          }
          return track;
        })
      };
      if (next !== prev) {
        setPast(p => [...p, prev].slice(-50));
        setFuture([]);
      }
      return next;
    });
  }, []);

  const selectAllClips = useCallback(() => {
    const allIds = timeline.tracks.flatMap(track => track.clips.map(clip => clip.id));
    setSelectedClipIds(allIds);
  }, [timeline]);

  const deleteClip = useCallback((clipId?: string) => {
    const idsToDelete = clipId ? [clipId] : selectedClipIds;
    if (idsToDelete.length === 0) return;

    setTimeline(prev => {
      const next = {
        ...prev,
        tracks: prev.tracks.map(track => {
          if (track.locked) return track;
          let clips = track.clips.filter(c => !idsToDelete.includes(c.id));
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
      };
      setPast(p => [...p, prev].slice(-50));
      setFuture([]);
      return next;
    });
    setSelectedClipIds([]);
  }, [selectedClipIds, isMagnetic]);

  const updateClip = useCallback((clipId: string, updates: Partial<TimelineClip>) => {
    setTimeline(prev => {
      const next = {
        ...prev,
        tracks: prev.tracks.map(track => {
          if (track.locked) return track;
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
      };
      setPast(p => [...p, prev].slice(-50));
      setFuture([]);
      return next;
    });
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

  const toggleTrackMute = useCallback((trackId: string) => {
    setTimeline(prev => {
      const next = {
        ...prev,
        tracks: prev.tracks.map(t => t.id === trackId ? { ...t, muted: !t.muted } : t)
      };
      setPast(p => [...p, prev].slice(-50));
      setFuture([]);
      return next;
    });
  }, []);

  const toggleTrackLock = useCallback((trackId: string) => {
    setTimeline(prev => {
      const next = {
        ...prev,
        tracks: prev.tracks.map(t => t.id === trackId ? { ...t, locked: !t.locked } : t)
      };
      setPast(p => [...p, prev].slice(-50));
      setFuture([]);
      return next;
    });
  }, []);

  useEffect(() => {
    if (isPlaying) {
      lastUpdateTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(animatePlayback);
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [isPlaying, animatePlayback]);

  const onSelectClip = useCallback((clipId: string | null, append = false) => {
    if (clipId === null) {
      setSelectedClipIds([]);
      return;
    }

    setSelectedClipIds(prev => {
      if (append) {
        if (prev.includes(clipId)) {
          return prev.filter(id => id !== clipId);
        }
        return [...prev, clipId];
      }
      return [clipId];
    });
  }, []);

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
    selectedClipIds,
    onSelectClip,
    selectAllClips,
    renderToMP4,
    renderStatus,
    renderProgress,
    lastRenderPath,
    isMagnetic,
    setIsMagnetic,
    findMatchingAsset,
    toggleTrackMute,
    toggleTrackLock,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0
  };
};