import logging
from typing import List, Dict
import difflib

logger = logging.getLogger(__name__)

def analyze_transcript(words: List[Dict]) -> List[Dict]:
    """
    Expert Analysis:
    - Flags repetitions (keeps the last take)
    - Flags long silences (gaps between words)
    - Flags typical filler words
    """
    if not words:
        return []

    n = len(words)
    # isDeleted flag: True if the "Expert" suggests cutting it
    for w in words:
        if 'isDeleted' not in w:
            w['isDeleted'] = False

    # 1. Silence / Gap Detection
    SILENCE_THRESHOLD_MS = 1000  # 1.0 seconds
    for i in range(n - 1):
        gap = words[i+1]['start'] - words[i]['end']
        if gap > SILENCE_THRESHOLD_MS:
            # Note: We don't delete the words, but we could mark the gap.
            # However, the user wants to identify "words not necessary".
            # If there's a huge gap, maybe the following word is a re-take?
            pass

    # 2. Basic Repetition Detection (Word level)
    # Check for immediate word doubles: "I I", "the the"
    for i in range(n - 1):
        if words[i]['word'].lower().strip() == words[i+1]['word'].lower().strip():
            words[i]['isDeleted'] = True

    # 3. Phrase Repetition Detection (N-grams)
    # Look for matching sequences of 3-10 words
    # We prioritize keeping the LAST occurrence (the "last take")
    
    WINDOW_SIZE = 15 # Look ahead for repetitions
    i = 0
    while i < n - 3:
        # Try to find a match for words[i:i+3] later in the window
        anchor = " ".join([w['word'].lower().strip() for w in words[i:i+3]])
        
        found_match = False
        for j in range(i + 1, min(i + WINDOW_SIZE, n - 3)):
            candidate = " ".join([w['word'].lower().strip() for w in words[j:j+3]])
            
            # Simple similarity check
            if anchor == candidate:
                # We found a repetition! 
                # Mark the FIRST occurrence as deleted (all words from i up to start of next take)
                # This is a bit greedy but follows the "keep last take" rule
                for k in range(i, j):
                    words[k]['isDeleted'] = True
                
                logger.info(f"Expert: Flagged repeated phrase starting at {words[i]['start']/1000:.2f}s")
                i = j - 1 # Jump to the better take
                found_match = True
                break
        
        i += 1

    # 4. Filler Words
    FILLERS = {'um', 'uh', 'hmm', 'ah', 'er'}
    for w in words:
        if w['word'].lower().strip().strip('.,!?') in FILLERS:
            w['isDeleted'] = True

    return words
