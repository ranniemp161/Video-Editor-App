
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { TimelineState, Asset, TimelineClip } from '../types';

const basename = (path: string) => path.split(/[\\/]/).pop() || '';
const FRAME_DURATION = 0.04; // 25fps default

// Deployment Support: Use provided VITE_API_URL or fallback to /api for proxy
const API_BASE = import.meta.env.VITE_API_URL || '/api';
console.log('[Config] Using API Base:', API_BASE);

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
  const [isTranscribing, setIsTranscribing] = useState<string | null>(null); // Asset ID being transcribed

  // New Backend Integration State
  const [projectId, setProjectId] = useState<string | null>(null);
  const [segments, setSegments] = useState<any[]>([]); // Source of Truth from backend

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

  const addMediaFiles = useCallback(async (files: FileList) => {
    // We only support single file upload for the main project for now in this new flow
    const file = files[0];
    if (!file) return;

    // 1. Local Asset Creation (Optimistic UI)
    const asset: Asset = {
      id: `asset-${Date.now()}`,
      name: file.name,
      type: file.type.startsWith('video') ? 'video' : 'audio',
      src: URL.createObjectURL(file), // Local preview
      duration: 0,
    };

    // Get Duration
    const dummyVideo = document.createElement('video');
    dummyVideo.src = asset.src;
    dummyVideo.onloadedmetadata = async () => {
      asset.duration = dummyVideo.duration;
      setAssets([asset]); // Replace assets for single-project flow

      // 2. Upload to Backend
      const formData = new FormData();
      formData.append('file', file);

      try {
        console.log("Uploading to backend...");
        const res = await fetch(`${API_BASE}/upload`, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data.success) {
          console.log("Upload success, Project ID:", data.projectId, "Server Path:", data.filePath);
          setProjectId(data.projectId);

          // Store remote path without changing the ID (keeps timeline clips linked)
          setAssets(prev => prev.map(a =>
            a.name === file.name ? { ...a, remoteSrc: data.filePath } : a
          ));
        }
      } catch (e) {
        console.error("Upload failed", e);
      }
    };
  }, []);

  const transcribeProject = useCallback(async (pId: string) => {
    setIsTranscribing(pId);
    try {
      const res = await fetch(`${API_BASE}/project/${pId}/transcribe`, { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        setSegments(result.segments);
        // Add source metadata
        const transcriptionWithSource = {
          transcription: result.segments.map((s: any) => s.text).join(' '),
          words: result.segments.map((s: any) => ({
            word: s.text,
            start: s.start * 1000,
            end: s.end * 1000
          })),
          source: 'ai' as const
        };
        const assetId = pId; // Use projectId as matching context
        setAssets(prev => prev.map(a => (a.id === pId || a.id.startsWith('asset-')) ? { ...a, transcription: transcriptionWithSource } : a));

        // Auto-generate timeline from new segments
        generateTimelineFromSegments(result.segments, assets[0]?.id || pId);
      }
    } catch (e) {
      console.error("Transcription failed", e);
    } finally {
      setIsTranscribing(null);
    }
  }, []);

  const generateTimelineFromSegments = useCallback((curSegments: any[], assetId: string = 'video-1') => {
    // Filter out deleted segments
    const activeSegments = curSegments.filter(s => !s.isDeleted);

    const newClips: TimelineClip[] = [];
    let currentTimelinePos = 0;

    activeSegments.forEach((seg, idx) => {
      const duration = seg.end - seg.start;
      // Apply minimal padding? (Logic can go here later)

      newClips.push({
        id: `seg - ${idx} - ${Date.now()}`,
        assetId: assetId,
        trackId: 'v1',
        name: seg.text || 'Clip',
        sourceFileName: 'Project Video',
        start: currentTimelinePos,
        end: currentTimelinePos + duration,
        trimStart: seg.start,
        trimEnd: seg.end,
        opacity: 100,
        volume: 100
      });
      currentTimelinePos += duration;
    });

    setTimeline(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => t.id === 'v1' ? { ...t, clips: newClips } : t)
    }));
  }, []);

  // Update Segments (e.g. toggle delete)
  const toggleSegmentDelete = useCallback(async (start: number) => {
    if (!projectId) return;

    // Optimistic Update
    const newSegments = segments.map(s => {
      if (Math.abs(s.start - start) < 0.01) { // Tiny epsilon match
        return { ...s, isDeleted: !s.isDeleted };
      }
      return s;
    });

    setSegments(newSegments);
    // REMOVED: Auto-regenerate timeline - preserves user's manual timeline edits
    // Users should click "Auto-Cut" if they want to regenerate from segments
    // generateTimelineFromSegments(newSegments);

    // Sync to Backend
    try {
      await fetch(`${API_BASE}/project/${projectId}/segments`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSegments)
      });
    } catch (e) {
      console.error("Failed to sync segments", e);
    }
  }, [projectId, segments]);

  const deleteProject = useCallback(async () => {
    if (!projectId) {
      alert("No project to delete. Upload a video first!");
      return;
    }

    if (!confirm("Are you sure you want to delete this project and all its video files? This cannot be undone.")) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/project/${projectId}`, { method: 'DELETE' });
      if (res.ok) {
        // Reset Frontend State
        setProjectId(null);
        setSegments([]);
        setAssets([]);
        setTimeline({
          tracks: [
            { id: 'v1', type: 'video', clips: [], muted: false, locked: false },
            { id: 'v2', type: 'video', clips: [], muted: false, locked: false },
            { id: 'a1', type: 'audio', clips: [], muted: false, locked: false },
          ]
        });
        setPlayheadPosition(0);
        setSelectedClipIds([]);
        setPast([]);
        setFuture([]);
        localStorage.removeItem('currentProjectId');
        alert("Project deleted successfully!");
        console.log("Project and files deleted successfully.");
      } else {
        alert("Failed to delete project. Please try again.");
      }
    } catch (e) {
      console.error("Failed to delete project", e);
      alert("Error deleting project. Please try again.");
    }
  }, [projectId]);

  // Fetch segments on load if projectId exists
  useEffect(() => {
    // Try to restore from local storage if not in state
    if (!projectId) {
      const stored = localStorage.getItem('currentProjectId');
      if (stored) setProjectId(stored);
      return;
    }

    // Save to local storage
    localStorage.setItem('currentProjectId', projectId);

    const fetchSegments = async () => {
      try {
        const res = await fetch(`${API_BASE}/project/${projectId}`);
        if (!res.ok) {
          // If 404, maybe backend restarted? Clear storage
          if (res.status === 404) {
            console.warn("Project not found on backend (maybe restarted). Clearing session.");
            localStorage.removeItem('currentProjectId');
            setProjectId(null);
          }
          return;
        }
        const data = await res.json();
        if (data.segments) {
          setSegments(data.segments);
          // REMOVED: Auto-timeline generation - user clicks "Auto-Cut" button instead
          // generateTimelineFromSegments(data.segments);
        }
      } catch (e) {
        console.error("Failed to fetch project state", e);
      }
    };
    fetchSegments();
  }, [projectId, generateTimelineFromSegments]);

  const [transcriptionProgress, setTranscriptionProgress] = useState(0);

  const transcribeAsset = useCallback(async (assetId: string, fileName: string) => {
    setIsTranscribing(assetId);
    setTranscriptionProgress(0);

    // Find asset to get duration
    const asset = assets.find(a => a.id === assetId);
    if (!asset) {
      console.error("Asset not found for transcription");
      setIsTranscribing(null);
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/transcription-progress?videoPath=/${fileName}`);
        const data = await res.json();
        setTranscriptionProgress(data.progress || 0);
      } catch (e) { console.error(e); }
    }, 1000);

    try {
      const response = await fetch(`${API_BASE}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoPath: `/${fileName}`, duration: asset.duration })
      });
      const result = await response.json();
      if (result.success) {
        const transcriptionWithSource = {
          ...result.transcription,
          source: 'ai' as const
        };
        setAssets(prev => prev.map(a => a.id === assetId ? { ...a, transcription: transcriptionWithSource } : a));
      }
    } catch (err) {
      console.error('Transcription failed:', err);
    } finally {
      clearInterval(pollInterval);
      setTranscriptionProgress(0);
      setIsTranscribing(null);
    }
  }, [assets]);

  const autoCutAsset = useCallback(async (assetId: string) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset || !asset.transcription) return;

    try {
      const response = await fetch(`${API_BASE}/auto-cut`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: asset.transcription.words,
          asset: {
            id: asset.id,
            name: asset.name,
            duration: asset.duration
          },
          trackId: 'video-1'
        })
      });

      const data = await response.json();

      // Log statistics from professional rough cut
      if (data.statistics) {
        console.log('📊 Professional Rough Cut Statistics:');
        console.log(`  • Segments: ${data.statistics.segment_count}`);
        console.log(`  • Reduction: ${data.statistics.reduction_percentage}%`);
        console.log(`  • Time saved: ${data.statistics.time_saved}s`);
        console.log(`  • Silences removed: ${data.statistics.silences_removed}`);
        console.log(`  • Repetitions removed: ${data.statistics.repetitions_removed}`);
        console.log(`  • "Cut that" signals: ${data.statistics.cut_that_signals}`);
        console.log(`  • Incomplete sentences: ${data.statistics.incomplete_sentences}`);
      }

      if (data.clips && data.clips.length > 0) {
        setTimeline(prev => {
          const newTracks = prev.tracks.map(track => {
            if (track.id === 'v1') { // Target V1 only
              return { ...track, clips: data.clips };
            }
            return track;
          });
          return { ...prev, tracks: newTracks };
        });
        console.log(`✅ Added ${data.clips.length} clips to timeline`);
      } else {
        console.warn('⚠️ No clips returned from auto-cut');
      }
    } catch (err) {
      console.error('Auto-cut failed:', err);
    }
  }, [assets]);

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
      const response = await fetch(`${API_BASE}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (result.success) {
        // Start polling progress
        const pollInterval = setInterval(async () => {
          try {
            const progressRes = await fetch(`${API_BASE}/render-progress`);
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

  const exportToXML = useCallback(async () => {
    const data = {
      timeline,
      assets: assets.map(a => ({
        id: a.id,
        name: a.name,
        duration: a.duration,
        src: a.remoteSrc || a.src
      }))
    };

    try {
      const response = await fetch(`${API_BASE}/export-xml`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (result.success) {
        // Trigger download
        const link = document.createElement('a');
        link.href = result.path;
        link.download = basename(result.path);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error('XML Export failed:', err);
    }
  }, [timeline, assets]);


  const exportToEDL = useCallback(async () => {
    const data = {
      timeline,
      assets: assets.map(a => ({
        id: a.id,
        name: a.name,
        duration: a.duration,
        src: a.remoteSrc || a.src
      }))
    };

    try {
      const response = await fetch(`${API_BASE}/export-edl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (result.success) {
        const link = document.createElement('a');
        link.href = result.path;
        link.download = basename(result.path);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error('EDL Export failed:', err);
    }
  }, [timeline, assets]);

  const moveClip = useCallback((clipId: string, trackId: string, newStart: number) => {
    setTimeline(prev => {
      const sourceTrack = prev.tracks.find(t => t.clips.some(c => c.id === clipId));
      const targetTrack = prev.tracks.find(t => t.id === trackId);

      if (!sourceTrack || !targetTrack || sourceTrack.locked || targetTrack.locked) return prev;

      const clip = sourceTrack.clips.find(c => c.id === clipId);
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

      const next = { ...prev, tracks: finalTracks };
      setPast(p => [...p, prev].slice(-50));
      setFuture([]);
      return next;
    });
  }, [isMagnetic]);

  const moveClips = useCallback((clipIds: string[], delta: number) => {
    setTimeline(prev => {
      const next = { ...prev };
      let changed = false;

      next.tracks = next.tracks.map(track => {
        if (track.locked) return track;

        const hasClipsToMove = track.clips.some(c => clipIds.includes(c.id));
        if (!hasClipsToMove) return track;

        let clips = track.clips.map(clip => {
          if (clipIds.includes(clip.id)) {
            changed = true;
            const newStart = Math.max(0, clip.start + delta);
            const duration = clip.end - clip.start;
            return { ...clip, start: newStart, end: newStart + duration };
          }
          return clip;
        });

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

      if (!changed) return prev;

      setPast(p => [...p, prev].slice(-50));
      setFuture([]);
      return next;
    });
  }, [isMagnetic]);

  const nudgeClips = useCallback((clipIds: string[], direction: 'left' | 'right', amount: number = FRAME_DURATION) => {
    const delta = direction === 'left' ? -amount : amount;

    if (isMagnetic) {
      // In magnetic mode, nudging a whole clip SLIPS the content
      // (Changes trimStart/trimEnd while keeping start/end fixed)
      setTimeline(prev => {
        const next = { ...prev };
        let changed = false;

        next.tracks = next.tracks.map(track => {
          if (track.locked) return track;
          return {
            ...track,
            clips: track.clips.map(clip => {
              if (clipIds.includes(clip.id)) {
                changed = true;
                const asset = assets.find(a => a.id === clip.assetId);
                const assetDuration = asset?.duration || clip.trimEnd;

                // Guard boundaries
                let newTrimStart = clip.trimStart + delta;
                let newTrimEnd = clip.trimEnd + delta;

                if (newTrimStart < 0) {
                  newTrimEnd -= newTrimStart;
                  newTrimStart = 0;
                }
                if (newTrimEnd > assetDuration) {
                  newTrimStart -= (newTrimEnd - assetDuration);
                  newTrimEnd = assetDuration;
                }

                return { ...clip, trimStart: newTrimStart, trimEnd: newTrimEnd };
              }
              return clip;
            })
          };
        });

        if (!changed) return prev;
        setPast(p => [...p, prev].slice(-50));
        setFuture([]);
        return next;
      });
    } else {
      // In non-magnetic mode, nudging moves the clip globally
      moveClips(clipIds, delta);
    }
  }, [moveClips, isMagnetic, assets]);

  const nudgeClipEdge = useCallback((clipId: string, edge: 'start' | 'end', direction: 'left' | 'right', amount: number = FRAME_DURATION) => {
    const delta = direction === 'left' ? -amount : amount;
    setTimeline(prev => {
      const next = { ...prev };
      let changed = false;

      next.tracks = next.tracks.map(track => {
        if (track.locked) return track;
        let clips = track.clips.map(clip => {
          if (clip.id === clipId) {
            changed = true;
            if (edge === 'start') {
              const asset = assets.find(a => a.id === clip.assetId);
              // Nudging START edge primarily changes trimStart
              const newTrimStart = Math.max(0, clip.trimStart + delta);
              if (newTrimStart > clip.trimEnd - 0.1) return clip;

              const durationChange = clip.trimStart - newTrimStart;
              // Update start/end so duration (end-start) reflects the new trim
              const newStart = Math.max(0, clip.start - durationChange);
              const newEnd = newStart + (clip.trimEnd - newTrimStart);

              return {
                ...clip,
                trimStart: newTrimStart,
                start: newStart,
                end: newEnd
              };
            } else {
              const asset = assets.find(a => a.id === clip.assetId);
              const assetDuration = asset?.duration || clip.end + 10;

              const newTrimEnd = Math.max(clip.trimStart + 0.1, Math.min(assetDuration, clip.trimEnd + delta));

              return {
                ...clip,
                trimEnd: newTrimEnd,
                end: clip.start + (newTrimEnd - clip.trimStart)
              };
            }
          }
          return clip;
        });

        // Add magnetic ripple logic for edge nudging
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

      setPast(p => [...p, prev].slice(-50));
      setFuture([]);
      return next;
    });
  }, [isMagnetic, assets]);

  // Helper to re-pack a track (remove gaps) if magnetic
  const packTrack = useCallback((clips: TimelineClip[]) => {
    const sorted = [...clips].sort((a, b) => a.start - b.start);
    let currentPos = 0;
    return sorted.map(c => {
      const duration = c.end - c.start; // Keep duration fixed
      // If we adjusted trims, duration might have changed, so trust (trimEnd - trimStart) if needed?
      // Actually source of truth for length is usually (trimEnd - trimStart).
      // Let's recalculate duration from trims to be safe.
      const trueDuration = c.trimEnd - c.trimStart;
      const updated = {
        ...c,
        start: currentPos,
        end: currentPos + trueDuration
      };
      currentPos += trueDuration;
      return updated;
    });
  }, []);

  const deleteClipRange = useCallback((assetId: string, rangeStart: number, rangeEnd: number) => {
    setTimeline(prev => {
      const next = { ...prev };
      let changed = false;

      next.tracks = next.tracks.map(track => {
        if (track.locked) return track;

        // processing clips
        let newClips: TimelineClip[] = [];
        let trackChanged = false;

        for (const clip of track.clips) {
          // Only affect clips that belong to the target asset
          // (Strictly speaking, transcript delete should only affect the specific file, 
          // but in this app 'assetId' might be shared or valid. 
          // We should match by assetId.)
          if (clip.assetId !== assetId) {
            newClips.push(clip);
            continue;
          }

          // Check overlap
          // Clip covers source time: [trimStart, trimEnd]
          // Delete range: [rangeStart, rangeEnd]

          // No overlap
          if (rangeEnd <= clip.trimStart || rangeStart >= clip.trimEnd) {
            newClips.push(clip);
            continue;
          }

          trackChanged = true;
          changed = true;

          // Overlap scenarios
          const deleteStart = Math.max(rangeStart, clip.trimStart);
          const deleteEnd = Math.min(rangeEnd, clip.trimEnd);

          // 1. Fully contained delete (Split into two)
          // Clip: |oooooooooooo|
          // Del:     |xxxx|
          // Res: |ooo|    |oooo|
          if (deleteStart > clip.trimStart && deleteEnd < clip.trimEnd) {
            // First part
            const firstDuration = deleteStart - clip.trimStart;
            newClips.push({
              ...clip,
              id: clip.id + '-part1',
              trimEnd: deleteStart,
              end: clip.start + firstDuration
            });

            // Second part
            const secondStart = deleteEnd;
            const secondDuration = clip.trimEnd - secondStart;
            newClips.push({
              ...clip,
              id: clip.id + '-part2',
              trimStart: secondStart,
              start: clip.start + firstDuration, // Will be fixed by packTrack if magnetic, but good to approx
              trimEnd: clip.trimEnd,
              end: clip.start + firstDuration + secondDuration
            });
          }
          // 2. Delete covers start
          // Clip: |oooooooooooo|
          // Del: |xxxx|
          // Res:      |oooo|
          else if (deleteStart <= clip.trimStart && deleteEnd < clip.trimEnd) {
            const newTrimStart = deleteEnd;
            const newDuration = clip.trimEnd - newTrimStart;
            newClips.push({
              ...clip,
              trimStart: newTrimStart,
              start: clip.start, // Will be packed
              end: clip.start + newDuration
            });
          }
          // 3. Delete covers end
          // Clip: |oooooooooooo|
          // Del:        |xxxx|
          // Res: |oooooo|
          else if (deleteStart > clip.trimStart && deleteEnd >= clip.trimEnd) {
            const newTrimEnd = deleteStart;
            const newDuration = newTrimEnd - clip.trimStart;
            newClips.push({
              ...clip,
              trimEnd: newTrimEnd,
              end: clip.start + newDuration
            });
          }
          // 4. Delete covers entire clip
          else {
            // Do not push to newClips (delete it)
          }
        }

        if (trackChanged && isMagnetic) {
          newClips = packTrack(newClips);
        }

        return { ...track, clips: newClips };
      });

      if (!changed) return prev;

      setPast(p => [...p, prev].slice(-50));
      setFuture([]); // Clear redo stack on new action
      return next;
    });
  }, [isMagnetic, packTrack]);

  const restoreClipRange = useCallback((assetId: string, rangeStart: number, rangeEnd: number) => {
    // Capture current playhead position from scope
    const currentPlayhead = playheadPosition;

    setTimeline(prev => {
      // Default to first track (Video 1) which is usually index 0
      const activeTrackIndex = 0;
      const track = prev.tracks[activeTrackIndex];

      if (track.locked) return prev;

      const duration = rangeEnd - rangeStart;
      const newClip: TimelineClip = {
        id: crypto.randomUUID(),
        assetId,
        start: currentPlayhead, // Default to playhead if no better spot found
        end: currentPlayhead + duration,
        trimStart: rangeStart,
        trimEnd: rangeEnd,
        sourceFileName: assets.find(a => a.id === assetId)?.name || 'Restored Clip',
        trackId: track.id, // Explicitly set trackId
        name: assets.find(a => a.id === assetId)?.name || 'Restored Clip',
      };

      // Smart Insertion Logic:
      // Try to find a clip from the same asset that ends near rangeStart, or starts near rangeEnd
      let insertTime = currentPlayhead;
      let inserted = false;

      // Find nearest neighbor from same asset
      const sameAssetClips = track.clips.filter(c => c.assetId === assetId).sort((a, b) => a.trimStart - b.trimStart);

      // Check if we can append to a preceeding clip
      const preceeding = sameAssetClips.find(c => Math.abs(c.trimEnd - rangeStart) < 0.1);
      if (preceeding) {
        insertTime = preceeding.end;
        inserted = true;
      } else {
        // Check if we can prepend to a following clip
        const following = sameAssetClips.find(c => Math.abs(c.trimStart - rangeEnd) < 0.1);
        if (following) {
          insertTime = following.start - duration;
          inserted = true;
        }
      }

      if (inserted) {
        newClip.start = insertTime;
        newClip.end = insertTime + duration;
      }

      let newClips = [...track.clips, newClip];

      if (isMagnetic) {
        // If inserted at specific point (smart insertion):
        // We need to shift all clips after `insertTime` by `duration`.
        newClips = track.clips.map(c => {
          if (c.start >= insertTime) {
            return { ...c, start: c.start + duration, end: c.end + duration };
          }
          return c;
        });
        newClip.start = insertTime;
        newClip.end = insertTime + duration;
        newClips.push(newClip);

        newClips = packTrack(newClips);
      } else {
        // Standard Insert
        newClips = track.clips.map(c => {
          if (c.start >= insertTime) {
            return { ...c, start: c.start + duration, end: c.end + duration };
          }
          return c;
        });
        newClip.start = insertTime;
        newClip.end = insertTime + duration;
        newClips.push(newClip);
      }

      const next = {
        ...prev,
        tracks: prev.tracks.map((t, i) => i === activeTrackIndex ? { ...t, clips: newClips } : t)
      };

      setPast(p => [...p, prev].slice(-50));
      setFuture([]); // Clear redo stack on new action
      return next;
    });
  }, [playheadPosition, isMagnetic, packTrack, assets, setPast, setFuture]);

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
          let clips = track.clips.map(clip => {
            if (clip.id === clipId) {
              const merged = { ...clip, ...updates };

              // Validation: Enforce asset boundaries if trimming changed
              if (updates.trimStart !== undefined || updates.trimEnd !== undefined) {
                const asset = assets.find(a => a.id === clip.assetId);
                const duration = asset?.duration || clip.trimEnd;

                if (merged.trimStart < 0) merged.trimStart = 0;
                if (merged.trimEnd > duration) merged.trimEnd = duration;
                if (merged.trimEnd - merged.trimStart < 0.1) {
                  // Revert or clamp
                  return clip;
                }
              }
              return merged;
            }
            return clip;
          });
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

  const exportTranscript = useCallback(async (transcription: any) => {
    try {
      const response = await fetch(`${API_BASE}/export-transcript`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcription, format: 'txt' }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcript_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      } else {
        console.error('Failed to export transcript');
      }
    } catch (error) {
      console.error('Error exporting transcript:', error);
    }
  }, []);

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

  const uploadTranscript = useCallback(async (assetId: string, file: File) => {
    try {
      const content = await file.text();
      console.log('📤 Uploading transcript:', file.name, 'size:', content.length, 'projectId:', projectId);
      const response = await fetch(`${API_BASE}/upload-transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, fileName: file.name, projectId })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Transcript upload failed:', response.status, errorText);
        throw new Error(`Upload failed with status ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ Transcript upload response:', result);
      if (result.success) {
        const transcriptionWithSource = {
          ...result.transcription,
          source: 'upload' as const
        };
        setAssets(prev => prev.map(a => a.id === assetId ? { ...a, transcription: transcriptionWithSource } : a));

        // Update segments for transcript display, but DON'T regenerate timeline
        // The existing timeline clips should remain untouched
        if (projectId) {
          // Convert word ms to seconds for segments (for transcript sidebar display)
          const newSegments = result.transcription.words.map((w: any) => ({
            start: w.start / 1000,
            end: w.end / 1000,
            text: w.word,
            type: w.type || 'speech',
            isDeleted: w.isDeleted || false
          }));
          setSegments(newSegments);
          // REMOVED: generateTimelineFromSegments(newSegments); 
          // Don't regenerate timeline - user's existing cuts should be preserved!

          // Sync segments to backend (for transcript data only)
          fetch(`/api/project/${projectId}/segments`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSegments)
          }).catch(e => console.error("Sync failed", e));
        }
      }
    } catch (err) {
      console.error('Transcript upload failed:', err);
    }
  }, []);

  // NEW: Split clip at current playhead position
  const splitClipAtPlayhead = useCallback(() => {
    const position = playheadPosition;
    let splitOccurred = false;

    setTimeline(prev => {
      const next = {
        ...prev,
        tracks: prev.tracks.map(track => {
          if (track.locked) return track;
          const clip = track.clips.find(c => position > c.start && position < c.end);
          if (clip) {
            splitOccurred = true;
            const firstHalf = { ...clip, id: `${clip.id}-1`, end: position, trimEnd: clip.trimStart + (position - clip.start) };
            const secondHalf = { ...clip, id: `${clip.id}-2`, start: position, trimStart: clip.trimStart + (position - clip.start) };

            // Auto-select the second half
            setSelectedClipIds([secondHalf.id]);

            return { ...track, clips: [...track.clips.filter(c => c.id !== clip.id), firstHalf, secondHalf] };
          }
          return track;
        })
      };

      if (splitOccurred) {
        setPast(p => [...p, prev].slice(-50));
        setFuture([]);
      }

      return next;
    });
  }, [playheadPosition]);

  // NEW: Select clips in a time range (for marquee selection)
  const selectClipsInRange = useCallback((startTime: number, endTime: number, trackIds?: string[]) => {
    const clipsInRange: string[] = [];

    timeline.tracks.forEach(track => {
      if (trackIds && !trackIds.includes(track.id)) return;

      track.clips.forEach(clip => {
        // Check if clip overlaps with selection range
        if (clip.start < endTime && clip.end > startTime) {
          clipsInRange.push(clip.id);
        }
      });
    });

    setSelectedClipIds(clipsInRange);
  }, [timeline]);

  // NEW: Ripple delete - delete clips and shift subsequent clips left
  const rippleDelete = useCallback((clipIds?: string[]) => {
    const idsToDelete = clipIds || selectedClipIds;
    if (idsToDelete.length === 0) return;

    setTimeline(prev => {
      const next = {
        ...prev,
        tracks: prev.tracks.map(track => {
          if (track.locked) return track;

          // Find clips to delete and their positions
          const deletedRanges: Array<{ start: number; end: number }> = [];
          track.clips.forEach(clip => {
            if (idsToDelete.includes(clip.id)) {
              deletedRanges.push({ start: clip.start, end: clip.end });
            }
          });

          // Remove deleted clips
          let clips = track.clips.filter(c => !idsToDelete.includes(c.id));

          // Ripple: shift clips after each deletion
          deletedRanges.sort((a, b) => a.start - b.start);
          let cumulativeShift = 0;

          deletedRanges.forEach(range => {
            const gapDuration = range.end - range.start;

            clips = clips.map(clip => {
              if (clip.start >= range.end - cumulativeShift) {
                return {
                  ...clip,
                  start: clip.start - gapDuration,
                  end: clip.end - gapDuration
                };
              }
              return clip;
            });

            cumulativeShift += gapDuration;
          });

          return { ...track, clips };
        })
      };

      setPast(p => [...p, prev].slice(-50));
      setFuture([]);
      return next;
    });

    setSelectedClipIds([]);
  }, [selectedClipIds]);

  // NEW: Set track height
  const setTrackHeight = useCallback((trackId: string, height: number) => {
    setTimeline(prev => ({
      ...prev,
      tracks: prev.tracks.map(t =>
        t.id === trackId ? { ...t, height: Math.max(40, Math.min(200, height)) } : t
      )
    }));
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
    moveClips,
    nudgeClips,
    nudgeClipEdge,
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
    canRedo: future.length > 0,
    isTranscribing,
    transcribeAsset,
    autoCutAsset,
    exportToXML,
    exportToEDL,
    exportTranscript,
    uploadTranscript,
    transcriptionProgress,
    // New exports
    toggleSegmentDelete,
    projectId,
    segments,
    // NEW UX enhancements
    splitClipAtPlayhead,
    selectClipsInRange,
    rippleDelete,
    setTrackHeight,
    deleteProject,
    deleteClipRange,
    restoreClipRange,
  };
};