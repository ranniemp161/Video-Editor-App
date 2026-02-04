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
import difflib
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
        self.SILENCE_THRESHOLD = 1.0  # Split segments if gap > 1s (Catch retakes better)
        self.SENTENCE_SPLIT_GAP = 0.4  # Smaller gap for internal restarts
        self.REPETITION_SIMILARITY = 0.7 
        self.MIN_SEGMENT_LENGTH = 3
        
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
        logger.info(f"Split into {len(segments)} segments after initial silence removal")
        if segments is None: logger.error("Step 1 returned None")
        
        # Step 1.5: Refine segmentation (Internal restarts and punctuation)
        segments = self._refine_segmentation(segments)
        logger.info(f"Refined into {len(segments)} segments after punctuation/restart splits")
        if segments is None: logger.error("Step 1.5 returned None")
        
        # Step 2: Detect and process "cut that" signals
        segments = self._process_cut_that_signals(segments)
        logger.info(f"{len(segments)} segments after 'cut that' processing")
        if segments is None: logger.error("Step 2 returned None")
        
        # Step 3: Remove incomplete sentences (Surgical Pass)
        segments = self._remove_incomplete_sentences(segments)
        logger.info(f"{len(segments)} segments after incomplete sentence removal")
        if segments is None: logger.error("Step 3 returned None")
        
        # Step 4: Handle incremental takes (False starts)
        segments = self._process_incremental_takes(segments)
        logger.info(f"{len(segments)} segments after incremental takes processing")
        if segments is None: logger.error("Step 4 returned None")
        
        # Step 5: Remove repetitions (keep LAST version)
        segments = self._remove_repetitions(segments)
        logger.info(f"{len(segments)} segments after repetition removal")
        if segments is None: logger.error("Step 5 returned None")
        
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

    def _refine_segmentation(self, segments: List[Dict]) -> List[Dict]:
        """
        Sub-split segments based on:
        1. Punctuation (., !, ?) - If a sentence ends, it should be its own segment.
        2. Media-gap (> 0.4s) - Catch retakes that are separated by small breaths.
        """
        refined = []
        
        for segment in segments:
            words_in_seg = [self.words[idx] for idx in segment['word_indices']]
            sub_splits = [0]
            
            for i in range(len(words_in_seg) - 1):
                w1 = words_in_seg[i]
                w2 = words_in_seg[i+1]
                
                # Split on punctuation
                if w1['word'].strip().endswith(('.', '!', '?')):
                    sub_splits.append(i + 1)
                # Split on gap (> 0.4s)
                elif w2['start'] - w1['end'] > self.SENTENCE_SPLIT_GAP:
                    sub_splits.append(i + 1)
            
            sub_splits.append(len(words_in_seg))
            
            # Create sub-segments
            for s in range(len(sub_splits) - 1):
                start = sub_splits[s]
                end = sub_splits[s+1]
                if end > start:
                    indices = segment['word_indices'][start:end]
                    refined.append({
                        'word_indices': indices,
                        'start_time': self.words[indices[0]]['start'],
                        'end_time': self.words[indices[-1]]['end'],
                        'text': ' '.join([self.words[idx]['word'] for idx in indices])
                    })
        
        return refined
    
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
        Surgically remove sentences that trail off.
        Instead of discarding the whole segment, it finds the last punctuation
        and cuts everything AFTER it if the segment seems to trail off.
        """
        cleaned = []
        
        for i, segment in enumerate(segments):
            text = segment['text'].strip()
            # Find the index of the last punctuation mark
            # (., !, ?)
            matches = list(re.finditer(r'[.!?]', text))
            
            if not matches:
                # No punctuation at all. If it's short and followed by a restart, kill it.
                if len(segment['word_indices']) < 6 and i < len(segments) - 1:
                    continue
                cleaned.append(segment)
                continue
            
            last_match = matches[-1]
            last_punct_idx = last_match.start()
            
            # Text after last punctuation
            trailing_text = text[last_punct_idx+1:].strip()
            trailing_words = trailing_text.split()
            
            # If there's trailing junk and it's followed by a restart or gap
            if trailing_words:
                should_trim = False
                if i < len(segments) - 1:
                    next_text = segments[i + 1]['text'].lower()
                    restarts = ['so ', 'i mean', 'what i meant', 'let me', 'actually', 'the ', 'it ']
                    if any(next_text.startswith(r) for r in restarts):
                        should_trim = True
                
                if should_trim:
                    # SURGICAL CUT: Keep only up to the punctuation
                    num_words_to_keep = len(text[:last_punct_idx+1].split())
                    segment['word_indices'] = segment['word_indices'][:num_words_to_keep]
                    segment['text'] = ' '.join([self.words[idx]['word'] for idx in segment['word_indices']])
                    segment['end_time'] = self.words[segment['word_indices'][-1]]['end']
                    self.stats['incomplete_sentences'] += 1
                    logger.info(f"Surgical Cut: Trimmed dangling thought: \"...{trailing_text}\"")
            
            if segment['word_indices']:
                cleaned.append(segment)
        
        return cleaned

    def _process_incremental_takes(self, segments: List[Dict]) -> List[Dict]:
        """
        Global Take Consolidation Pass.
        
        Handles:
        1. Incremental builds: "I think" -> "I think we should" -> "I think we should go."
        2. Stuttered restarts: Segments that all start with the same 3-5 words.
        
        Algorithm:
        - Clusters segments with matching prefixes within a window.
        - Keeps only the most "complete" or latest version in each cluster.
        """
        if len(segments) < 2:
            return segments
            
        processed = []
        indices_to_discard = set()
        
        i = 0
        while i < len(segments):
            if i in indices_to_discard:
                i += 1
                continue
                
            curr = segments[i]
            
            # Normalize prefix
            def get_prefix(t):
                return re.sub(r'[^\w\s]', '', t.lower()).split()[:4]
            
            anchor_prefix = get_prefix(curr['text'])
            if not anchor_prefix:
                i += 1
                continue
            
            # Look ahead for a cluster of segments starting with the same prefix
            # Window: 30 seconds or 10 segments
            cluster = [i]
            window_limit = min(len(segments), i + 10)
            
            for j in range(i + 1, window_limit):
                if j in indices_to_discard: continue
                
                later = segments[j]
                if later['start_time'] - curr['end_time'] > 30:
                    break
                    
                later_prefix = get_prefix(later['text'])
                
                # Check for prefix match
                match_count = 0
                for w1, w2 in zip(anchor_prefix, later_prefix):
                    if w1 == w2: match_count += 1
                    else: break
                
                if match_count >= 3:
                     cluster.append(j)
            
            if len(cluster) > 1:
                # We have a retake cluster!
                # Logic: Keep the one with the most words AND punctuation
                def score(idx):
                    seg = segments[idx]
                    word_count = len(seg['word_indices'])
                    has_punct = 10 if seg['text'].strip().endswith(('.', '!', '?')) else 0
                    return word_count + has_punct + (idx * 0.1) # Tie-break to the LATEST take
                
                best_idx = max(cluster, key=score)
                
                for idx in cluster:
                    if idx != best_idx:
                        indices_to_discard.add(idx)
                        logger.info(f"Consolidated Take Cluster: Discarding false start/fragment at {segments[idx]['start_time']:.1f}s: \"{segments[idx]['text'][:30]}...\"")
                
                self.stats['repetitions_removed'] += (len(cluster) - 1)
                
            i += 1
                
        for i, seg in enumerate(segments):
            if i not in indices_to_discard:
                processed.append(seg)
                
        return processed
    
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
                
                # Length-weighted threshold (Smarter Sensitivity)
                word_count = len(current['word_indices'])
                if word_count <= 3:
                     threshold = 0.95 # Higher bar for short phrases (stops "very, very")
                elif word_count <= 6:
                     threshold = 0.85
                else:
                     threshold = 0.75 # More forgiving for long sentences
                
                # If very similar, this current one is the EARLIER version
                if similarity > threshold:
                    found_later_version = True
                    removed_indices.add(i)
                    self.stats['repetitions_removed'] += 1
                    logger.info(f"Removed earlier repetition at {current['start_time']:.1f}s "
                              f"(kept later version at {later['start_time']:.1f}s, sim: {similarity:.2f})")
                    break
            
            if not found_later_version:
                kept.append(current)
        
        return kept
    
    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate sequence similarity between two texts using difflib.
        This ensures word order is preserved in the comparison.
        """
        # Normalize
        t1 = text1.lower().strip()
        t2 = text2.lower().strip()
        
        # Remove punctuation for better matching
        t1_clean = re.sub(r'[^\w\s]', '', t1)
        t2_clean = re.sub(r'[^\w\s]', '', t2)
        
        # Use SequenceMatcher for order-aware similarity
        matcher = difflib.SequenceMatcher(None, t1_clean, t2_clean)
        return matcher.ratio()
    
    def _finalize_segments(self, segments: List[Dict]) -> List[Dict]:
        """
        Convert processed segments to final timeline format.
        Ensure no gaps at segment beginnings (tight pacing).
        """
        final = []
        
        # Padding in seconds (100ms)
        PADDING_START = 0.08  # Slightly less at start to keep it snappy
        PADDING_END = 0.15    # Slightly more at end for natural decay
        
        for segment in segments:
            if len(segment['word_indices']) < self.MIN_SEGMENT_LENGTH:
                continue  # Skip very short segments
            
            # Apply padding but stay within word boundaries if it's the very first/last word of the asset
            # (Though usually we have silence there anyway)
            padded_start = max(0, segment['start_time'] - PADDING_START)
            padded_end = segment['end_time'] + PADDING_END
            
            final.append({
                'start': padded_start,
                'end': padded_end,
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
