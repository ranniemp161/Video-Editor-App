"""
Feature Extractor for Robust Rough Cut ML Model.

Extracts numerical features from a transcript segment (list of words).
Features include:
- Text: Word count, Stop word ratio, Semantic repetition score
- Timing: Duration, Pause before, Pause after, Speed (words/sec)
- Context: Is start of sentence?
"""

import re
from typing import List, Dict, Optional

class FeatureExtractor:
    def __init__(self):
        self.STOP_WORDS = {
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
            'could', 'should', 'may', 'might', 'can', 'to', 'of', 'in',
            'on', 'at', 'for', 'with', 'as', 'by', 'from', 'and', 'or',
            'but', 'if', 'then', 'so', 'it', 'that', 'this', 'these',
            'those', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him',
            'her', 'us', 'them', 'my', 'your', 'his', 'her', 'our', 'their'
        }

    def extract_features(self, segment: Dict, prev_segment: Optional[Dict] = None, next_segment: Optional[Dict] = None) -> Dict[str, float]:
        """
        Extract numerical features for a single segment.
        Segment expected keys: 'text', 'start_time', 'end_time', 'word_count'
        """
        features = {}
        
        # --- TIMING FEATURES ---
        duration = segment['end_time'] - segment['start_time']
        features['duration'] = round(duration, 3)
        features['word_count'] = segment.get('word_count', len(segment['text'].split()))
        
        # Speed (Words per second)
        features['speech_rate'] = round(features['word_count'] / duration, 2) if duration > 0 else 0
        
        # Pauses
        if prev_segment:
            features['pause_before'] = round(segment['start_time'] - prev_segment['end_time'], 3)
        else:
            features['pause_before'] = 1.0 # Default start padding
            
        if next_segment:
            features['pause_after'] = round(next_segment['start_time'] - segment['end_time'], 3)
        else:
            features['pause_after'] = 1.0 # Default end padding

        # --- TEXT FEATURES ---
        text = segment['text'].lower()
        words = re.findall(r'\b\w+\b', text)
        
        # Stop word ratio
        stop_count = sum(1 for w in words if w in self.STOP_WORDS)
        features['stop_word_ratio'] = stop_count / len(words) if words else 0
        
        # Repetition (Immediate stutter check)
        # Simple heuristic: check if first 2 words match last 2 words of previous
        features['starts_with_repeat'] = 0.0
        if prev_segment:
            prev_text = prev_segment['text'].lower()
            prev_words = re.findall(r'\b\w+\b', prev_text)
            if len(words) >= 2 and len(prev_words) >= 2:
                if words[:2] == prev_words[-2:]:
                    features['starts_with_repeat'] = 1.0

        # Filler probability (simple keyword check)
        # In future, use 'is_filler' from ThoughtGrouper
        fillers = {'um', 'uh', 'like', 'you know', 'sort of'}
        features['has_filler'] = 1.0 if any(f in text for f in fillers) else 0.0

        return features
