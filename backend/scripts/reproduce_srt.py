
import re
import json

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

def test_parsing(text):
    print(f"--- Testing text of length {len(text)} ---")
    vtt_pattern = re.compile(r'(\d{1,2}:?\d{2}:\d{2}[.,]\d{2,3})\s*-->\s*(\d{1,2}:?\d{2}:\d{2}[.,]\d{2,3})')
    
    lines = text.split('\n')
    has_vtt = any(vtt_pattern.search(line) for line in lines[:30])
    
    print(f"Has VTT/SRT match: {has_vtt}")
    
    if has_vtt:
        for line in lines:
            match = vtt_pattern.search(line)
            if match:
                print(f"Matched: {match.group(1)} --> {match.group(2)}")
                t1 = parse_time(match.group(1))
                t2 = parse_time(match.group(2))
                print(f"Parsed: {t1} -> {t2}")

# Test Cases
srt_standard = """1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,000 --> 00:00:08,000
This is a test"""

srt_dots = """1
00:00:01.000 --> 00:00:04.000
Hello with dots"""

srt_short_hours = """1
0:00:01,000 --> 0:00:04,000
Short hours"""

srt_no_hours = """1
00:01,000 --> 00:04,000
No hours (MM:SS)"""  # This mimics some web headers but SRT usually requires HH:MM:SS

test_parsing(srt_standard)
test_parsing(srt_dots)
test_parsing(srt_short_hours)
test_parsing(srt_no_hours)
