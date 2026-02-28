
import pytest
import numpy as np
from core.word_timing import count_syllables, estimate_word_duration, distribute_word_timestamps, find_zero_crossing

def test_count_syllables():
    assert count_syllables("hello") == 2
    assert count_syllables("world") == 1
    assert count_syllables("programming") == 3
    assert count_syllables("strength") == 1
    assert count_syllables("rhythm") == 1
    assert count_syllables("a") == 1
    assert count_syllables("the") == 1

def test_estimate_word_duration():
    # Short words
    assert estimate_word_duration("a") == 0.12
    # Normal words
    duration = estimate_word_duration("hello")
    assert duration > 0.12
    assert duration == (2 * 0.2) + 0.05  # syllables * 0.2 + 0.05

def test_distribute_word_timestamps():
    words = ["hello", "world"]
    start = 10.0
    end = 12.0
    result = distribute_word_timestamps(start, end, words)
    
    assert len(result) == 2
    assert result[0]["word"] == "hello"
    assert result[1]["word"] == "world"
    
    # Check bounds (converted to ms)
    assert result[0]["start"] == 10.0 * 1000
    assert result[1]["end"] == 12.0 * 1000
    
    # Sequence check
    assert result[0]["end"] == result[1]["start"]

def test_find_zero_crossing():
    sr = 1000
    # Create a sine wave
    t = np.linspace(0, 1, sr)
    y = np.sin(2 * np.pi * 5 * t)  # 5Hz sine wave
    
    # Zero crossings are at t=0, 0.1, 0.2, ...
    # Try near 0.12
    crossing = find_zero_crossing(y, sr, 0.12)
    assert abs(crossing - 0.1) < 0.01
    
    # Try near 0.19
    crossing = find_zero_crossing(y, sr, 0.19)
    assert abs(crossing - 0.2) < 0.01

if __name__ == "__main__":
    pytest.main([__file__])
