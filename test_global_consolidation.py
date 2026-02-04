
import sys
import os
import logging

logging.basicConfig(level=logging.INFO)

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from professional_rough_cut_v2 import ProfessionalRoughCutV2

def test_global_take_consolidation():
    # TJ's intro retake case (Complex Cluster)
    # Seg 20-21: "in this video I'm going to show you exactly what you are missing out on"
    # Seg 24-25: "in this video I'm going to show you exactly what you're missing"
    # Seg 26-28: "in this video I'm going to show you exactly what you're missing out on..."
    words_tj = [
        # Take 1
        {'word': 'in', 'start': 20.0, 'end': 20.2},
        {'word': 'this', 'start': 20.2, 'end': 20.4},
        {'word': 'video', 'start': 20.4, 'end': 20.6},
        {'word': '...', 'start': 20.6, 'end': 21.0},
        
        # Gap for segment split (Simulating a 2.1s gap)
        # Take 2
        {'word': 'in', 'start': 24.0, 'end': 24.2},
        {'word': 'this', 'start': 24.2, 'end': 24.4},
        {'word': 'video', 'start': 24.4, 'end': 24.6},
        {'word': 'missing', 'start': 24.6, 'end': 24.8},
        
        # Gap
        # Take 3 (Best/Full)
        {'word': 'in', 'start': 27.0, 'end': 27.2},
        {'word': 'this', 'start': 27.2, 'end': 27.4},
        {'word': 'video', 'start': 27.4, 'end': 27.6},
        {'word': 'show', 'start': 27.6, 'end': 27.8},
        {'word': 'you', 'start': 27.8, 'end': 28.0},
        {'word': 'exactly.', 'start': 28.0, 'end': 28.5},
    ]

    print("\n--- Testing Global Take Consolidation (TJ Intro Cluster) ---")
    rc = ProfessionalRoughCutV2(words_tj)
    res = rc.analyze()
    
    print(f"Final segments: {len(res)}")
    for i, s in enumerate(res):
        print(f"  {i}: {s['text']}")
        
    if len(res) == 1 and "exactly." in res[0]['text']:
        print("✅ SUCCESS: Successfully consolidated 3 takes into the best one.")
    else:
        print("❌ FAIL: Failed to consolidate takes or kept the wrong one.")

if __name__ == "__main__":
    test_global_take_consolidation()
