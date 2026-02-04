import re
import numpy as np
import librosa
from typing import List, Dict, Optional
import os
import logging

logger = logging.getLogger(__name__)

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

def refine_word_timestamps_with_audio(words: List[Dict], audio_path: str, start_sec: float, end_sec: float) -> List[Dict]:
    """
    Refine existing word timestamps by snapping them to actual audio onsets and energy peaks.
    This is an enhancement, it won't move words radically but will "nudge" them for precision.
    """
    if not words or not os.path.exists(audio_path):
        return words

    try:
        # Load the specific audio segment
        duration = end_sec - start_sec
        if duration <= 0:
             return words
             
        y, sr = librosa.load(audio_path, offset=start_sec, duration=duration, sr=16000)
        
        if len(y) == 0:
            return words

        # 1. Get Onsets (start of sounds/syllables)
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        times = librosa.times_like(onset_env, sr=sr)
        onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, units='time')
        
        # 2. Get Energy (amplitude envelope)
        rms = librosa.feature.rms(y=y)[0]
        rms_times = librosa.times_like(rms, sr=sr)
        
        refined_words = []
        
        for word_dict in words:
            # Word times are in MS, convert to relative seconds for audio segment
            rel_start = (word_dict['start'] / 1000.0) - start_sec
            rel_end = (word_dict['end'] / 1000.0) - start_sec
            
            # Find nearest onset within a small window (+- 150ms)
            WINDOW = 0.15
            snapped_start = rel_start
            
            # Find closest onset to rel_start
            possible_onsets = [o for o in onsets if abs(o - rel_start) < WINDOW]
            if possible_onsets:
                # Pick the one with the highest onset strength nearby
                snapped_start = min(possible_onsets, key=lambda o: abs(o - rel_start))
            else:
                # If no onset, maybe look for energy rising?
                # For now, just keep original if no clear onset
                pass
            
            # Ensure we don't drift too far
            snapped_start = max(rel_start - WINDOW, min(rel_start + WINDOW, snapped_start))
            
            # Reconstruct word dict
            new_word = word_dict.copy()
            new_word['start'] = (snapped_start + start_sec) * 1000.0
            # Note: We don't snap the 'end' as aggressively to avoid overlapping next word
            # But we ensure it starts after Previous word end
            refined_words.append(new_word)

        # Post-process: Ensure no overlaps and maintain sequence
        for i in range(1, len(refined_words)):
            # If current start is before previous end, push it back or pull previous end forward
            if refined_words[i]['start'] < refined_words[i-1]['end']:
                # Simple fix: split the difference or just cap
                midpoint = (refined_words[i]['start'] + refined_words[i-1]['end']) / 2
                refined_words[i-1]['end'] = midpoint
                refined_words[i]['start'] = midpoint

        return refined_words

    except Exception as e:
        logger.error(f"Error refining timestamps: {e}")
        return words
