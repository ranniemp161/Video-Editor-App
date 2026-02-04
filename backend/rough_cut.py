import logging
from typing import List, Dict


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def generate_rough_cut(words: List[Dict], similarity_threshold: int = 85) -> List[Dict]:
    """
    Generates a rough cut by:
    1. Identifying and marking repeated phrases (keeping the last take).
    2. Filtering out silence (implied by gaps between words, though Whisper handles this well).
    3. Returning a list of valid segments.
    """
    if not words:
        return []

    # 1. Detect Repetitions (The "Gling" effect)
    # We look for clusters of similar sentences/phrases and keep the last one.
    # For a word-level list, this is tricky. A simple heuristic:
    # Look for sequences of words that are similar to immediately following sequences.
    
    # A better approach for "Rough Cut" from transcript:
    # Just look for "marked deleted" words if we had manual input, but here we are automating.
    # Let's try a simple window-based repetition detector.
    
    # Sliding window to find repeated phrases
    # (This is a simplified implementation. Production grade would need NLP sentence segmentation)
    
    n_words = len(words)
    keep_mask = [True] * n_words
    
    # Simple heuristic: Double words "I I", "the the"
    for i in range(n_words - 1):
        if words[i]['word'].lower().strip() == words[i+1]['word'].lower().strip():
            # Mark first one as deleted
            keep_mask[i] = False
            
    # TODO: More advanced sentence-level repetition detection
    
    # 2. Build Segments
    segments = []
    current_segment = None
    
    for i, word in enumerate(words):
        if not keep_mask[i] or word.get('isDeleted'):
            continue
            
        start = word['start']
        end = word['end']
        
        # Merge if close enough (e.g. < 0.5s gap)
        if current_segment and start - current_segment['end'] < 0.5:
            current_segment['end'] = end
            current_segment['text'] += " " + word['word']
        else:
            if current_segment:
                segments.append(current_segment)
            current_segment = {
                'start': start,
                'end': end,
                'text': word['word'],
                'type': 'speech',
                'isDeleted': False
            }
            
    if current_segment:
        segments.append(current_segment)
        
    return segments

def cleanup_transcript_interaction(words: List[Dict]):
    """
    Helper to clean up transcript interaction issues.
    Ensures start/end are floats.
    """
    for w in words:
        w['start'] = float(w['start'])
        w['end'] = float(w['end'])
    return words
