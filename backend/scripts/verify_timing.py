
import sys
import os
import json

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from word_timing import distribute_word_timestamps, refine_word_timestamps_with_audio

def test_snapping():
    # Mock data
    words = ["Hello", "this", "is", "a", "test"]
    start_sec = 10.0
    end_sec = 12.0
    
    # 1. Base distribution
    base_words = distribute_word_timestamps(start_sec, end_sec, words)
    print("Base Timings (ms):")
    for w in base_words:
        print(f"  {w['word']}: {w['start']:.1f} - {w['end']:.1f}")
        
    # 2. Try to refine (this will fail if no audio, which is fine for this test structure)
    # But let's check if it handles missing audio gracefully
    refined = refine_word_timestamps_with_audio(base_words, "non_existent.wav", start_sec, end_sec)
    
    if refined == base_words:
        print("\n✅ Gracefully handles missing audio files (returns original).")
    else:
        print("\n❌ Failed: Refined words should match original when audio is missing.")

if __name__ == "__main__":
    test_snapping()
