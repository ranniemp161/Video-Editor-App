
import re

def test_regex():
    # Original
    pattern_old = re.compile(r'(\d{1,2}:?\d{2}:\d{2}[.,]\d{2,3})\s*-->\s*(\d{1,2}:?\d{2}:\d{2}[.,]\d{2,3})')
    
    # New Proposal: Optional hours
    # ((\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{2,3})
    # Note: \d{1,2} for minutes? usually 2.
    pattern_new = re.compile(r'((\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{2,3})\s*-->\s*((\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{2,3})')

    samples = [
        "00:00:01,000 --> 00:00:04,000",   # Standard
        "00:01,000 --> 00:04,000",         # MM:SS (No hours) - Fails on old, should pass on new?
        "1:00:00,000 --> 1:00:04,000",     # H:MM:SS
        "01:02:03.456 --> 01:02:05.678"    # VTT style dots
    ]
    
    print("--- OLD PATTERN ---")
    for s in samples:
        match = pattern_old.search(s)
        print(f"'{s}': {bool(match)}")

    print("\n--- NEW PATTERN ---")
    for s in samples:
        match = pattern_new.search(s)
        print(f"'{s}': {bool(match)}")

if __name__ == "__main__":
    test_regex()
