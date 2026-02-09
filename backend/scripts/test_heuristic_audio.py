
import sys
import os
import numpy as np
import logging
from unittest.mock import MagicMock, patch

# Add backend paths
current_dir = os.getcwd()
sys.path.append(current_dir)
if os.path.exists('/app'):
    sys.path.append('/app')
    
from core.rough_cut import ProfessionalRoughCutV2

def test_heuristic_audio_logic():
    logging.basicConfig(level=logging.INFO)
    
    # 1. MOCK DATA
    words = [
        {'word': "Welcome", 'start': 0.0, 'end': 0.3},
        {'word': "to", 'start': 0.3, 'end': 0.5},
        {'word': "our", 'start': 0.5, 'end': 0.7},
        {'word': "show.", 'start': 0.7, 'end': 1.0}, # Segment 0: 4 words, energy 0.5
        
        {'word': "Welcome", 'start': 2.0, 'end': 2.3},
        {'word': "to", 'start': 2.3, 'end': 2.5},
        {'word': "our", 'start': 2.5, 'end': 2.7},
        {'word': "show.", 'start': 2.7, 'end': 3.0}, # Segment 1: 4 words, energy 0.1 (Repetition)
        
        {'word': "Um", 'start': 4.0, 'end': 4.2},
        {'word': "actually", 'start': 4.2, 'end': 4.4},
        {'word': "maybe", 'start': 4.4, 'end': 4.6}, # Segment 2: 3 words, energy 0.2 (Filler)
        
        {'word': "let's", 'start': 10.0, 'end': 10.3},
        {'word': "start", 'start': 10.3, 'end': 10.6},
        {'word': "the", 'start': 10.6, 'end': 10.8},
        {'word': "cooking", 'start': 10.8, 'end': 11.0} # Segment 3: 4 words
    ]
    
    # 2. MOCK AUDIO ANALYZER
    mock_analyzer = MagicMock()
    
    # Define energy mapping:
    # Hello (0-1s): 0.5 (Strong)
    # Hello (2-3s): 0.1 (Weak) -> New logic should keep the first one!
    # Um (4-4.5s): 0.2 (Strong/Excited) -> Should be kept anyway
    # Silence (4.5-10s): 0.15 (Significant sound/laughter) -> Silence should be RECOVERED
    
    def get_mock_features(start, end):
        if start == 0.0 and end == 1.0: return {'avg_energy': 0.5}
        if start == 2.0 and end == 3.0: return {'avg_energy': 0.1}
        if start == 4.0 and end == 4.6: return {'avg_energy': 0.2}
        if start >= 4.6 and end <= 10.0: return {'avg_energy': 0.15}
        return {'avg_energy': 0.05}
        
    mock_analyzer.get_features.side_effect = get_mock_features
    
    # 3. RUN ANALYSIS
    # We patch the AudioAnalyzer in the audio_analyzer module
    with patch('core.audio_analyzer.AudioAnalyzer', return_value=mock_analyzer):
        rough_cut = ProfessionalRoughCutV2(words, video_path="mock.mp4")
        segments = rough_cut.analyze()
        
        print(f"Final segments: {len(segments)}")
        for s in segments:
             print(f" Segment: {s['start']:.1f}-{s['end']:.1f} \"{s['text']}\"")
        
        # VALIDATIONS
        
        # Test 1: Repetition (should keep 0.0-1.0 because it's louder)
        has_earlier_hello = any(s['start'] == 0.0 for s in segments)
        has_later_hello = any(s['start'] == 2.0 for s in segments)
        
        if has_earlier_hello and not has_later_hello:
            print("[SUCCESS]: Repetition logic kept the louder earlier take.")
        else:
            print(f"[FAIL]: Repetition logic. has_earlier: {has_earlier_hello}, has_later: {has_later_hello}")
            
        # Test 2: Filler (should keep "Um actually maybe" because it's high energy)
        has_filler = any("actually maybe" in s['text'] for s in segments)
        if has_filler:
            print("[SUCCESS]: Excited filler preserved.")
        else:
            print("[FAIL]: Excited filler was cut.")
            
        # Test 3: Silence Recovery
        # "maybe" and "let's" should be in the SAME segment if gap 4.6-10.0 was preserved
        um_cooking_merged = any("maybe" in s['text'] and "cooking" in s['text'] for s in segments)
        if um_cooking_merged:
            print("[SUCCESS]: Smart Silence recovered gap with energy.")
        else:
             print("[FAIL]: Silence recovery failed.")

if __name__ == "__main__":
    test_heuristic_audio_logic()
