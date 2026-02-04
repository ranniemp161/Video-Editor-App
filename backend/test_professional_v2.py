"""
Test professional rough cut with repetition examples
"""
import sys
sys.path.append('.')

from professional_rough_cut_v2 import ProfessionalRoughCutV2

# Example transcript with repetitions
words = [
    # First attempt
    {"word": "you", "start": 0.0, "end": 0.2},
    {"word": "are", "start": 0.2, "end": 0.4},
    {"word": "almost", "start": 0.4, "end": 0.7},
    {"word": "the", "start": 0.7, "end": 0.8},
    {"word": "likelihood", "start": 0.8, "end": 1.2},
    {"word": "is", "start": 1.2, "end": 1.4},
    
    # Long silence (will be cut)
    
    # Second attempt (REPETITION - should be removed)
    {"word": "you", "start": 4.0, "end": 4.2},
    {"word": "are", "start": 4.2, "end": 4.4},
    {"word": "almost", "start": 4.4, "end": 4.7},
    {"word": "the", "start": 4.7, "end": 4.8},
    {"word": "likelihood", "start": 4.8, "end": 5.2},
    {"word": "is", "start": 5.2, "end": 5.4},
    
    # Gap
    
    # Final version (KEEP THIS)
    {"word": "you", "start": 8.0, "end": 8.2},
    {"word": "are", "start": 8.2, "end": 8.4},
    {"word": "almost", "start": 8.4, "end": 8.7},
    {"word": "the", "start": 8.7, "end": 8.8},
    {"word": "likelihood", "start": 8.8, "end": 9.2},
    {"word": "is", "start": 9.2, "end": 9.4},
    {"word": "certain.", "start": 9.4, "end": 9.8},
]

print("Testing Professional Rough Cut V2")
print("=" * 50)

rough_cut = ProfessionalRoughCutV2(words)
segments = rough_cut.analyze()
stats = rough_cut.get_statistics()

print(f"\nResults:")
print(f"  Input: {len(words)} words")
print(f"  Output: {len(segments)} segments")
print(f"  Repetitions removed: {stats['repetitions_removed']}")
print(f"  Silences removed: {stats['silences_removed']}")
print(f"  Reduction: {stats['reduction_percentage']}%")

print(f"\nKept segments:")
for i, seg in enumerate(segments):
    print(f"  {i+1}. {seg['start']:.1f}s - {seg['end']:.1f}s: \"{seg['text']}\"")

# Should keep only the LAST version (8.0 - 9.8s)
expected_segments = 1
if len(segments) == expected_segments:
    print(f"\n[OK] Correctly kept {expected_segments} segment (last version)")
else:
    print(f"\n[FAIL] Expected {expected_segments} segments, got {len(segments)}")

sys.exit(0 if len(segments) == expected_segments else 1)
