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
    # PROTECT: Don't cut small emphasis words (very, very, long, long)
    EXCLUDE_DOUBLES = {'very', 'long', 'great', 'more', 'some'}
    for i in range(n - 1):
        w1 = words[i]['word'].lower().strip().strip('.,!?')
        w2 = words[i+1]['word'].lower().strip().strip('.,!?')
        if w1 == w2 and w1 not in EXCLUDE_DOUBLES:
            words[i]['isDeleted'] = True

    # 3. Phrase Repetition Detection (Sequence aware)
    # We prioritize keeping the LAST occurrence
    WINDOW_SIZE = 15 # Look ahead
    i = 0
    while i < n - 4:
        # Check sequences of 4 words (shorter is too risky for aggressive cuts)
        anchor_words = [w['word'].lower().strip().strip('.,!?') for w in words[i:i+4]]
        anchor_text = " ".join(anchor_words)
        
        found_match = False
        for j in range(i + 1, min(i + WINDOW_SIZE, n - 4)):
            candidate_words = [w['word'].lower().strip().strip('.,!?') for w in words[j:j+4]]
            candidate_text = " ".join(candidate_words)
            
            # Use SequenceMatcher for more reliable phrase comparison
            similarity = difflib.SequenceMatcher(None, anchor_text, candidate_text).ratio()
            
            if similarity > 0.9: # 90% match for 4-word sequences
                # Found a repetition! Mark the EARLIER take.
                for k in range(i, j):
                    words[k]['isDeleted'] = True
                
                logger.info(f"Expert: Flagged repeated phrase starting at {words[i]['start']/1000:.2f}s")
                i = j - 1
                found_match = True
                break
        i += 1

    # 4. Global Incremental Takes (Stuttered Restarts)
    # Marks words in early takes as deleted if they build into a later take
    i = 0
    while i < n - 10:
        anchor_prefix = " ".join([w['word'].lower().strip().strip('.,!?') for w in words[i:i+4]])
        if not anchor_prefix:
            i += 1
            continue
            
        # Look ahead for matching prefixes
        for j in range(i + 5, min(i + 50, n - 4)):
            later_prefix = " ".join([w['word'].lower().strip().strip('.,!?') for w in words[j:j+4]])
            
            if anchor_prefix == later_prefix:
                # Found a retake! Mark the EARLIER words as deleted
                # Use a heuristic to see how far to delete (until punctuation or next take)
                for k in range(i, j):
                    # Stop if we hit a full sentence in the middle
                    if words[k]['word'].endswith(('.', '!', '?')):
                         break
                    words[k]['isDeleted'] = True
                
                logger.info(f"Expert: Flagged incremental retake cluster at {words[i]['start']/1000:.2f}s")
                i = j - 1
                break
        i += 1

    # 5. Dangling Fragments (Surgical)
    for i in range(1, n - 5):
        if words[i]['word'].endswith(('.', '!', '?')):
            # Check if words after punctuation are just a prefix of the NEXT sentence
            curr_pos = i + 1
            # Look at next 1-5 words
            for k in range(1, 6):
                if curr_pos + k >= n: break
                
                # Check for gap (> 0.8s) OR if we hit a known restart prefix
                gap = words[curr_pos]['start'] - words[i]['end']
                
                # If these words match the start of the NEXT block, kill them
                # (Look ahead for the next major gap or punctuation to find next block)
                next_block_start = -1
                for m in range(curr_pos + 1, min(curr_pos + 20, n)):
                    if words[m]['start'] - words[m-1]['end'] > 600:
                         next_block_start = m
                         break
                
                should_delete = False
                if gap > 800: # Significant pause after sentence
                    should_delete = True
                
                if next_block_start > 0:
                    prefix1 = " ".join([w['word'].lower().strip().strip('.,!?') for w in words[curr_pos:curr_pos+3]])
                    prefix2 = " ".join([w['word'].lower().strip().strip('.,!?') for w in words[next_block_start:next_block_start+3]])
                    if prefix1 and prefix1 == prefix2:
                        should_delete = True
                
                if should_delete:
                    # Mark fragment between punctuation and next restart
                    for m in range(i + 1, next_block_start if next_block_start > 0 else i + 4):
                        if m < n: words[m]['isDeleted'] = True
                    break

    # 6. Filler Words
    FILLERS = {'um', 'uh', 'hmm', 'ah', 'er'}
    for w in words:
        if w['word'].lower().strip().strip('.,!?') in FILLERS:
            w['isDeleted'] = True

    return words
