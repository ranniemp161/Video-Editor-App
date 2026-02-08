
import re

def test_regex():
    pattern = re.compile(r'(\d{1,2}:?\d{2}:\d{2}[.,]\d{2,3})\s*-->\s*(\d{1,2}:?\d{2}:\d{2}[.,]\d{2,3})')
    
    samples = [
        "00:00:01,000 --> 00:00:04,000",
        "00:00:01.000 --> 00:00:04.000",
        "0:00:01,000 --> 0:00:04,000",
        "1 --> 2", # Should fail
        "00:00:01,000-->00:00:04,000" # Should pass
    ]
    
    print(f"Pattern: {pattern.pattern}")
    
    for s in samples:
        match = pattern.search(s)
        print(f"'{s}': {bool(match)}")
        if match:
            print(f"  Groups: {match.groups()}")

if __name__ == "__main__":
    test_regex()
