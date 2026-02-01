
export interface Asset {
  id: string;
  type: 'video' | 'audio' | 'image';
  name: string;
  src: string | null; // Can be null for offline media
  duration: number; // in seconds
}

export interface TimelineClip {
  sourceFileName: any;
  id: string; // Unique instance ID
  assetId: string;
  trackId: string;
  name: string; // Store name for relinking
  start: number; // Start position on the timeline in seconds
  end: number; // End position on the timeline in seconds
  trimStart: number; // Start trim within the original asset in seconds
  trimEnd: number; // End trim within the original asset in seconds
  opacity?: number; // 0-100
  volume?: number; // 0-100
}

export interface TimelineTrack {
  id: string;
  type?: 'video' | 'audio'; // Added for convenience
  clips: TimelineClip[];
  muted?: boolean;
  locked?: boolean;
}

export interface TimelineState {
  tracks: TimelineTrack[];
}
