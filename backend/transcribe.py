try:
    from faster_whisper import WhisperModel
    HAS_WHISPER = True
except ImportError:
    HAS_WHISPER = False
    print("Warning: faster-whisper not found. Using mock transcription.")

import os

model_size = "base"
device = "cpu"
compute_type = "int8"

def transcribe_audio(file_path: str):
    """
    Transcribes audio/video file using Faster-Whisper.
    Returns a list of segments with word-level timestamps.
    """
    if not HAS_WHISPER:
        # Mock Response
        return [
            {"start": 0.0, "end": 0.5, "text": "This", "type": "speech", "isDeleted": False},
            {"start": 0.5, "end": 1.0, "text": "is", "type": "speech", "isDeleted": False},
            {"start": 1.0, "end": 1.5, "text": "a", "type": "speech", "isDeleted": False},
            {"start": 1.5, "end": 2.5, "text": "mock", "type": "speech", "isDeleted": False},
            {"start": 2.5, "end": 3.0, "text": "transcription.", "type": "speech", "isDeleted": False},
            {"start": 3.0, "end": 5.0, "text": "[silence]", "type": "silence", "isDeleted": True},
        ]

    try:
        model = WhisperModel(model_size, device=device, compute_type=compute_type)
        
        segments, info = model.transcribe(file_path, word_timestamps=True)
        
        result_segments = []
        
        for segment in segments:
            for word in segment.words:
                result_segments.append({
                    "start": word.start,
                    "end": word.end,
                    "text": word.word,
                    "type": "speech",
                    "isDeleted": False
                })
                
        return result_segments
        
    except Exception as e:
        print(f"Error in transcription: {e}")
        raise e
