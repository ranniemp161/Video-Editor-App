"""
Professional Rough Cut Algorithm
Creates publication-quality rough cuts from talking-head videos.

Features:
- Silence & pause management (>2s removed, 0.3-0.5s preserved)
- Repetition detection (verbatim and semantic, keeps LAST version)
- "Cut that" signal processing
- Incomplete sentence handling
"""

import logging
from typing import List, Dict, Tuple, Optional
import re

logger = logging.getLogger(__name__)

class ProfessionalRoughCut:
    def __init__(self, words: List[Dict]):
        """
        Initialize with word-level transcript.
        Words expected format: [{'word': str, 'start': float, 'end': float}, ...]
        Times in seconds.
        """
        self.words = words
        self.segments = []
        self.deletions = []  # Ranges to mark for deletion
        self.stats = {
            'silences_removed': 0,
            'silence_duration_removed': 0.0,
            'repetitions_removed': 0,
            'cut_that_signals': 0,
            'incomplete_sentences': 0
        }
    
    # ====== PASS 1: SILENCE DETECTION ======
    
    def detect_silences(self) -> List[Dict]:
        """
        Detect gaps between words.
        Returns list of silence info with cutting decision.
        """
        silences = []
        
        for i in range(len(self.words) - 1):
            current_end = self.words[i]['end']
            next_start = self.words[i + 1]['start']
            gap = next_start - current_end
            
            if gap > 2.0:  # More than 2 seconds
                silences.append({
                    'after_word_index': i,
                    'duration': gap,
                    'should_cut': True,
                    'type': 'long_silence'
                })
                self.stats['silences_removed'] += 1
                self.stats['silence_duration_removed'] += gap
                
            elif 0.3 <= gap <= 0.5:  # Natural pause
                silences.append({
                    'after_word_index': i,
                    'duration': gap,
                    'should_cut': False,
                    'type': 'natural_pause'
                })
        
        logger.info(f"Detected {len([s for s in silences if s['should_cut']])} long silences to cut")
        return silences
    
    # ====== PASS 2: "CUT THAT" SIGNAL PROCESSING ======
    
    def process_cut_that_signals(self):
        """
        Find "Cut that" phrases and mark content for deletion.
        """
        i = 0
        while i < len(self.words) - 1:
            word = self.words[i]
            next_word = self.words[i + 1] if i + 1 < len(self.words) else None
            
            # Detect "cut that" (case-insensitive)
            if (word['word'].lower().strip('.,!?') == 'cut' and 
                next_word and next_word['word'].lower().strip('.,!?') == 'that'):
                
                logger.info(f"Found 'Cut that' signal at {word['start']:.2f}s")
                
                # Find last sentence ending before this
                sentence_end_idx = self._find_last_sentence_end_before(i)
                
                # Mark for deletion: from sentence end to "cut that" phrase
                self.deletions.append({
                    'start_idx': sentence_end_idx + 1,
                    'end_idx': i + 1,  # Through "that"
                    'reason': 'cut_that_signal',
                    'start_time': self.words[sentence_end_idx + 1]['start'],
                    'end_time': self.words[i + 1]['end']
                })
                
                self.stats['cut_that_signals'] += 1
                i += 2  # Skip past "that"
                continue
            
            i += 1
    
    def _find_last_sentence_end_before(self, current_idx: int) -> int:
        """Find the index of the last word ending with sentence punctuation."""
        for i in range(current_idx - 1, -1, -1):
            word_text = self.words[i]['word'].rstrip()
            if word_text.endswith(('.', '!', '?')):
                return i
        
        # Fallback: 10 words back or start of transcript
        return max(0, current_idx - 10)
    
    # ====== PASS 3: INCOMPLETE SENTENCE DETECTION ======
    
    def detect_incomplete_sentences(self, silences: List[Dict]):
        """
        Find sentences that trail off or are abandoned.
        """
        silence_map = {s['after_word_index']: s for s in silences}
        
        i = 0
        while i < len(self.words):
            word = self.words[i]
            
            # Check if word doesn't end a sentence
            if not word['word'].rstrip().endswith(('.', '!', '?')):
                # Check if followed by long silence
                if i in silence_map and silence_map[i]['should_cut']:
                    # Likely abandoned thought
                    sentence_start_idx = self._find_sentence_start(i)
                    
                    # Don't mark if already deleted
                    if not self._is_already_deleted(sentence_start_idx, i):
                        self.deletions.append({
                            'start_idx': sentence_start_idx,
                            'end_idx': i,
                            'reason': 'incomplete_sentence',
                            'start_time': self.words[sentence_start_idx]['start'],
                            'end_time': self.words[i]['end']
                        })
                        self.stats['incomplete_sentences'] += 1
                        logger.info(f"Detected incomplete sentence at {word['start']:.2f}s")
            
            i += 1
    
    def _find_sentence_start(self, current_idx: int) -> int:
        """Find the start of the current sentence."""
        for i in range(current_idx - 1, -1, -1):
            word_text = self.words[i]['word'].rstrip()
            if word_text.endswith(('.', '!', '?')):
                return i + 1
        return max(0, current_idx - 15)  # Fallback
    
    def _is_already_deleted(self, start_idx: int, end_idx: int) -> bool:
        """Check if range overlaps with existing deletions."""
        for deletion in self.deletions:
            if not (end_idx < deletion['start_idx'] or start_idx > deletion['end_idx']):
                return True
        return False
    
    # ====== PASS 4: REPETITION DETECTION ======
    
    def detect_repetitions(self):
        """
        Detect both verbatim and semantic repetitions.
        Keep LAST version, remove earlier attempts.
        """
        # A. Verbatim Repetition (n-gram matching)
        self._detect_verbatim_repetitions(min_length=3, max_length=10)
        
        # B. Semantic Repetition (simple heuristics)
        self._detect_semantic_repetitions()
    
    def _detect_verbatim_repetitions(self, min_length: int = 3, max_length: int = 10):
        """Find exact word-for-word repetitions using n-grams."""
        seen_phrases = {}  # phrase -> last occurrence start_idx
        
        for length in range(max_length, min_length - 1, -1):  # Longest first
            for i in range(len(self.words) - length + 1):
                # Skip if already marked for deletion
                if self._is_range_deleted(i, i + length - 1):
                    continue
                
                # Create phrase from n-gram
                phrase = ' '.join([w['word'].lower().strip('.,!?') 
                                  for w in self.words[i:i + length]])
                
                if phrase in seen_phrases:
                    # Found repetition! Mark EARLIER occurrence for deletion
                    earlier_idx = seen_phrases[phrase]
                    
                    # Only delete if not too far apart (within 60s = likely same context)
                    time_diff = self.words[i]['start'] - self.words[earlier_idx]['start']
                    if time_diff < 60:
                        self.deletions.append({
                            'start_idx': earlier_idx,
                            'end_idx': earlier_idx + length - 1,
                            'reason': f'verbatim_repetition_{length}words',
                            'start_time': self.words[earlier_idx]['start'],
                            'end_time': self.words[earlier_idx + length - 1]['end']
                        })
                        self.stats['repetitions_removed'] += 1
                        logger.info(f"Verbatim repetition ({length} words) at {self.words[i]['start']:.2f}s, removing earlier at {self.words[earlier_idx]['start']:.2f}s")
                
                # Update with latest occurrence
                seen_phrases[phrase] = i
    
    def _detect_semantic_repetitions(self):
        """
        Detect when the same idea is expressed differently.
        Simple heuristics: shared keywords + temporal proximity.
        """
        # Group words into sentences
        sentences = self._group_into_sentences()
        
        for i in range(len(sentences)):
            for j in range(i + 1, len(sentences)):
                sent_i = sentences[i]
                sent_j = sentences[j]
                
                # Check temporal proximity (within 30s)
                time_diff = sent_j['start_time'] - sent_i['start_time']
                if time_diff > 30:
                    continue
                
                # Calculate keyword overlap
                words_i = set(w.lower().strip('.,!?') for w in sent_i['words'])
                words_j = set(w.lower().strip('.,!?') for w in sent_j['words'])
                
                # Remove common stop words
                stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 
                             'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
                             'could', 'should', 'may', 'might', 'can', 'to', 'of', 'in',
                             'on', 'at', 'for', 'with', 'as', 'by', 'from', 'and', 'or', 'but'}
                words_i -= stop_words
                words_j -= stop_words
                
                if len(words_i) == 0 or len(words_j) == 0:
                    continue
                
                # Calculate overlap percentage
                overlap = len(words_i & words_j) / max(len(words_i), len(words_j))
                
                if overlap > 0.6:  # >60% keyword overlap
                    # Likely semantic repetition - keep LAST (j), delete FIRST (i)
                    if not self._is_range_deleted(sent_i['start_idx'], sent_i['end_idx']):
                        self.deletions.append({
                            'start_idx': sent_i['start_idx'],
                            'end_idx': sent_i['end_idx'],
                            'reason': 'semantic_repetition',
                            'start_time': sent_i['start_time'],
                            'end_time': sent_i['end_time']
                        })
                        self.stats['repetitions_removed'] += 1
                        logger.info(f"Semantic repetition detected: removing sentence at {sent_i['start_time']:.2f}s")
    
    def _group_into_sentences(self) -> List[Dict]:
        """Group words into sentences based on punctuation."""
        sentences = []
        current_sentence = []
        start_idx = 0
        
        for i, word in enumerate(self.words):
            current_sentence.append(word['word'])
            
            if word['word'].rstrip().endswith(('.', '!', '?')):
                # End of sentence
                sentences.append({
                    'words': current_sentence,
                    'start_idx': start_idx,
                    'end_idx': i,
                    'start_time': self.words[start_idx]['start'],
                    'end_time': self.words[i]['end']
                })
                current_sentence = []
                start_idx = i + 1
        
        # Add remaining words as a sentence
        if current_sentence:
            sentences.append({
                'words': current_sentence,
                'start_idx': start_idx,
                'end_idx': len(self.words) - 1,
                'start_time': self.words[start_idx]['start'],
                'end_time': self.words[-1]['end']
            })
        
        return sentences
    
    def _is_range_deleted(self, start_idx: int, end_idx: int) -> bool:
        """Check if any part of range is deleted."""
        for deletion in self.deletions:
            if not (end_idx < deletion['start_idx'] or start_idx > deletion['end_idx']):
                return True
        return False
    
    # ====== PASS 5: SEGMENT CREATION ======
    
    def create_segments(self, silences: List[Dict]) -> List[Dict]:
        """
        Generate final segments from kept content.
        Split at long silences, ensure no leading silence.
        """
        # Create deletion mask
        deleted_indices = set()
        for deletion in self.deletions:
            for i in range(deletion['start_idx'], deletion['end_idx'] + 1):
                deleted_indices.add(i)
        
        # Build segments
        segments = []
        current_segment = []
        
        for i, word in enumerate(self.words):
            # Skip deleted words
            if i in deleted_indices:
                if current_segment:
                    # Finalize current segment
                    segments.append(self._finalize_segment(current_segment))
                    current_segment = []
                continue
            
            # Add word to current segment
            current_segment.append(word)
            
            # Check if we should split after this word (long silence)
            silence_after = next((s for s in silences if s['after_word_index'] == i), None)
            if silence_after and silence_after['should_cut']:
                # End segment here
                segments.append(self._finalize_segment(current_segment))
                current_segment = []
        
        # Add final segment
        if current_segment:
            segments.append(self._finalize_segment(current_segment))
        
        logger.info(f"Created {len(segments)} segments from {len(self.words)} words")
        return segments
    
    def _finalize_segment(self, words: List[Dict]) -> Dict:
        """Create segment dict from word list."""
        if not words:
            return None
        
        # Add small padding for smooth cuts
        PADDING = 0.05  # 50ms
        
        return {
            'start': max(0, words[0]['start'] - PADDING),
            'end': words[-1]['end'] + PADDING,
            'text': ' '.join([w['word'] for w in words]),
            'word_count': len(words),
            'type': 'speech'
        }
    
    # ====== MAIN ANALYSIS PIPELINE ======
    
    def analyze(self) -> List[Dict]:
        """
        Run full analysis pipeline.
        Returns list of segments ready for timeline.
        """
        logger.info(f"Starting professional rough cut analysis on {len(self.words)} words")
        
        # Pass 1: Detect silences
        silences = self.detect_silences()
        
        # Pass 2: Process "Cut that" signals
        self.process_cut_that_signals()
        
        # Pass 3: Detect incomplete sentences
        self.detect_incomplete_sentences(silences)
        
        # Pass 4: Detect repetitions
        self.detect_repetitions()
        
        # Pass 5: Create segments
        self.segments = self.create_segments(silences)
        
        # Log statistics
        logger.info(f"Analysis complete: {self.stats}")
        
        return self.segments
    
    def get_statistics(self) -> Dict:
        """Return analysis statistics."""
        original_duration = self.words[-1]['end'] - self.words[0]['start'] if self.words else 0
        final_duration = sum(s['end'] - s['start'] for s in self.segments)
        
        return {
            **self.stats,
            'original_duration': round(original_duration, 2),
            'final_duration': round(final_duration, 2),
            'time_saved': round(original_duration - final_duration, 2),
            'reduction_percentage': round((1 - final_duration / original_duration) * 100, 1) if original_duration > 0 else 0,
            'segment_count': len(self.segments)
        }
