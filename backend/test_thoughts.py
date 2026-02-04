"""
Test script for thought-based semantic rough cut system
"""

import requests
import json

# Sample word-level transcript for testing
# Simulates a transcript with repetitions and incomplete thoughts
sample_words = [
    # First attempt at explaining something
    {"word": "So", "start": 0.0, "end": 0.2},
    {"word": "I", "start": 0.2, "end": 0.3},
    {"word": "think", "start": 0.3, "end": 0.5},
    {"word": "that", "start": 0.5, "end": 0.7},
    {"word": "we", "start": 0.7, "end": 0.8},
    {"word": "should", "start": 0.8, "end": 1.0},
    {"word": "um", "start": 1.0, "end": 1.2},  # Filler
    
    # Long pause (1.5s) - thought boundary
    
    # Second attempt (better version) - repetition of first
    {"word": "I", "start": 2.7, "end": 2.8},
    {"word": "think", "start": 2.8, "end": 3.0},
    {"word": "we", "start": 3.0, "end": 3.1},
    {"word": "should", "start": 3.1, "end": 3.3},
    {"word": "start", "start": 3.3, "end": 3.6},
    {"word": "with", "start": 3.6, "end": 3.8},
    {"word": "the", "start": 3.8, "end": 3.9},
    {"word": "basics", "start": 3.9, "end": 4.3},
    {"word": "first.", "start": 4.3, "end": 4.7},
    
    # Medium pause (0.9s) - thought boundary
    
    # New thought
    {"word": "This", "start": 5.6, "end": 5.8},
    {"word": "will", "start": 5.8, "end": 6.0},
    {"word": "help", "start": 6.0, "end": 6.2},
    {"word": "us", "start": 6.2, "end": 6.4},
    {"word": "understand", "start": 6.4, "end": 6.9},
    {"word": "the", "start": 6.9, "end": 7.0},
    {"word": "fundamentals.", "start": 7.0, "end": 7.6},
]

def test_analyze_thoughts():
    """Test the /analyze-thoughts endpoint"""
    print("\n=== Testing /analyze-thoughts endpoint ===")
    
    url = "http://localhost:8000/analyze-thoughts"
    payload = {"words": sample_words}
    
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        
        data = response.json()
        
        print(f"\n[OK] Success! Analyzed {len(data['thoughts'])} thoughts")
        print(f"\nSummary:")
        for key, value in data['summary'].items():
            print(f"  {key}: {value}")
        
        print(f"\nThoughts:")
        for thought in data['thoughts']:
            print(f"\n  Thought {thought['id']} ({thought['type']}):")
            print(f"    Time: {thought['start_time']:.2f}s - {thought['end_time']:.2f}s")
            print(f"    Words: {thought['word_count']}")
            print(f"    Coherence: {thought['coherence_score']:.2f}")
            print(f"    Text: {thought['text'][:60]}...")
        
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"\n[FAIL] Failed: {e}")
        return False

def test_auto_cut():
    """Test the /auto-cut endpoint with thought-based cutting"""
    print("\n\n=== Testing /auto-cut endpoint ===")
    
    url = "http://localhost:8000/auto-cut"
    payload = {
        "words": sample_words,
        "asset": {
            "id": "test-asset",
            "name": "test-video.mp4",
            "duration": 10.0
        },
        "trackId": "test-track"
    }
    
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        
        data = response.json()
        
        print(f"\n[OK] Success! Generated {len(data['clips'])} clips")
        
        print(f"\nStatistics:")
        for key, value in data['statistics'].items():
            print(f"  {key}: {value}")
        
        print(f"\nClips:")
        for i, clip in enumerate(data['clips']):
            duration = clip['end'] - clip['start']
            print(f"  Clip {i+1}: {clip['trimStart']:.2f}s - {clip['trimEnd']:.2f}s (duration: {duration:.2f}s)")
        
        if 'thoughts' in data:
            print(f"\n[OK] Thought metadata included ({len(data['thoughts']['thoughts'])} thoughts)")
        
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"\n✗ Failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")
        return False

if __name__ == "__main__":
    print("Testing Thought-Based Semantic Rough Cut System")
    print("=" * 50)
    
    # Test 1: Analyze thoughts
    test1_passed = test_analyze_thoughts()
    
    # Test 2: Auto-cut with thoughts
    test2_passed = test_auto_cut()
    
    print("\n\n" + "=" * 50)
    print("RESULTS:")
    print(f"  /analyze-thoughts: {'PASS' if test1_passed else 'FAIL'}")
    print(f"  /auto-cut:         {'PASS' if test2_passed else 'FAIL'}")
    print("=" * 50)
