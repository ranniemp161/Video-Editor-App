"""
Smart word-level timestamp estimation from sentence-level timestamps.
Uses syllable counting and word length to estimate realistic word durations.
"""

import re
from typing import List, Dict

def count_syllables(word: str) -> int:
    """
    Estimate syllable count for a word.
    Simple heuristic: count vowel groups.
    """
    word = word.lower().strip()
    # Remove non-alphabetic characters for counting
    word = re.sub(r'[^a-z]', '', word)
    
    if len(word) <= 2:
        return 1
    
    # Count vowel groups (a, e, i, o, u, y)
    vowels = "aeiouy"
    syllable_count = 0
    previous_was_vowel = False
    
    for char in word:
        is_vowel = char in vowels
        if is_vowel and not previous_was_vowel:
            syllable_count += 1
        previous_was_vowel = is_vowel
    
    # Handle silent 'e' at the end
    if word.endswith('e') and syllable_count > 1:
        syllable_count -= 1
    
    # Minimum 1 syllable
    return max(1, syllable_count)

def estimate_word_duration(word: str) -> float:
    """
    Estimate how long a word takes to say in seconds.
    Based on syllable count and typical speech rate.
    
    Typical speech: ~4-5 syllables per second
    So 1 syllable ≈ 0.2-0.25 seconds
    """
    syllables = count_syllables(word)
    
    # Base duration per syllable (seconds)
    BASE_SYLLABLE_DURATION = 0.2
    
    # Short words (1-2 chars) are often said very quickly
    if len(word) <= 2:
        return 0.12
    
    # Estimate duration
    duration = syllables * BASE_SYLLABLE_DURATION
    
    # Add small gap for word boundaries (breathing, pauses)
    GAP = 0.05
    
    return duration + GAP

def distribute_word_timestamps(sentence_start: float, sentence_end: float, words: List[str]) -> List[Dict]:
    """
    Distribute word-level timestamps within a sentence timeframe.
    Uses smart estimation based on word length/syllables.
    
    Args:
        sentence_start: Start time of the sentence in seconds
        sentence_end: End time of the sentence in seconds
        words: List of words in the sentence
    
    Returns:
        List of dicts with {word, start, end, type}
    """
    if not words:
        return []
    
    # Calculate estimated duration for each word
    word_durations = [estimate_word_duration(w) for w in words]
    total_estimated_duration = sum(word_durations)
    
    # Calculate actual available time
    actual_duration = sentence_end - sentence_start
    
    # Scale factor to fit within actual time
    # If we estimated 3.5s but only have 2.0s, scale = 2.0/3.5 ≈ 0.57
    scale = actual_duration / total_estimated_duration if total_estimated_duration > 0 else 1.0
    
    # Distribute timestamps
    result = []
    current_time = sentence_start
    
    for i, word in enumerate(words):
        # Scaled duration for this word
        duration = word_durations[i] * scale
        
        # Ensure we don't exceed sentence_end
        end_time = min(current_time + duration, sentence_end)
        
        # Last word should align exactly with sentence_end
        if i == len(words) - 1:
            end_time = sentence_end
        
        result.append({
            "word": word,
            "start": current_time * 1000,  # Convert to ms for frontend
            "end": end_time * 1000,
            "type": "speech"
        })
        
        current_time = end_time
    
    return result
