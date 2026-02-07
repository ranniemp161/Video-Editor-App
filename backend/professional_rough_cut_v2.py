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
        # Thresholds
        self.SILENCE_THRESHOLD = 2.0  # User Request: Remove silence > 2.0s
        self.SENTENCE_SPLIT_GAP = 0.4
        self.REPETITION_SIMILARITY = 0.85 # Stricter
        self.MIN_SEGMENT_LENGTH = 3
        
        # Statistics
        self.stats = {
            'silences_removed': 0,
            'silence_duration_removed': 0,
            'repetitions_removed': 0,
            'cut_that_signals': 0,
            'incomplete_sentences': 0,
            'phrase_stutters_removed': 0
        }
        
        # Initialize ML Components
        try:
            from ml_data_collector import MLDataCollector
            from feature_extractor import FeatureExtractor
            from ml_engine import RoughCutModel
            
            self.data_collector = MLDataCollector()
            self.feature_extractor = FeatureExtractor()
            self.ml_model = RoughCutModel() # Will load if exists
            self.use_ml = True
        except ImportError:
            logger.warning("ML dependencies not found. Running in heuristic-only mode.")
            self.use_ml = False
    
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
        
        # Step 5.5: Remove intra-sentence phrase stutters (e.g., "well I have well I have")
        segments = self._remove_phrase_stutters(segments)
        logger.info(f"{len(segments)} segments after phrase stutter removal")
        
        # Step 6: Semantic Thought Analysis & Filtering (New)
        segments = self._semantic_filtering(segments)
        logger.info(f"{len(segments)} segments after semantic filtering")
        if segments is None: logger.error("Step 6 returned None")
        
        # Step 6.5: ML Overrides (Personalization Layer)
        # If the model has learned that specific patterns should be CUT, it overrides heuristics.
        if self.use_ml:
            segments = self._apply_ml_overrides(segments)
            logger.info(f"{len(segments)} segments after ML overrides")
        
        # Step 7: ML Logging (Record decisions for future training)
        if self.use_ml:
            self._log_decisions(segments)
        
        # Final Step: Convert to timeline segments
        self.segments = self._finalize_segments(segments)
        
        logger.info(f"Final rough cut: {len(self.segments)} segments")
        return self.segments
    
    def _split_by_silence(self) -> List[Dict]:
        """
        Split transcript into segments by removing silences > 1 second.
        Respects word-level 'isDeleted' flags from expert editor.
        """
        if not self.words:
            return []
        
        segments = []
        current_segment_words = []
        current_start_idx = 0
        
        for i in range(len(self.words)):
            # Special check: skip words already marked as deleted by expert editor
            if self.words[i].get('isDeleted', False):
                # If we were building a segment, and hit a deleted word, 
                # we don't necessarily end the segment, but we don't add this word.
                # However, for simplicity in rough cut segments, we'll exclude deleted words later.
                pass
            
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
                            'text': ' '.join([self.words[idx]['word'] for idx in current_segment_words if not self.words[idx].get('isDeleted', False)])
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
                'text': ' '.join([self.words[idx]['word'] for idx in current_segment_words if not self.words[idx].get('isDeleted', False)])
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
                skip_next = False
                
                for i, word in enumerate(words_list):
                    if skip_next:
                        skip_next = False
                        continue
                        
                    cur_clean = re.sub(r'[^\w]', '', word.lower())
                    
                    if cur_clean in ['cut'] and not in_after:
                        # Check if this is part of "cut that"
                        if i < len(words_list) - 1:
                            next_word = words_list[i+1]
                            next_clean = re.sub(r'[^\w]', '', next_word.lower())
                            if next_clean in ['that', 'this']:
                                in_after = True
                                skip_next = True # Skip the "that/this" word
                                continue
                    
                    if in_after:
                        after_words.append(word)
                    else:
                        before_words.append(word)
                
                # Find last complete sentence in before_words
                before_text = ' '.join(before_words).strip()
                
                # We want to find the END of the previous sentence.
                # If before_text ends with punctuation, that's likely the "bad" sentence's end.
                # So we search in the text *excluding* the trailing punctuation to find the *previous* one.
                
                search_text = before_text
                if search_text and search_text[-1] in '.!?':
                    search_text = search_text[:-1]
                    
                last_sentence_end = max(
                    search_text.rfind('.'),
                    search_text.rfind('!'),
                    search_text.rfind('?')
                )
                
                if last_sentence_end > 0:
                    # Keep up to last complete sentence
                    kept_before = before_text[:last_sentence_end + 1].strip()
                else:
                    # No complete sentence before, discard all before words
                    kept_before = ""
                
                # Reconstruct segment with content after "cut that"
                new_text = (kept_before + ' ' + ' '.join(after_words)).strip()
                
                if new_text:
                    # CRITICAL FIX: Must update word_indices to match the new text
                    # We need to map the kept words back to their original indices
                    
                    # 1. Re-split kept_before to count words
                    kept_before_count = len(kept_before.split()) if kept_before else 0
                    
                    # 2. Count words in after_words
                    after_count = len(after_words)
                    
                    # 3. Total original words
                    total_original = len(words_list)
                    
                    # 4. Indices logic:
                    # kept_before corresponds to first N words
                    # after_words corresponds to last M words
                    
                    new_indices = []
                    if kept_before_count > 0:
                        new_indices.extend(segment['word_indices'][:kept_before_count])
                    
                    if after_count > 0:
                        new_indices.extend(segment['word_indices'][-after_count:])
                        
                    segment['word_indices'] = new_indices
                    segment['text'] = new_text
                    # Update timings based on new indices
                    if new_indices:
                        segment['start_time'] = self.words[new_indices[0]]['start']
                        segment['end_time'] = self.words[new_indices[-1]]['end']

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
                # No punctuation at all. 
                
                # 1. Check for trailing connectors (User Rule: Incomplete Sentences)
                word_indices = segment['word_indices']
                words_text = segment['text'].split()
                if words_text:
                    last_word = words_text[-1].lower()
                    trailing_connectors = ['and', 'but', 'so', 'or', 'then', 'because', 'the', 'a']
                    
                    if last_word in trailing_connectors:
                        # Trim the connector
                        # "I went to the store and" -> "I went to the store"
                        word_indices = word_indices[:-1]
                        segment['word_indices'] = word_indices
                        segment['text'] = ' '.join(words_text[:-1])
                        if word_indices:
                            segment['end_time'] = self.words[word_indices[-1]]['end']
                        logger.info(f"Trimmed trailing connector '{last_word}' from unpunctuated segment")

                # 2. If it's short and followed by a restart (or empty after trim), kill it.
                if len(segment['word_indices']) < 6 and i < len(segments) - 1:
                     continue
                
                if segment['word_indices']:
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
                    
                    # Condition 1: Next segment starts with a restart
                    if any(next_text.startswith(r) for r in restarts):
                        should_trim = True
                    
                    # Condition 2: Current segment trails off with a connector (User Rule: Incomplete Sentences)
                    # "I went to the store and..." [Pause causing split] -> Trim "and"
                    trailing_connectors = [
                        'and', 'but', 'so', 'or', 'then', 'because', 'the', 'a',
                        'almost', 'very', 'really', 'too', 'quite',
                        'is', 'are', 'was', 'were', 'am',
                        'in', 'on', 'at', 'for', 'with', 'by', 'of',
                        'if', 'when', 'while', 'because', 'although'
                    ]
                    last_word = trailing_words[-1].lower() if trailing_words else ""
                    if last_word in trailing_connectors:
                        should_trim = True
                        logger.info(f"Detected trail-off ending with '{last_word}'")
                
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
                # Contraction normalization
                t = t.lower()
                replacements = {
                    "you're": "you are", "i'm": "i am", "we're": "we are", "they're": "they are",
                    "it's": "it is", "he's": "he is", "she's": "she is", "that's": "that is",
                    "what's": "what is", "don't": "do not", "doesn't": "does not", "didn't": "did not",
                    "can't": "cannot", "won't": "will not", "isn't": "is not", "aren't": "are not",
                    "wasn't": "was not", "weren't": "were not", "i've": "i have", "you've": "you have",
                    "we've": "we have", "they've": "they have", "i'll": "i will", "you'll": "you will"
                }
                for k, v in replacements.items():
                    t = t.replace(k, v)
                    
                return re.sub(r'[^\w\s]', '', t).split()[:4]
            
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
                
                # STRICTER: Must match the full extracted prefix (up to 4 words)
                # This prevents "I really like apples" and "I really like oranges" from clustering
                if match_count == len(anchor_prefix) and match_count >= 3:
                     cluster.append(j)
            
            if len(cluster) > 1:
                # We have a retake cluster!
                # REVISED LOGIC (Divergent Endings Protection):
                # Instead of picking one winner and discarding all others, we check PAIRWISE.
                # We only discard 'A' if 'A' is clearly a false start of 'B' (or vice versa).
                #
                # Criteria for A superseding B:
                # 1. B is a substring of A (B is textually contained in A)
                # 2. A and B are highly similar (>85%) and A is longer/later
                # 3. B looks like a cut-off version of A (same start, B has no punctuation, A continues)
                
                # We'll mark indices to discard within this cluster
                cluster_discard = set()
                
                # Sort by index (chronological) to compare
                sorted_cluster = sorted(cluster)
                
                for idx_a in sorted_cluster:
                    if idx_a in cluster_discard: continue
                    
                    seg_a = segments[idx_a]
                    text_a = re.sub(r'[^\w\s]', '', seg_a['text'].lower())
                    
                    for idx_b in sorted_cluster:
                        if idx_a == idx_b: continue
                        if idx_b in cluster_discard: continue
                        
                        seg_b = segments[idx_b]
                        text_b = re.sub(r'[^\w\s]', '', seg_b['text'].lower())
                        
                        # CHECK: Does A supersede B? (Should B be deleted?)
                        should_delete_b = False
                        
                        # Rule 1: Substring (B is inside A)
                        if text_b in text_a and len(text_b) < len(text_a):
                            should_delete_b = True
                            logger.info(f"Consolidate: '{seg_b['text'][:20]}...' is substring of '{seg_a['text'][:20]}...' -> Delete B")
                            
                        # Rule 2: High Similarity (Duplicate takes)
                        elif self._calculate_similarity(seg_a['text'], seg_b['text']) > 0.85:
                            # If very similar, keep the later/longer one.
                            # Since we are iterating all pairs, we just need to decide if we kill B here.
                            # We prefer Later or Longer.
                            score_a = len(seg_a['word_indices']) + (idx_a * 0.1)
                            score_b = len(seg_b['word_indices']) + (idx_b * 0.1)
                            
                            if score_a > score_b:
                                should_delete_b = True
                                logger.info(f"Consolidate: '{seg_b['text'][:20]}...' similar to '{seg_a['text'][:20]}...' but worse score -> Delete B")
                                
                        # Rule 3: B is a prefix of A (cut off)
                        # We already know they share the 4-word prefix.
                        # Check if B is short and unpunctuated, while A is long and punctated.
                        elif len(seg_b['word_indices']) < len(seg_a['word_indices']) and \
                             not seg_b['text'].strip().endswith(('.', '!', '?')) and \
                             text_a.startswith(text_b):
                                should_delete_b = True
                                logger.info(f"Consolidate: '{seg_b['text'][:20]}...' is prefix of '{seg_a['text'][:20]}...' -> Delete B")

                        if should_delete_b:
                            cluster_discard.add(idx_b)
                            indices_to_discard.add(idx_b)

                self.stats['repetitions_removed'] += len(cluster_discard)
                
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
        Calculate sequence similarity.
        Also uses Semantic Keyword matching from ThoughtGrouper if available to catch rephrasings.
        """
        # 1. Structural Similarity (difflib)
        t1 = text1.lower().strip()
        t2 = text2.lower().strip()
        t1_clean = re.sub(r"[^\w\s']", '', t1)
        t2_clean = re.sub(r"[^\w\s']", '', t2)
        
        matcher = difflib.SequenceMatcher(None, t1_clean, t2_clean)
        struct_score = matcher.ratio()
        
        # 2. Semantic Keyword Similarity (Bag of Words)
        # This catches "I want to go" vs "I need to leave" (different structure, similar keywords)
        
        # Simple Jaccard implementation to avoid circular imports or heavy dependencies
        def get_keywords(text):
            stops = {'the','a','an','is','are','was','were','to','of','in','on','at','for','with','as','by','and','or','but','so','if','then','it','that','this','i','you','he','she','we','they'}
            words = set(re.sub(r"[^\w\s']", '', text.lower()).split())
            return {w for w in words if w not in stops and len(w) > 2}
            
        k1 = get_keywords(text1)
        k2 = get_keywords(text2)
        
        sem_score = 0.0
        if k1 and k2:
            intersection = len(k1 & k2)
            union = len(k1 | k2)
            sem_score = intersection / union
            
        # Return the higher of the two scores
        # We want to catch EITHER structural repetition OR semantic repetition
        return max(struct_score, sem_score)

    def _log_decisions(self, kept_segments: List[Dict]):
        """
        Log decisions to ML Data Collector.
        For Phase 1, we will just log the KEPT ones to build a baseline of "Good" segments.
        """
        if not self.use_ml: return
        
        project_id = "default_project" # To be passed in later
        
        for i, segment in enumerate(kept_segments):
            prev = kept_segments[i-1] if i > 0 else None
            next_seg = kept_segments[i+1] if i < len(kept_segments) - 1 else None
            
            try:
                features = self.feature_extractor.extract_features(segment, prev, next_seg)
                
                # We log "KEEP" because the heuristic kept it
                # We need exact start/end time from word indices
                start_time = self.words[segment['word_indices'][0]]['start']
                end_time = self.words[segment['word_indices'][-1]]['end']
                
                self.data_collector.log_decision(
                    project_id=project_id,
                    segment_id=f"seg_{segment['word_indices'][0]}",
                    start=start_time,
                    end=end_time,
                    features=features,
                    heuristic_decision="KEEP",
                    segment_text=segment['text']
                )
            except Exception as e:
                logger.warning(f"Failed to log ML decision: {e}")

    def _remove_phrase_stutters(self, segments: List[Dict]) -> List[Dict]:
        """
        Detects and removes immediate phrase repetitions within a segment.
        Example: "Well I have well I have already gone" -> "Well I have already gone"
        Rule: Identical sequence of words repeated immediately.
              Sequence length must be >= 2 words (preserves "very very happy").
        """
        cleaned_segments = []
        
        for segment in segments:
            # Reconstruct word objects for this segment
            # We need to modify word_indices to "delete" words
            # But since segments are defined by word_indices, we can just modify the list of indices
            
            indices = segment['word_indices']
            words_in_seg = [self.words[idx]['word'].lower().strip() for idx in indices]
            # Remove punctuation for comparison
            clean_words = [re.sub(r'[^\w\']', '', w) for w in words_in_seg]
            
            to_remove_local_indices = set()
            
            n = len(clean_words)
            i = 0
            while i < n:
                # Check for repetition of length k
                # Try lengths from max possible down to 2
                best_k = 0
                
                # Limit max phrase length to check (e.g., 6 words is a long stutter)
                max_k = min(6, (n - i) // 2)
                
                for k in range(max_k, 1, -1):
                    # Check if sequence [i:i+k] == [i+k:i+2k]
                    if i + 2*k <= n:
                        phrase1 = clean_words[i : i+k]
                        phrase2 = clean_words[i+k : i+2*k]
                        
                        if phrase1 == phrase2:
                            best_k = k
                            break
                
                if best_k > 0:
                    # Found a stutter of length best_k!
                    # Mark the FIRST occurrence for removal (i to i+best_k)
                    for offset in range(best_k):
                        to_remove_local_indices.add(i + offset)
                    
                    self.stats['phrase_stutters_removed'] += 1
                    logger.info(f"Phrase Stutter: Removed \"{' '.join(words_in_seg[i:i+best_k])}\" at {self.words[indices[i]]['start']:.1f}s")
                    
                    # Advance past the first part
                    i += best_k 
                    # We continue checking from the second part (in case it repeats 3 times?)
                    # If "A A A", we remove first A, then check second A...
                    # Current logic: Remove first "Well I have". Next loop checks second "Well I have".
                    # If 3rd exists, it will delete 2nd. Correct.
                else:
                    i += 1
            
            # Reconstruct segment
            new_indices = [idx for i, idx in enumerate(indices) if i not in to_remove_local_indices]
            
            if new_indices:
                segment['word_indices'] = new_indices
                segment['text'] = ' '.join([self.words[idx]['word'] for idx in new_indices])
                segment['start_time'] = self.words[new_indices[0]]['start']
                segment['end_time'] = self.words[new_indices[-1]]['end']
                cleaned_segments.append(segment)
                
        return cleaned_segments

    def _apply_ml_overrides(self, segments: List[Dict]) -> List[Dict]:
        """
        Apply trained ML model to filter segments.
        If model predicts 'CUT' with high confidence (>0.8), we remove the segment
        even if heuristics kept it.
        """
        if not segments or not self.ml_model or not self.ml_model.model:
            return segments
            
        kept = []
        removed_count = 0
        
        for i, segment in enumerate(segments):
            prev_seg = segments[i-1] if i > 0 else None
            next_seg = segments[i+1] if i < len(segments) - 1 else None
            
            # Predict CUT probability
            # 1.0 = Definite CUT
            # 0.0 = Definite KEEP
            prob_cut = self.ml_model.predict(segment, prev_seg, next_seg)
            
            # Threshold: 0.8 (conservative, only cut if very sure)
            if prob_cut > 0.8:
                removed_count += 1
                logger.info(f"ML Override: Removed segment at {segment['start_time']:.1f}s (Prob Cut: {prob_cut:.2f})")
            else:
                kept.append(segment)
                
        if removed_count > 0:
            logger.info(f"ML Model removed {removed_count} segments that heuristics would have kept.")
            
        return kept

    def _semantic_filtering(self, segments: List[Dict]) -> List[Dict]:
        """
        Integrates ThoughtGrouper to identify and remove repetitive thoughts 
        and fillers that string-matching might miss.
        """
        if not segments:
            return []

        # 1. Prepare words for ThoughtGrouper
        # Segments might have been modified/trimmed, so we need to reconstruct the word list
        all_words = []
        for seg in segments:
            for idx in seg['word_indices']:
                all_words.append(self.words[idx])

        # 2. Run ThoughtGrouper
        from thought_grouper import ThoughtGrouper
        grouper = ThoughtGrouper(all_words)
        thoughts = grouper.group_into_thoughts()

        # 3. Filter segments based on thought classification
        # We need to map segments back to thoughts or vice versa
        # For simplicity, we'll keep segments that belong to 'main_point' or 'tangent'
        # and discard 'repetition' or 'filler'.
        
        filtered_segments = []
        # Store segments by their word indices to easily check inclusion
        segments_by_first_idx = {seg['word_indices'][0]: seg for seg in segments}
        
        indices_to_remove = set()
        
        for i, thought in enumerate(thoughts):
            if thought['type'] == 'repetition':
                 # KEEP LAST LOGIC:
                 # If this is a repetition of an earlier thought, we remove the EARLIER thought (the source).
                 # And we keep THIS thought (promote it to main_point).
                 source_idx = thought.get('repeated_thought_idx')
                 
                 if source_idx is not None:
                     # Remove the source
                     # SAFEGUARD: Only remove if the repetition is substantial
                     # Determine if we are cutting a massive block for a small repetition
                     source_thought = thoughts[source_idx]
                     
                     # If source is huge (>50 words) and current is small (<10 words), likely a false positive match
                     if source_thought['word_count'] > 50 and thought['word_count'] < 10:
                         logger.info(f"Semantic Filter: ABORTED 'Keep Last'. Source {source_idx} is too big ({source_thought['word_count']} words) to be replaced by small repetition ({thought['word_count']} words).")
                     else:
                         indices_to_remove.add(source_idx)
                         logger.info(f"Semantic Filter: 'Keep Last' triggered. Removing source thought {source_idx} in favor of later version {i}.")
                         
                         # Promote current thought so it isn't removed in next pass (unless IT is later repeated)
                         thought['type'] = 'main_point' 
                 else:
                     # Fallback: If we don't know source, remove this one
                     if thought['word_count'] < 8:
                        indices_to_remove.add(i)
                        self.stats['repetitions_removed'] += 1

            elif thought['type'] == 'filler':
                 # Only delete small fillers
                 if thought['word_count'] <= 3 and thought['coherence_score'] < 0.6:
                     indices_to_remove.add(i)

        for i, thought in enumerate(thoughts):
            if i in indices_to_remove:
                logger.info(f"Semantic Filter: Discarding thought {i} ({thought['type']}): \"{thought['text'][:50]}...\"")
                continue
            
            # Find which segments belong to this thought
            # A thought can span multiple segments if they were split by punctuation/silence
            for idx in thought['word_indices']:
                if idx in segments_by_first_idx:
                    filtered_segments.append(segments_by_first_idx[idx])

        # Note: This logic assumes segments are whole units within thoughts.
        # Since _refine_segmentation splits by punctuation and ThoughGrouper merges by sentences, 
        # mapping by the first index of a segment should be reliable.
        
        return filtered_segments
    
    def _finalize_segments(self, segments: List[Dict]) -> List[Dict]:
        """
        Convert processed segments to final timeline format.
        Ensure no gaps at segment beginnings (tight pacing).
        """
        final = []
        
        # Padding in seconds (User Request: 0.3-0.5s natural pause)
        # We split it between start/end. 
        # Start: 0.15s, End: 0.25s -> Total ~0.4s padding between cuts
        PADDING_START = 0.15  
        PADDING_END = 0.25    
        
        for segment in segments:
            # Filter out words that are marked as deleted within the segment
            filtered_indices = [idx for idx in segment['word_indices'] if not self.words[idx].get('isDeleted', False)]
            
            if len(filtered_indices) < self.MIN_SEGMENT_LENGTH:
                # If skipping, log why if it's due to deletion
                if len(segment['word_indices']) >= self.MIN_SEGMENT_LENGTH:
                    logger.debug(f"Skipping segment at {segment['start_time']:.1f}s because too many words were flagged for deletion")
                continue
            
            # Actual start and end based on filtered words
            actual_start = self.words[filtered_indices[0]]['start']
            actual_end = self.words[filtered_indices[-1]]['end']
            
            # Apply padding but stay within word boundaries if it's the very first/last word of the asset
            padded_start = max(0, actual_start - PADDING_START)
            padded_end = actual_end + PADDING_END
            
            final.append({
                'start': padded_start,
                'end': padded_end,
                'text': ' '.join([self.words[idx]['word'] for idx in filtered_indices]),
                'word_count': len(filtered_indices),
                'word_indices': filtered_indices
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
