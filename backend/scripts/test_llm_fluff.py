
import sys
import os
import json
import logging
from unittest.mock import MagicMock, patch

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from core.rough_cut import ProfessionalRoughCutV2

def test_llm_integration():
    logging.basicConfig(level=logging.INFO)
    
    # Sample segments
    # 0: Important point
    # 1: Tangent about a cat
    # 2: Conclusion
    segments = [
        {'text': "Welcome to our cooking show. Today we make pasta.", 'start_time': 0.0, 'end_time': 5.0, 'word_indices': [0, 1, 2]},
        {'text': "Oh, and my cat is sleeping on the sofa. He is so cute.", 'start_time': 5.0, 'end_time': 10.0, 'word_indices': [3, 4, 5]},
        {'text': "Now, boil the water and add salt.", 'start_time': 10.0, 'end_time': 15.0, 'word_indices': [6, 7, 8]}
    ]
    
    # Mock LLMEditor to return [1] (cutting the cat tangent)
    with patch('core.llm_editor.genai.GenerativeModel') as MockModel:
        mock_model_instance = MockModel.return_value
        # Mocking the response object
        mock_response = MagicMock()
        mock_response.text = "[1]" # LLM says cut index 1
        mock_model_instance.generate_content.return_value = mock_response
        
        # We need to set the environment variable so LLMEditor initializes
        os.environ["GEMINI_API_KEY"] = "mock_key"
        
        rough_cut = ProfessionalRoughCutV2([], video_path=None)
        # Manually overwrite segments to skip earlier heuristic steps for this test
        # and test the LLM pass directly via analyze or the private method
        
        result = rough_cut._llm_semantic_pass(segments)
        
        print(f"Original segments: {len(segments)}")
        print(f"Final segments: {len(result)}")
        
        if len(result) == 2 and "cat" not in result[0]['text'] and "cat" not in result[1]['text']:
            print("[SUCCESS]: LLM Semantic pass correctly removed the tangent.")
        else:
            print("[FAIL]: LLM Semantic pass did not work as expected.")
            for s in result:
                print(f" Kept: {s['text']}")

if __name__ == "__main__":
    test_llm_integration()
