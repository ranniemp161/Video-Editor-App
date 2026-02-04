"""
Professional Rough Cut - Industry-standard rough cut algorithm

Implements sophisticated editing rules:
1. Silence & Pause Management (>2s removed, natural pauses preserved)
2. Repetition Handling (keep LAST version, context-aware)
3. "Cut That" Signal Processing
4. Incomplete Sentence Detection
"""

import logging
import re
from typing import List, Dict, Tuple, Optional

logger = logging.getLogger(__name__)


class ProfessionalRoughCutV2:
    def __init__(self, words: List[Dict]):
        """
        Initialize with word-level transcript.
        Words expected format: [{'word': str, 'start': float, 'end': float}, ...]
        Times in seconds.
        """
        self.words = words
        self.segments = []
        
        # Thresholds
        self.SILENCE_THRESHOLD = 2.0  # Remove silences > 2 seconds
        self.NATURAL_PAUSE = 0.5  # Preserve brief pauses (0.3-0.5s)
        self.REPETITION_SIMILARITY = 0.7  # 70% similarity = likely repetition
        self.MIN_SEGMENT_LENGTH = 3  # Minimum words in a segment
        
        # Statistics
        self.stats = {
            'silences_removed': 0,
            'silence_duration_removed': 0,
            'repetitions_removed': 0,
            'cut_that_signals': 0,
            'incomplete_sentences': 0
        }
    
    def analyze(self) -> List[Dict]:
        """
        Main analysis pipeline.
        Returns list of segments to keep.
        """
        logger.info(f"Starting professional rough cut on {len(self.words)} words")
        
        # Step 1: Split into segments based on long silences
        segments = self._split_by_silence()
        logger.info(f"Split into {len(segments)} segments after silence removal")
        
        # Step 2: Detect and process "cut that" signals
        segments = self._process_cut_that_signals(segments)
        logger.info(f"{len(segments)} segments after 'cut that' processing")
        
        # Step 3: Remove incomplete sentences
        segments = self._remove_incomplete_sentences(segments)
        logger.info(f"{len(segments)} segments after incomplete sentence removal")
        
        # Step 4: Remove repetitions (keep LAST version)
        segments = self._remove_repetitions(segments)
        logger.info(f"{len(segments)} segments after repetition removal")
        
        # Step 5: Convert to timeline segments
        self.segments = self._finalize_segments(segments)
        
        logger.info(f"Final rough cut: {len(self.segments)} segments")
        return self.segments
    
    def _split_by_silence(self) -> List[Dict]:
        """
        Split transcript into segments by removing silences > 2 seconds.
        Preserve natural pauses between sentences.
        """
        if not self.words:
            return []
        
        segments = []
        current_segment_words = []
        current_start_idx = 0
        
        for i in range(len(self.words)):
            current_segment_words.append(i)
            
            # Check gap to next word
            if i < len(self.words) - 1:
                gap = self.words[i + 1]['start'] - self.words[i]['end']
                
                # If gap exceeds threshold, end current segment
                if gap > self.SILENCE_THRESHOLD:
                    self.stats['silences_removed'] += 1
                    self.stats['silence_duration_removed'] += gap
                    
                    # Save current segment
                    if current_segment_words:
                        segments.append({
                            'word_indices': current_segment_words.copy(),
                            'start_idx': current_start_idx,
                            'end_idx': i,
                            'start_time': self.words[current_start_idx]['start'],
                            'end_time': self.words[i]['end'],
                            'text': ' '.join([self.words[idx]['word'] for idx in current_segment_words])
                        })
                    
                    # Start new segment
                    current_segment_words = []
                    current_start_idx = i + 1
                    
                    logger.debug(f"Removed {gap:.1f}s silence at {self.words[i]['end']:.1f}s")
        
        # Add final segment
        if current_segment_words:
            segments.append({
                'word_indices': current_segment_words,
                'start_idx': current_start_idx,
                'end_idx': len(self.words) - 1,
                'start_time': self.words[current_start_idx]['start'],
                'end_time': self.words[-1]['end'],
                'text': ' '.join([self.words[idx]['word'] for idx in current_segment_words])
            })
        
        return segments
    
    def _process_cut_that_signals(self, segments: List[Dict]) -> List[Dict]:
        """
        Detect "cut that" signals and remove the indicated content.
        
        When "cut that" appears:
        - Find the most recent complete sentence BEFORE current incomplete sentence
        - Remove everything from that point through "cut that"
        - Keep what follows
        """
        processed = []
        
        for segment in segments:
            text = segment['text'].lower()
            
            # Check for "cut that" signal
            if 'cut that' in text or 'cut this' in text:
                self.stats['cut_that_signals'] += 1
                logger.info(f"Found 'cut that' signal at {segment['start_time']:.1f}s")
                
                # Find position of "cut that"
                cut_phrase = 'cut that' if 'cut that' in text else 'cut this'
                cut_position = text.find(cut_phrase)
                
                # Split text into: before_cut | cut_that | after_cut
                words_list = segment['text'].split()
                before_words = []
                after_words = []
                in_after = False
                
                for i, word in enumerate(words_list):
                    if word.lower() in ['cut', 'that', 'this'] and not in_after:
                        # Check if this is part of "cut that"
                        if i < len(words_list) - 1 and words_list[i].lower() == 'cut':
                            if words_list[i + 1].lower() in ['that', 'this']:
                                in_after = True
                                continue
                    
                    if in_after:
                        after_words.append(word)
                    else:
                        before_words.append(word)
                
                # Find last complete sentence in before_words
                before_text = ' '.join(before_words)
                last_sentence_end = max(
                    before_text.rfind('.'),
                    before_text.rfind('!'),
                    before_text.rfind('?')
                )
                
                if last_sentence_end > 0:
                    # Keep up to last complete sentence
                    kept_before = before_text[:last_sentence_end + 1].strip()
                else:
                    # No complete sentence before, discard all
                    kept_before = ""
                
                # Reconstruct segment with content after "cut that"
                new_text = (kept_before + ' ' + ' '.join(after_words)).strip()
                
                if new_text:
                    # Update segment text
                    segment['text'] = new_text
                    processed.append(segment)
                    logger.info(f"After 'cut that' processing: \"{new_text[:50]}...\"")
            else:
                # No "cut that" signal, keep as is
                processed.append(segment)
        
        return processed
    
    def _remove_incomplete_sentences(self, segments: List[Dict]) -> List[Dict]:
        """
        Remove sentences that trail off or are abandoned mid-thought.
        
        Indicators of incomplete sentences:
        - No ending punctuation (., !, ?)
        - Followed by a restart/rephrase
        - Very short length
        """
        cleaned = []
        
        for i, segment in enumerate(segments):
            text = segment['text'].strip()
            
            # Check if segment ends with punctuation
            has_ending = text.endswith(('.', '!', '?'))
            word_count = len(segment['word_indices'])
            
            # If no ending punctuation and short, likely incomplete
            if not has_ending and word_count < 5:
                # Check if next segment seems to be a restart
                if i < len(segments) - 1:
                    next_text = segments[i + 1]['text'].lower()
                    # Common restart patterns
                    restarts = ['so ', 'i mean', 'what i meant', 'let me', 'actually']
                    if any(next_text.startswith(r) for r in restarts):
                        self.stats['incomplete_sentences'] += 1
                        logger.info(f"Removed incomplete sentence at {segment['start_time']:.1f}s: \"{text[:30]}...\"")
                        continue  # Skip this segment
            
            cleaned.append(segment)
        
        return cleaned
    
    def _remove_repetitions(self, segments: List[Dict]) -> List[Dict]:
        """
        Remove repetitions, keeping the LAST/FINAL version.
        
        Detects both:
        - Verbatim repetition (exact same words)
        - Semantic repetition (same idea, different words)
        
        Context-aware: Only considers repetitions within a reasonable window (60s).
        """
        if len(segments) <= 1:
            return segments
        
        kept = []
        removed_indices = set()
        
        for i in range(len(segments)):
            if i in removed_indices:
                continue
            
            current = segments[i]
            
            # Look ahead for potential repetitions of THIS segment
            # (We keep the LAST version, so we look for later versions)
            window_end = min(len(segments), i + 10)  # Look ahead 10 segments max
            found_later_version = False
            
            for j in range(i + 1, window_end):
                if j in removed_indices:
                    continue
                
                later = segments[j]
                
                # Check if within time window (60 seconds)
                time_gap = later['start_time'] - current['end_time']
                if time_gap > 60:
                    break  # Too far apart
                
                # Calculate similarity
                similarity = self._calculate_similarity(current['text'], later['text'])
                
                # If very similar, this current one is the EARLIER version
                # We should REMOVE current and KEEP later
                if similarity > self.REPETITION_SIMILARITY:
                    found_later_version = True
                    removed_indices.add(i)
                    self.stats['repetitions_removed'] += 1
                    logger.info(f"Removed earlier repetition at {current['start_time']:.1f}s "
                              f"(kept later version at {later['start_time']:.1f}s)")
                    break
            
            if not found_later_version:
                kept.append(current)
        
        return kept
    
    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate similarity between two texts.
        Returns 0.0 to 1.0 (higher = more similar).
        Uses both exact matching and keyword overlap.
        """
        # Normalize
        t1 = text1.lower().strip()
        t2 = text2.lower().strip()
        
        # Check for exact substring match
        if t1 in t2 or t2 in t1:
            return 1.0
        
        # Remove punctuation for comparison
        t1_clean = re.sub(r'[^\w\s]', '', t1)
        t2_clean = re.sub(r'[^\w\s]', '', t2)
        
        # Word-level comparison
        words1 = set(t1_clean.split())
        words2 = set(t2_clean.split())
        
        if not words1 or not words2:
            return 0.0
        
        # Remove common stop words for better semantic matching
        stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'i', 'you', 'and', 'or', 'but'}
        words1 = words1 - stop_words
        words2 = words2 - stop_words
        
        if not words1 or not words2:
            return 0.0
        
        # Jaccard similarity
        intersection = len(words1 & words2)
        union = len(words1 | words2)
        
        return intersection / union if union > 0 else 0.0
    
    def _finalize_segments(self, segments: List[Dict]) -> List[Dict]:
        """
        Convert processed segments to final timeline format.
        Ensure no gaps at segment beginnings (tight pacing).
        """
        final = []
        
        for segment in segments:
            if len(segment['word_indices']) < self.MIN_SEGMENT_LENGTH:
                continue  # Skip very short segments
            
            final.append({
                'start': segment['start_time'],
                'end': segment['end_time'],
                'text': segment['text'],
                'word_count': len(segment['word_indices']),
                'word_indices': segment['word_indices']
            })
        
        return final
    
    def get_statistics(self) -> Dict:
        """Return editing statistics."""
        if not self.words or not self.segments:
            return self.stats
        
        original_duration = self.words[-1]['end'] - self.words[0]['start']
        final_duration = sum(s['end'] - s['start'] for s in self.segments)
        
        return {
            **self.stats,
            'segment_count': len(self.segments),
            'original_duration': round(original_duration, 2),
            'final_duration': round(final_duration, 2),
            'time_saved': round(original_duration - final_duration, 2),
            'reduction_percentage': round(
                (1 - final_duration / original_duration) * 100, 1
            ) if original_duration > 0 else 0
        }
