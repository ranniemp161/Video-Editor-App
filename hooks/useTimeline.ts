import { useState, useEffect, useCallback, useRef } from 'react';
import { Asset, TimelineClip, TimelineState } from '../types';
import { ASSETS as INITIAL_ASSETS } from '../constants';

const cleanPath = (pathurl: string): string => {
    try {
        let decodedPath = decodeURIComponent(pathurl);
        
        // Remove 'file://localhost/' or other prefixes
        const prefixes = ['file://localhost/', 'file:///'];
        for (const prefix of prefixes) {
            if (decodedPath.startsWith(prefix)) {
                decodedPath = decodedPath.substring(prefix.length);
                break;
            }
        }
        
        // On Windows, paths might start with a drive letter preceded by a slash, e.g., /C:/...
        if (/^\/[a-zA-Z]:/.test(decodedPath)) {
            decodedPath = decodedPath.substring(1);
        }

        // Get just the filename
        const parts = decodedPath.split(/[\\/]/);
        return parts[parts.length - 1];

    } catch (e) {
        console.error("Error decoding path:", pathurl, e);
        const parts = pathurl.split(/[\\/]/);
        return parts[parts.length - 1];
    }
}

export const useTimeline = () => {
  const [timeline, setTimeline] = useState<TimelineState>({
    tracks: [{ id: 'track1', clips: [] }],
  });
  const [assets, setAssets] = useState<Asset[]>(INITIAL_ASSETS);
  const [playheadPosition, setPlayheadPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number | null>(null);

  const totalDuration = Math.max(
    10, // Minimum duration
    ...timeline.tracks.flatMap(t => t.clips.map(c => c.end))
  );

  const addClipToTimeline = useCallback((asset: Asset) => {
    setTimeline(prevTimeline => {
      const mainTrack = prevTimeline.tracks[0];
      const lastClip = mainTrack.clips[mainTrack.clips.length - 1];
      const start = lastClip ? lastClip.end : 0;
      const end = start + asset.duration;

      const newClip: TimelineClip = {
        id: `clip_${Date.now()}`,
        assetId: asset.id,
        trackId: mainTrack.id,
        start,
        end,
        trimStart: 0,
        trimEnd: asset.duration,
      };
      
      const newTracks = prevTimeline.tracks.map((track, index) => {
          if (index === 0) {
              return { ...track, clips: [...track.clips, newClip] };
          }
          return track;
      });

      return { ...prevTimeline, tracks: newTracks };
    });
  }, []);

  const findClipAtPosition = (position: number) => {
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        if (position >= clip.start && position < clip.end) {
          const asset = assets.find(a => a.id === clip.assetId);
          if (!asset || !asset.src) return null;
          return { clip, asset };
        }
      }
    }
    return null;
  };
  
  const currentClip = findClipAtPosition(playheadPosition);
  
  const animatePlayback = useCallback((timestamp: number) => {
    const lastTime = lastUpdateTimeRef.current ?? timestamp;
    const deltaTime = (timestamp - lastTime) / 1000;
    lastUpdateTimeRef.current = timestamp;

    setPlayheadPosition(prevPosition => {
      const newPosition = prevPosition + deltaTime;
      if (newPosition >= totalDuration) {
        setIsPlaying(false);
        return 0; // Loop back to start
      }
      return newPosition;
    });

    animationFrameRef.current = requestAnimationFrame(animatePlayback);
  }, [totalDuration]);

  const togglePlayback = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const importXML = useCallback((xmlString: string) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    
    const timebaseElement = xmlDoc.querySelector('sequence > rate > timebase');
    const framerate = timebaseElement ? parseFloat(timebaseElement.textContent || '30') : 30;

    const newClips: TimelineClip[] = [];
    const newOfflineAssets = new Map<string, Asset>();

    const clipItems = xmlDoc.querySelectorAll('sequence > media > video > track > clipitem');

    if (clipItems.length === 0) {
        alert("No video clips found in the XML file.");
        return;
    }

    clipItems.forEach(item => {
        const pathElement = item.querySelector('file > pathurl');
        const inElement = item.querySelector('in');
        const outElement = item.querySelector('out');
        const startElement = item.querySelector('start');
        const endElement = item.querySelector('end');

        if (!pathElement?.textContent || !inElement?.textContent || !outElement?.textContent || !startElement?.textContent || !endElement?.textContent) {
            console.warn('Skipping clipitem with missing timecode or file data:', item);
            return;
        }

        const fileName = cleanPath(pathElement.textContent);
        const assetId = `asset_${fileName}`;

        if (!newOfflineAssets.has(assetId)) {
            newOfflineAssets.set(assetId, {
                id: assetId,
                type: 'video',
                name: fileName,
                src: null,
                duration: 0,
            });
        }
        
        const sourceInFrames = parseInt(inElement.textContent, 10);
        const sourceOutFrames = parseInt(outElement.textContent, 10);
        const timelineStartFrames = parseInt(startElement.textContent, 10);
        const timelineEndFrames = parseInt(endElement.textContent, 10);
        
        newClips.push({
            id: item.getAttribute('id') || `clip_${Date.now()}_${Math.random()}`,
            assetId,
            trackId: 'track1',
            start: timelineStartFrames / framerate,
            end: timelineEndFrames / framerate,
            trimStart: sourceInFrames / framerate,
            trimEnd: sourceOutFrames / framerate,
        });
    });

    setAssets([...INITIAL_ASSETS, ...Array.from(newOfflineAssets.values())]);
    setTimeline({ tracks: [{id: 'track1', clips: newClips }]});
    setPlayheadPosition(0);
    setIsPlaying(false);

  }, []);

  const addMediaFiles = useCallback((files: FileList) => {
    const fileArray = Array.from(files);
    
    const promises = fileArray.map(file => {
        return new Promise<Asset>(resolve => {
            const video = document.createElement('video');
            const src = URL.createObjectURL(file);
            video.preload = 'metadata';
            video.src = src;
            video.onloadedmetadata = () => {
                resolve({
                    id: `asset_${file.name}`,
                    type: 'video',
                    name: file.name,
                    src: src,
                    duration: video.duration,
                });
            };
        });
    });

    Promise.all(promises).then(newlyLoadedAssets => {
        setAssets(prevAssets => {
            const updatedAssets = [...prevAssets];
            
            newlyLoadedAssets.forEach(loadedAsset => {
                const existingAssetIndex = updatedAssets.findIndex(a => a.name === loadedAsset.name);
                if (existingAssetIndex > -1) {
                    const oldSrc = updatedAssets[existingAssetIndex].src;
                    if (oldSrc && oldSrc.startsWith('blob:')) {
                        URL.revokeObjectURL(oldSrc);
                    }
                    updatedAssets[existingAssetIndex] = loadedAsset;
                } else {
                    updatedAssets.push(loadedAsset);
                }
            });
            
            return updatedAssets;
        });
    });
  }, []);
  
  useEffect(() => {
    if (isPlaying) {
      lastUpdateTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(animatePlayback);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    return () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
    };
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
  };
};