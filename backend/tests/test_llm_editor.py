
import pytest
from unittest.mock import MagicMock, patch
from core.llm_editor import LLMEditor

@pytest.fixture
def mock_settings():
    with patch('core.llm_editor.settings') as mock:
        mock.gemini_api_key = "test_key"
        yield mock

@pytest.fixture
def llm_editor(mock_settings):
    with patch('google.genai.Client') as mock_client:
        editor = LLMEditor()
        editor.client = MagicMock()
        return editor

def test_identify_fluff_success(llm_editor):
    # Mock response structure for google.genai
    mock_response = MagicMock()
    mock_response.text = "[0, 1]"
    llm_editor.client.models.generate_content.return_value = mock_response
    
    words = [
        {"text": "um", "start": 500, "end": 1200},
        {"text": "well", "start": 3400, "end": 4500},
        {"text": "hello", "start": 5000, "end": 6000}
    ]
    
    result = llm_editor.identify_fluff(words)
    
    assert len(result) == 2
    assert result[0] == 0
    assert result[1] == 1

def test_identify_fluff_empty(llm_editor):
    assert llm_editor.identify_fluff([]) == []

def test_identify_fluff_error(llm_editor):
    llm_editor.client.models.generate_content.side_effect = Exception("API Error")
    words = [{"text": "test", "start": 0, "end": 1000}]
    
    # Should handle exception and return empty list
    assert llm_editor.identify_fluff(words) == []

if __name__ == "__main__":
    pytest.main([__file__])
