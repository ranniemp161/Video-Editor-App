
import re

def parse_time(t_str):
    # Supports 00:00:00.000 or 00:00:00,000 or 00:00.000 or 00:00.00
    t_str = t_str.strip().replace(',', '.')
    try:
        parts = t_str.split(':')
        if len(parts) == 3:
            h, m, s = parts
            return int(h) * 3600 + int(m) * 60 + float(s)
        elif len(parts) == 2:
            m, s = parts
            return int(m) * 60 + float(s)
    except Exception as e:
        print(f"Failed to parse time '{t_str}': {e}")
        return 0.0
    return 0.0

def test_implementation():
    # EXACT regex from main.py
    vtt_pattern = re.compile(r'((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{2,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{2,3})')
    
    samples = [
        "00:00:01,000 --> 00:00:04,000",   # Standard
        "00:01,000 --> 00:04,000",         # MM:SS (No hours)
        "1:00:00,000 --> 1:00:04,000",     # H:MM:SS
        "01:02:03.456 --> 01:02:05.678"    # VTT style dots
    ]
    
    print(f"Pattern: {vtt_pattern.pattern}")
    
    for s in samples:
        match = vtt_pattern.search(s)
        print(f"Input: '{s}'")
        if match:
            t1_str = match.group(1)
            t2_str = match.group(2)
            print(f"  Match: YES")
            print(f"  Group 1: {t1_str}")
            print(f"  Group 2: {t2_str}")
            t1 = parse_time(t1_str)
            t2 = parse_time(t2_str)
            print(f"  Parsed: {t1}s -> {t2}s")
            
            # Validation
            if t1 == 0 and "00:00:00" not in s and "00:00,000" not in s: 
                 print("  WARNING: Parsed as 0, might be wrong if input wasn't 0")
        else:
            print(f"  Match: NO")

if __name__ == "__main__":
    test_implementation()
