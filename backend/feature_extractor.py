"""
Feature Extractor for Robust Rough Cut ML Model.

Extracts numerical features from a transcript segment (list of words).
Features include:
- Text: Word count, Stop word ratio, Semantic repetition score, Linguistic complexity
- Timing: Duration, Pause before, Pause after, Speed (words/sec)
- Context: Position in video, Questions, Exclamations
- Sentiment: Positive/negative tone, Emotional indicators
"""

import re
from typing import List, Dict, Optional

# Try to import sentiment analysis (optional dependency)
try:
    from textblob import TextBlob
    SENTIMENT_AVAILABLE = True
except ImportError:
    SENTIMENT_AVAILABLE = False

class FeatureExtractor:
    def __init__(self, total_video_duration: float = None):
        """
        Initialize feature extractor.
        
        Args:
            total_video_duration: Total duration of video in seconds (for positional features)
        """
        self.total_video_duration = total_video_duration
        
        self.STOP_WORDS = {
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
            'could', 'should', 'may', 'might', 'can', 'to', 'of', 'in',
            'on', 'at', 'for', 'with', 'as', 'by', 'from', 'and', 'or',
            'but', 'if', 'then', 'so', 'it', 'that', 'this', 'these',
            'those', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him',
            'her', 'us', 'them', 'my', 'your', 'his', 'her', 'our', 'their'
        }
        
        self.FILLERS = {
            'um', 'uh', 'like', 'you know', 'sort of', 'kind of', 'i mean',
            'basically', 'actually', 'literally', 'honestly', 'so yeah',
            'erm', 'ah', 'hmm', 'well'
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
        text = segment['text']
        text_lower = text.lower()
        words = re.findall(r'\b\w+\b', text_lower)
        
        # Stop word ratio
        stop_count = sum(1 for w in words if w in self.STOP_WORDS)
        features['stop_word_ratio'] = round(stop_count / len(words), 3) if words else 0
        
        # Repetition (Immediate stutter check)
        features['starts_with_repeat'] = 0.0
        if prev_segment:
            prev_text = prev_segment['text'].lower()
            prev_words = re.findall(r'\b\w+\b', prev_text)
            if len(words) >= 2 and len(prev_words) >= 2:
                if words[:2] == prev_words[-2:]:
                    features['starts_with_repeat'] = 1.0

        # Enhanced filler detection
        features['filler_count'] = sum(1 for f in self.FILLERS if f in text_lower)
        features['has_filler'] = 1.0 if features['filler_count'] > 0 else 0.0
        
        # --- NEW: LINGUISTIC COMPLEXITY FEATURES ---
        
        # Unique word ratio (vocabulary richness)
        unique_words = set(words)
        features['unique_word_ratio'] = round(len(unique_words) / len(words), 3) if words else 0
        
        # Average word length (complexity indicator)
        avg_length = sum(len(w) for w in words) / len(words) if words else 0
        features['avg_word_length'] = round(avg_length, 2)
        
        # Question/exclamation counts (engagement markers)
        features['question_count'] = text.count('?')
        features['exclamation_count'] = text.count('!')
        
        # --- NEW: SENTIMENT FEATURES ---
        if SENTIMENT_AVAILABLE:
            try:
                blob = TextBlob(text)
                # Polarity: -1 (negative) to 1 (positive)
                polarity = blob.sentiment.polarity
                
                features['sentiment_positive'] = round(max(0, polarity), 3)
                features['sentiment_negative'] = round(max(0, -polarity), 3)
                
                # Subjectivity: 0 (objective) to 1 (subjective)
                features['sentiment_subjectivity'] = round(blob.sentiment.subjectivity, 3)
            except Exception:
                # Fallback if sentiment analysis fails
                features['sentiment_positive'] = 0.0
                features['sentiment_negative'] = 0.0
                features['sentiment_subjectivity'] = 0.0
        else:
            # Manual sentiment heuristics if TextBlob unavailable
            positive_words = {'good', 'great', 'excellent', 'amazing', 'love', 'yes', 'perfect', 'wonderful'}
            negative_words = {'bad', 'terrible', 'awful', 'hate', 'no', 'wrong', 'horrible', 'worst'}
            
            pos_count = sum(1 for w in words if w in positive_words)
            neg_count = sum(1 for w in words if w in negative_words)
            
            features['sentiment_positive'] = round(pos_count / len(words), 3) if words else 0
            features['sentiment_negative'] = round(neg_count / len(words), 3) if words else 0
            features['sentiment_subjectivity'] = 0.5  # Neutral fallback
        
        # --- NEW: CONTEXTUAL FEATURES ---
        
        # Position in video (0.0 = start, 1.0 = end)
        if self.total_video_duration and self.total_video_duration > 0:
            position = segment['start_time'] / self.total_video_duration
            features['position_in_video'] = round(min(1.0, position), 3)
        else:
            features['position_in_video'] = 0.5  # Unknown, assume middle
        
        # Time since last segment (pacing context)
        if prev_segment:
            time_since_last = segment['start_time'] - prev_segment['end_time']
            features['time_since_last_cut'] = round(time_since_last, 3)
        else:
            features['time_since_last_cut'] = 0.0

        return features
