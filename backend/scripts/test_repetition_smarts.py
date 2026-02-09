
import sys
import os
import logging

logging.basicConfig(level=logging.INFO)

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from core.rough_cut import ProfessionalRoughCutV2

def test_repetition_smarts():
    # Test cases: (Text, ShouldCutPrevious)
    # Emphasis case: "This is VERY VERY good"
    emphasis_words = [
        {'word': 'This', 'start': 0, 'end': 0.5},
        {'word': 'is', 'start': 0.5, 'end': 1.0},
        {'word': 'very', 'start': 1.0, 'end': 1.5},
        {'word': 'very', 'start': 1.5, 'end': 2.0},
        {'word': 'good', 'start': 2.0, 'end': 2.5},
    ]
    
    # Retake case: "I think we should I think we should go"
    retake_words = [
        {'word': 'I', 'start': 0, 'end': 0.3},
        {'word': 'think', 'start': 0.3, 'end': 0.6},
        {'word': 'we', 'start': 0.6, 'end': 0.9},
        {'word': 'should', 'start': 0.9, 'end': 1.2},
        # Long pause (> 2.0s) to trigger segment split
        {'word': 'I', 'start': 4.0, 'end': 4.3},
        {'word': 'think', 'start': 4.3, 'end': 4.6},
        {'word': 'we', 'start': 4.6, 'end': 4.9},
        {'word': 'should', 'start': 4.9, 'end': 5.2},
        {'word': 'go', 'start': 5.2, 'end': 5.5},
    ]

    print("--- Testing Emphasis Protection ---")
    rc_emp = ProfessionalRoughCutV2(emphasis_words)
    segments_emp = rc_emp.analyze()
    # Should keep everything in one segment (not cut anything)
    if len(segments_emp) == 1 and segments_emp[0]['word_count'] == 5:
        print("[SUCCESS]: 'Very very' emphasis preserved.")
    else:
        print(f"[FAIL]: Emphasis was cut. Segments: {len(segments_emp)}")

    print("\n--- Testing Retake Detection ---")
    rc_retake = ProfessionalRoughCutV2(retake_words)
    segments_retake = rc_retake.analyze()
    
    # It might be removed by repetitions_removed OR by incomplete sentence removal OR incremental takes
    if rc_retake.stats['repetitions_removed'] > 0 or len(segments_retake) == 1:
        print("[SUCCESS]: Retake correctly handled (removed earlier version).")
    else:
        print(f"[FAIL]: Retake was NOT detected. Segments: {len(segments_retake)}")

if __name__ == "__main__":
    test_repetition_smarts()
