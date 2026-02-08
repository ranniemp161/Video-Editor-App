
import sys
import os
import logging

logging.basicConfig(level=logging.INFO)

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from professional_rough_cut_v2 import ProfessionalRoughCutV2

def test_surgical_continuity():
    # Case 1: Dangling Segment
    # "it's a big mistake. you are almost" -> followed by restart
    case1_words = [
        {'word': "it's", 'start': 0, 'end': 0.5},
        {'word': 'a', 'start': 0.5, 'end': 1.0},
        {'word': 'big', 'start': 1.0, 'end': 1.5},
        {'word': 'mistake.', 'start': 1.5, 'end': 2.0},
        {'word': 'you', 'start': 2.0, 'end': 2.3},
        {'word': 'are', 'start': 2.3, 'end': 2.6},
        {'word': 'almost', 'start': 2.6, 'end': 3.0},
        # Gap to trigger next segment
        {'word': 'So', 'start': 6.0, 'end': 6.5},
        {'word': 'the', 'start': 6.5, 'end': 7.0},
        {'word': 'likelihood', 'start': 7.0, 'end': 7.5},
    ]

    # Case 2: Incremental Take
    # Seg 1: "the likelihood is is that you're almost"
    # Seg 2: "the likelihood is is that you're in one of two camps"
    case2_words = [
        {'word': 'the', 'start': 8.0, 'end': 8.2},
        {'word': 'likelihood', 'start': 8.2, 'end': 8.4},
        {'word': 'is', 'start': 8.4, 'end': 8.6},
        {'word': 'is', 'start': 8.6, 'end': 8.8},
        {'word': 'that', 'start': 8.8, 'end': 9.0},
        {'word': "you're", 'start': 9.0, 'end': 9.2},
        {'word': 'almost', 'start': 9.2, 'end': 9.5},
        
        # Gap for segment split
        {'word': 'the', 'start': 12.0, 'end': 12.2},
        {'word': 'likelihood', 'start': 12.2, 'end': 12.4},
        {'word': 'is', 'start': 12.4, 'end': 12.6},
        {'word': 'is', 'start': 12.6, 'end': 12.8},
        {'word': 'that', 'start': 12.8, 'end': 13.0},
        {'word': "you're", 'start': 13.0, 'end': 13.2},
        {'word': 'in', 'start': 13.2, 'end': 13.4},
        {'word': 'one', 'start': 13.4, 'end': 13.6},
    ]

    print("\n--- Testing Surgical Cut (Dangling Thought) ---")
    rc1 = ProfessionalRoughCutV2(case1_words)
    res1 = rc1.analyze()
    final_text = " ".join([s['text'] for s in res1])
    print(f"Result Text: \"{final_text}\"")
    if "almost" not in final_text and "mistake." in final_text:
        print("✅ SUCCESS: Surgically trimmed dangling 'you are almost'.")
    else:
        print("❌ FAIL: Dangling thought still present.")

    print("\n--- Testing Incremental Take (False Start) ---")
    rc2 = ProfessionalRoughCutV2(case2_words)
    res2 = rc2.analyze()
    print(f"Segment Count: {len(res2)}")
    for i, s in enumerate(res2):
        print(f"  {i}: {s['text']}")
    
    if len(res2) == 1 and "in one" in res2[0]['text']:
        print("✅ SUCCESS: Discarded false start, kept complete take.")
    else:
        print("❌ FAIL: False start was not discarded or both were kept.")

if __name__ == "__main__":
    test_surgical_continuity()
