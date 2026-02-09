
import sys
import os
import numpy as np
import librosa
import soundfile as sf
import logging

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from core.audio_analyzer import AudioAnalyzer

def create_test_audio(path, duration=5.0, sr=22050):
    """Create a test audio file with a loud part and a quiet part."""
    t = np.linspace(0, duration, int(sr * duration))
    # 2 seconds of loud signal (440Hz sine)
    loud = 0.5 * np.sin(2 * np.pi * 440 * t[:int(sr * 2)])
    # 1 second of silence/v. quiet noise
    quiet = 0.01 * np.random.randn(int(sr * 1))
    # 2 seconds of medium signal (880Hz sine)
    medium = 0.2 * np.sin(2 * np.pi * 880 * t[:int(sr * 2)])
    
    y = np.concatenate([loud, quiet, medium])
    sf.write(path, y, sr)
    return path

def test_audio_analyzer():
    logging.basicConfig(level=logging.INFO)
    test_file = "test_audio.wav"
    try:
        create_test_audio(test_file)
        print(f"Created test file: {test_file}")
        
        analyzer = AudioAnalyzer(test_file)
        
        # Test 1: Loud part (0-2s)
        feat_loud = analyzer.get_features(0.0, 2.0)
        print(f"Loud (0-2s): {feat_loud}")
        
        # Test 2: Quiet part (2-3s)
        feat_quiet = analyzer.get_features(2.0, 3.0)
        print(f"Quiet (2-3s): {feat_quiet}")
        
        # Test 3: Pitch difference
        # 440Hz vs 880Hz
        feat_high = analyzer.get_features(3.0, 5.0)
        print(f"High (3-5s): {feat_high}")
        
        # BASIC VALIDATION
        if feat_loud['avg_energy'] > feat_quiet['avg_energy']:
            print("[SUCCESS]: Energy detection works.")
        else:
            print("[FAIL]: Energy detection failed.")
            
        if feat_high['avg_pitch'] > feat_loud['avg_pitch']:
             print("[SUCCESS]: Pitch detection works (880Hz > 440Hz).")
        else:
             print(f"[FAIL]: Pitch detection failed. {feat_high['avg_pitch']} <= {feat_loud['avg_pitch']}")

    finally:
        if os.path.exists(test_file):
            os.remove(test_file)

if __name__ == "__main__":
    test_audio_analyzer()
