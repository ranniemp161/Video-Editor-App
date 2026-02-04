"""
Semantic Rough Cut - Thought-aware rough cut analyzer

Integrates with ThoughtGrouper to create rough cuts that:
- Always cut at thought boundaries (never mid-thought)
- Remove semantically duplicate thoughts
- Filter low-coherence/incomplete thoughts
- Preserve natural flow between thoughts
"""

import logging
from typing import List, Dict, Optional
from thought_grouper import ThoughtGrouper

logger = logging.getLogger(__name__)


class SemanticRoughCut:
    def __init__(self, words: List[Dict]):
        """
        Initialize with word-level transcript.
        Words expected format: [{'word': str, 'start': float, 'end': float}, ...]
        Times in seconds.
        """
        self.words = words
        self.grouper = ThoughtGrouper(words)
        self.thoughts = []
        self.kept_thoughts = []
        self.removed_thoughts = []
        
        self.stats = {
            'total_thoughts': 0,
            'kept_thoughts': 0,
            'removed_duplicates': 0,
            'removed_low_coherence': 0,
            'removed_fillers': 0,
            'removed_incomplete': 0
        }
    
    def analyze(self) -> List[Dict]:
        """
        Run semantic rough cut analysis.
        Returns list of segments (kept thoughts).
        """
        logger.info(f"Starting semantic rough cut on {len(self.words)} words")
        
        # Step 1: Group words into thoughts
        self.thoughts = self.grouper.group_into_thoughts()
        self.stats['total_thoughts'] = len(self.thoughts)
        
        logger.info(f"Grouped into {len(self.thoughts)} thoughts")
        
        # Step 2: Filter thoughts based on quality and redundancy
        self.kept_thoughts = self._filter_thoughts()
        self.stats['kept_thoughts'] = len(self.kept_thoughts)
        
        logger.info(f"Kept {len(self.kept_thoughts)} thoughts after filtering")
        
        # Step 3: Convert kept thoughts to segments
        segments = self._thoughts_to_segments()
        
        logger.info(f"Generated {len(segments)} segments")
        
        return segments
    
    def _filter_thoughts(self) -> List[Dict]:
        """
        Filter thoughts based on quality criteria.
        Returns list of thoughts to keep.
        """
        kept = []
        
        for i, thought in enumerate(self.thoughts):
            should_keep = True
            removal_reason = None
            
            # Rule 1: Remove filler thoughts (low coherence, very short)
            if thought['type'] == 'filler':
                should_keep = False
                removal_reason = 'filler'
                self.stats['removed_fillers'] += 1
            
            # Rule 2: Remove low coherence thoughts
            elif thought['coherence_score'] < 0.4:
                should_keep = False
                removal_reason = 'low_coherence'
                self.stats['removed_low_coherence'] += 1
            
            # Rule 3: Remove ALL repetitions (already classified by thought_grouper)
            elif thought['type'] == 'repetition':
                should_keep = False
                removal_reason = 'duplicate'
                self.stats['removed_duplicates'] += 1
                logger.info(f"Removing repetition at {thought['start_time']:.1f}s: \"{thought['text'][:50]}...\"")
            
            # Rule 4: Remove incomplete thoughts (doesn't end with punctuation, low coherence)
            elif not thought['text'].rstrip().endswith(('.', '!', '?')) and thought['coherence_score'] < 0.6:
                should_keep = False
                removal_reason = 'incomplete'
                self.stats['removed_incomplete'] += 1
            
            if should_keep:
                kept.append(thought)
            else:
                thought['removal_reason'] = removal_reason
                self.removed_thoughts.append(thought)
        
        return kept
    
    def _thoughts_to_segments(self) -> List[Dict]:
        """
        Convert kept thoughts to timeline segments.
        Adds small padding for smooth cuts.
        """
        segments = []
        PADDING = 0.05  # 50ms padding
        
        for thought in self.kept_thoughts:
            segment = {
                'start': max(0, thought['start_time'] - PADDING),
                'end': thought['end_time'] + PADDING,
                'text': thought['text'],
                'word_count': thought['word_count'],
                'word_indices': thought['word_indices'],
                'coherence_score': thought['coherence_score'],
                'type': thought['type']
            }
            segments.append(segment)
        
        return segments
    
    def get_statistics(self) -> Dict:
        """Return analysis statistics."""
        if not self.thoughts:
            return self.stats
        
        original_duration = self.thoughts[-1]['end_time'] - self.thoughts[0]['start_time']
        
        if self.kept_thoughts:
            final_duration = sum(
                t['end_time'] - t['start_time']
                for t in self.kept_thoughts
            )
        else:
            final_duration = 0
        
        thought_summary = self.grouper.get_thought_summary()
        
        return {
            **self.stats,
            'original_duration': round(original_duration, 2),
            'final_duration': round(final_duration, 2),
            'time_saved': round(original_duration - final_duration, 2),
            'reduction_percentage': round(
                (1 - final_duration / original_duration) * 100, 1
            ) if original_duration > 0 else 0,
            'avg_coherence': thought_summary.get('avg_coherence', 0),
            'avg_words_per_thought': thought_summary.get('avg_words_per_thought', 0)
        }
    
    def get_thoughts_metadata(self) -> Dict:
        """
        Return thought metadata for frontend visualization.
        This allows the frontend to show thought boundaries.
        """
        return {
            'thoughts': [
                {
                    'id': i,
                    'start_time': t['start_time'],
                    'end_time': t['end_time'],
                    'text': t['text'],
                    'word_indices': t['word_indices'],
                    'word_count': t['word_count'],
                    'coherence_score': t['coherence_score'],
                    'type': t['type'],
                    'is_kept': t in self.kept_thoughts
                }
                for i, t in enumerate(self.thoughts)
            ],
            'summary': self.grouper.get_thought_summary()
        }


def integrate_with_professional_rough_cut(words: List[Dict], use_thoughts: bool = True) -> tuple:
    """
    Helper function to integrate semantic rough cut with professional rough cut.
    
    Returns:
        (segments, statistics, thought_metadata)
    """
    if not use_thoughts:
        # Fall back to existing professional rough cut
        from professional_rough_cut import ProfessionalRoughCut
        rough_cut = ProfessionalRoughCut(words)
        segments = rough_cut.analyze()
        stats = rough_cut.get_statistics()
        return segments, stats, None
    
    # Use thought-based semantic rough cut
    semantic_cut = SemanticRoughCut(words)
    segments = semantic_cut.analyze()
    stats = semantic_cut.get_statistics()
    thought_metadata = semantic_cut.get_thoughts_metadata()
    
    return segments, stats, thought_metadata
