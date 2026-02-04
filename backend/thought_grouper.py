"""
Thought Grouper - Semantic grouping of word-level transcripts

Groups words into meaningful semantic units ("thoughts") based on:
- Natural pause analysis
- Sentence boundaries
- Semantic similarity
- Coherence scoring
"""

import logging
from typing import List, Dict, Set
import re

logger = logging.getLogger(__name__)


class ThoughtGrouper:
    def __init__(self, words: List[Dict]):
        """
        Initialize with word-level transcript.
        Words expected format: [{'word': str, 'start': float, 'end': float}, ...]
        Times in seconds.
        """
        self.words = words
        self.thoughts = []
        
        # Thresholds
        self.THOUGHT_PAUSE_THRESHOLD = 0.8  # 800ms pause = likely thought boundary
        self.SEMANTIC_SIMILARITY_THRESHOLD = 0.5  # 50% keyword overlap
        
        # Common stop words to ignore in semantic analysis
        self.STOP_WORDS = {
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
            'could', 'should', 'may', 'might', 'can', 'to', 'of', 'in',
            'on', 'at', 'for', 'with', 'as', 'by', 'from', 'and', 'or',
            'but', 'if', 'then', 'so', 'it', 'that', 'this', 'these',
            'those', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him',
            'her', 'us', 'them', 'my', 'your', 'his', 'her', 'our', 'their'
        }
    
    def group_into_thoughts(self) -> List[Dict]:
        """
        Main entry point - groups words into thoughts.
        Returns list of thought objects.
        """
        if not self.words:
            return []
        
        logger.info(f"Grouping {len(self.words)} words into thoughts")
        
        # Step 1: Group into sentences
        sentences = self._group_into_sentences()
        logger.info(f"Identified {len(sentences)} sentences")
        
        # Step 2: Merge sentences into thoughts based on pauses and semantics
        thoughts = self._merge_sentences_into_thoughts(sentences)
        logger.info(f"Grouped into {len(thoughts)} thoughts")
        
        # Step 3: Score coherence of each thought
        self._score_coherence(thoughts)
        
        # Step 4: Classify thought types
        self._classify_thought_types(thoughts)
        
        self.thoughts = thoughts
        return thoughts
    
    def _group_into_sentences(self) -> List[Dict]:
        """Group words into sentences based on punctuation and pauses."""
        sentences = []
        current_sentence_words = []
        start_idx = 0
        
        for i, word in enumerate(self.words):
            current_sentence_words.append(i)
            
            # Check for sentence-ending punctuation
            word_text = word['word'].rstrip()
            ends_with_punctuation = word_text.endswith(('.', '!', '?'))
            
            # Check for significant pause after this word
            has_pause = False
            if i < len(self.words) - 1:
                gap = self.words[i + 1]['start'] - word['end']
                has_pause = gap > 0.5  # 500ms pause
            
            # End sentence if punctuation OR significant pause
            if ends_with_punctuation or (has_pause and len(current_sentence_words) > 3):
                sentences.append({
                    'word_indices': current_sentence_words,
                    'start_idx': start_idx,
                    'end_idx': i,
                    'start_time': self.words[start_idx]['start'],
                    'end_time': word['end'],
                    'text': ' '.join([self.words[idx]['word'] for idx in current_sentence_words])
                })
                current_sentence_words = []
                start_idx = i + 1
        
        # Add remaining words as a sentence
        if current_sentence_words:
            sentences.append({
                'word_indices': current_sentence_words,
                'start_idx': start_idx,
                'end_idx': len(self.words) - 1,
                'start_time': self.words[start_idx]['start'],
                'end_time': self.words[-1]['end'],
                'text': ' '.join([self.words[idx]['word'] for idx in current_sentence_words])
            })
        
        return sentences
    
    def _merge_sentences_into_thoughts(self, sentences: List[Dict]) -> List[Dict]:
        """
        Merge related sentences into coherent thoughts.
        Uses pause analysis and semantic similarity.
        """
        if not sentences:
            return []
        
        thoughts = []
        current_thought_sentences = [sentences[0]]
        
        for i in range(1, len(sentences)):
            prev_sentence = sentences[i - 1]
            curr_sentence = sentences[i]
            
            # Check pause between sentences
            pause = curr_sentence['start_time'] - prev_sentence['end_time']
            
            # Check semantic similarity
            similarity = self._calculate_semantic_similarity(
                prev_sentence['text'],
                curr_sentence['text']
            )
            
            # Decide whether to merge or start new thought
            should_merge = (
                pause < self.THOUGHT_PAUSE_THRESHOLD or  # Short pause
                similarity > self.SEMANTIC_SIMILARITY_THRESHOLD  # Semantically related
            )
            
            if should_merge:
                # Add to current thought
                current_thought_sentences.append(curr_sentence)
            else:
                # Finalize current thought and start new one
                thoughts.append(self._create_thought_from_sentences(current_thought_sentences))
                current_thought_sentences = [curr_sentence]
        
        # Add final thought
        if current_thought_sentences:
            thoughts.append(self._create_thought_from_sentences(current_thought_sentences))
        
        return thoughts
    
    def _create_thought_from_sentences(self, sentences: List[Dict]) -> Dict:
        """Create a thought object from a list of sentences."""
        all_word_indices = []
        for sent in sentences:
            all_word_indices.extend(sent['word_indices'])
        
        return {
            'word_indices': all_word_indices,
            'start_idx': sentences[0]['start_idx'],
            'end_idx': sentences[-1]['end_idx'],
            'start_time': sentences[0]['start_time'],
            'end_time': sentences[-1]['end_time'],
            'text': ' '.join([sent['text'] for sent in sentences]),
            'sentence_count': len(sentences),
            'word_count': len(all_word_indices),
            'coherence_score': 0.0,  # Will be calculated
            'type': 'unknown'  # Will be classified
        }
    
    def _calculate_semantic_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate semantic similarity between two text strings.
        Returns 0.0 to 1.0 (higher = more similar).
        """
        # Extract keywords (remove stop words)
        keywords1 = self._extract_keywords(text1)
        keywords2 = self._extract_keywords(text2)
        
        if not keywords1 or not keywords2:
            return 0.0
        
        # Calculate Jaccard similarity
        intersection = len(keywords1 & keywords2)
        union = len(keywords1 | keywords2)
        
        return intersection / union if union > 0 else 0.0
    
    def _extract_keywords(self, text: str) -> Set[str]:
        """Extract meaningful keywords from text."""
        # Lowercase and remove punctuation
        text = text.lower()
        text = re.sub(r'[^\w\s]', '', text)
        
        # Split into words and filter stop words
        words = text.split()
        keywords = {w for w in words if w not in self.STOP_WORDS and len(w) > 2}
        
        return keywords
    
    def _score_coherence(self, thoughts: List[Dict]):
        """
        Score each thought for coherence/completeness.
        Higher score = more coherent/complete thought.
        """
        for thought in thoughts:
            score = 0.5  # Base score
            
            # Factor 1: Has complete sentence structure?
            text = thought['text']
            has_subject_verb = self._has_subject_verb(text)
            if has_subject_verb:
                score += 0.2
            
            # Factor 2: Ends with proper punctuation?
            if text.rstrip().endswith(('.', '!', '?')):
                score += 0.15
            
            # Factor 3: Not too short (at least 3 words)
            if thought['word_count'] >= 3:
                score += 0.1
            
            # Factor 4: Not too long (reasonable thought length)
            if 3 <= thought['word_count'] <= 30:
                score += 0.05
            
            # Clamp to 0.0-1.0
            thought['coherence_score'] = min(1.0, max(0.0, score))
    
    def _has_subject_verb(self, text: str) -> bool:
        """
        Simple heuristic to check if text has subject-verb structure.
        This is a simplified check - a real implementation would use NLP.
        """
        words = text.lower().split()
        
        # Common pronouns (subjects)
        subjects = {'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that'}
        
        # Common verbs
        verbs = {
            'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did',
            'will', 'would', 'could', 'should', 'can', 'may',
            'go', 'goes', 'went', 'come', 'came', 'get', 'got',
            'make', 'made', 'see', 'saw', 'know', 'knew', 'think',
            'want', 'need', 'like', 'love', 'hate'
        }
        
        has_subject = any(w in subjects for w in words)
        has_verb = any(w in verbs for w in words)
        
        return has_subject or has_verb  # Either is good enough
    
    def _classify_thought_types(self, thoughts: List[Dict]):
        """
        Classify each thought into types:
        - main_point: High coherence, substantial content
        - tangent: Low semantic similarity to surrounding thoughts
        - filler: Very short, low coherence
        - repetition: High similarity to ANY previous thought (not just consecutive)
        """
        for i, thought in enumerate(thoughts):
            # Default classification
            thought_type = 'main_point'
            
            # Check if it's a filler (short and low coherence)
            if thought['word_count'] < 3 and thought['coherence_score'] < 0.5:
                thought_type = 'filler'
            
            # Check if it's a repetition - scan ALL previous thoughts within a reasonable window
            elif i > 0:
                # Look back at all previous thoughts (not just immediate previous)
                # Use a sliding window of last 20 thoughts or all if fewer
                window_start = max(0, i - 20)
                prev_thoughts = thoughts[window_start:i]
                
                for prev_thought in prev_thoughts:
                    # Calculate semantic similarity
                    similarity = self._calculate_semantic_similarity(
                        thought['text'],
                        prev_thought['text']
                    )
                    
                    # Also check for exact phrase repeats (word-for-word)
                    exact_match = self._check_exact_phrase_match(
                        thought['text'],
                        prev_thought['text']
                    )
                    
                    # Mark as repetition if:
                    # - Very high semantic similarity (>0.6) OR
                    # - Has exact phrase matches of significant length
                    if similarity > 0.6 or exact_match:
                        thought_type = 'repetition'
                        logger.info(f"Repetition detected at {thought['start_time']:.1f}s "
                                  f"(similar to {prev_thought['start_time']:.1f}s, "
                                  f"similarity={similarity:.2f})")
                        break
            
            # Check if it's a tangent (low similarity to neighbors)
            if thought_type == 'main_point' and i > 0 and i < len(thoughts) - 1:
                prev_thought = thoughts[i - 1]
                next_thought = thoughts[i + 1]
                
                prev_sim = self._calculate_semantic_similarity(thought['text'], prev_thought['text'])
                next_sim = self._calculate_semantic_similarity(thought['text'], next_thought['text'])
                
                if prev_sim < 0.2 and next_sim < 0.2:
                    thought_type = 'tangent'
            
            thought['type'] = thought_type
    
    def _check_exact_phrase_match(self, text1: str, text2: str) -> bool:
        """
        Check if text1 and text2 share exact phrase matches of significant length.
        Returns True if they have matching sequences of 4+ words.
        """
        # Normalize texts
        words1 = text1.lower().split()
        words2 = text2.lower().split()
        
        # Check for matching sequences of at least 4 words
        min_sequence_length = 4
        
        for i in range(len(words1) - min_sequence_length + 1):
            # Get a sequence of 4+ words from text1
            sequence = ' '.join(words1[i:i + min_sequence_length])
            # Check if this sequence appears in text2
            if sequence in text2.lower():
                return True
        
        return False
    
    def get_thought_summary(self) -> Dict:
        """Get statistics about the thought grouping."""
        if not self.thoughts:
            return {}
        
        type_counts = {}
        for thought in self.thoughts:
            t = thought['type']
            type_counts[t] = type_counts.get(t, 0) + 1
        
        avg_coherence = sum(t['coherence_score'] for t in self.thoughts) / len(self.thoughts)
        
        return {
            'total_thoughts': len(self.thoughts),
            'total_words': len(self.words),
            'avg_words_per_thought': len(self.words) / len(self.thoughts),
            'avg_coherence': round(avg_coherence, 2),
            'type_distribution': type_counts,
            'total_duration': self.thoughts[-1]['end_time'] - self.thoughts[0]['start_time']
        }
