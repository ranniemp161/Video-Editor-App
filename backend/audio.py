import librosa
import numpy as np

def detect_silence(file_path: str, top_db=30, min_silence_duration=0.5):
    """
    Detects silence in an audio file using librosa.
    Returns a list of silence segments.
    """
    y, sr = librosa.load(file_path, sr=None)
    
    # Split audio into non-silent intervals associated with the specified dB threshold
    non_silent_intervals = librosa.effects.split(y, top_db=top_db)
    
    silence_segments = []
    
    # Calculate silence based on gaps between non-silent intervals
    last_end = 0.0
    for start_idx, end_idx in non_silent_intervals:
        start_time = start_idx / sr
        end_time = end_idx / sr
        
        if start_time - last_end >= min_silence_duration:
            silence_segments.append({
                "start": last_end,
                "end": start_time,
                "type": "silence",
                "text": "[silence]",
                "isDeleted": True # Default to deleted for silence? Or let user decide.
            })
            
        last_end = end_time
        
    # Check for tail silence
    total_duration = librosa.get_duration(y=y, sr=sr)
    if total_duration - last_end >= min_silence_duration:
        silence_segments.append({
            "start": last_end,
            "end": total_duration,
            "type": "silence",
            "text": "[silence]",
            "isDeleted": True
        })
        
    return silence_segments

def find_zero_crossing(y, sr, time_point, search_window=0.05):
    """
    Finds the nearest zero-crossing point to the given time_point.
    search_window: +/- seconds to search
    """
    target_sample = int(time_point * sr)
    window_samples = int(search_window * sr)
    
    start_idx = max(0, target_sample - window_samples)
    end_idx = min(len(y), target_sample + window_samples)
    
    segment = y[start_idx:end_idx]
    zero_crossings = np.where(np.diff(np.signbit(segment)))[0]
    
    if len(zero_crossings) == 0:
        return time_point
        
    # Find closest zero crossing to the center of the window
    closest_idx = zero_crossings[np.argmin(np.abs(zero_crossings - (target_sample - start_idx)))]
    
    return (start_idx + closest_idx) / sr
