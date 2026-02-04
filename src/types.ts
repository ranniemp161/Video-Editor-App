
export interface Word {
  word: string;
  start: number;
  end: number;
  probability: number;
}

export interface Transcription {
  source?: 'ai' | 'upload';
  transcription: any;
  words: {
    word: string;
    start: number;
    end: number;
    isDeleted?: boolean;
  }[];
  thoughts?: ThoughtMetadata; // New: thought grouping metadata
}

export interface Thought {
  id: number;
  start_time: number;
  end_time: number;
  text: string;
  word_indices: number[];
  word_count: number;
  coherence_score: number;
  type: 'main_point' | 'tangent' | 'filler' | 'repetition';
  is_kept?: boolean;
}

export interface ThoughtMetadata {
  thoughts: Thought[];
  summary?: {
    total_thoughts: number;
    total_words: number;
    avg_words_per_thought: number;
    avg_coherence: number;
    type_distribution: Record<string, number>;
    total_duration: number;
  };
}

export interface Asset {
  id: string;
  type: 'video' | 'audio' | 'image';
  name: string;
  src: string | null; // Can be null for offline media
  duration: number; // in seconds
  transcription?: Transcription;
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

export interface TimelineMarker {
  id: string;              // Unique marker ID
  time: number;            // Position on timeline in seconds
  label?: string;          // Optional user label
  color: 'blue' | 'red' | 'green' | 'yellow';  // Marker color
  createdAt: number;       // Timestamp for sorting
}

export interface TimelineState {
  tracks: TimelineTrack[];
  markers?: TimelineMarker[];  // Add markers to timeline state
}
