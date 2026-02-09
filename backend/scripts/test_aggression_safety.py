
import sys
import os
import logging

logging.basicConfig(level=logging.INFO)

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from core.rough_cut import ProfessionalRoughCutV2

def test_aggression_safety():
    # Case: Sharing a prefix but having unique endings (Store vs Bread)
    words_divergent = [
        # Take 1
        {'word': 'I', 'start': 1.0, 'end': 1.2},
        {'word': 'want', 'start': 1.2, 'end': 1.4},
        {'word': 'to', 'start': 1.4, 'end': 1.6},
        {'word': 'buy', 'start': 1.6, 'end': 1.8},
        {'word': 'milk.', 'start': 1.8, 'end': 2.2},
        
        # Gap
        {'word': 'I', 'start': 4.0, 'end': 4.2},
        {'word': 'want', 'start': 4.2, 'end': 4.4},
        {'word': 'to', 'start': 4.4, 'end': 4.6},
        {'word': 'buy', 'start': 4.6, 'end': 4.8},
        {'word': 'bread.', 'start': 4.8, 'end': 5.2},
    ]

    print("\n--- Testing Divergence Protection (Milk vs Bread) ---")
    rc = ProfessionalRoughCutV2(words_divergent)
    res = rc.analyze()
    
    print(f"Final segments: {len(res)}")
    for i, s in enumerate(res):
        print(f"  {i}: {s['text']}")
        
    if len(res) == 2:
        print("[SUCCESS]: Divergence protection kept BOTH segments.")
    else:
        print(f"[FAIL]: One segment was incorrectly cut. Count: {len(res)}")

    # Case: Low keyword similarity but high structural similarity
    words_meaning_diff = [
        {'word': 'This', 'start': 10.0, 'end': 10.5},
        {'word': 'is', 'start': 10.5, 'end': 11.0},
        {'word': 'a', 'start': 11.0, 'end': 11.5},
        {'word': 'great', 'start': 11.5, 'end': 12.0},
        {'word': 'day.', 'start': 12.0, 'end': 12.5},
        
        {'word': 'This', 'start': 15.0, 'end': 15.5},
        {'word': 'is', 'start': 15.5, 'end': 16.0},
        {'word': 'a', 'start': 16.0, 'end': 16.5},
        {'word': 'bad', 'start': 16.5, 'end': 17.0},
        {'word': 'day.', 'start': 17.0, 'end': 17.5},
    ]

    print("\n--- Testing Sentiment/Keyword Diversity (Great vs Bad) ---")
    rc2 = ProfessionalRoughCutV2(words_meaning_diff)
    res2 = rc2.analyze()
    
    print(f"Final segments: {len(res2)}")
    if len(res2) == 2:
        print("[SUCCESS]: Keyword diversity preserved both segments.")
    else:
        print(f"[FAIL]: Meaningfully different segments were consolidated. Count: {len(res2)}")

if __name__ == "__main__":
    test_aggression_safety()
