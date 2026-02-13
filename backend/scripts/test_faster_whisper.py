
import sys
import os
import logging

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from core.transcriber import WhisperTranscriber

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_transcription():
    transcriber = WhisperTranscriber(model_size="tiny")
    
    # Use one of the found video files
    video_path = "public/uploads/cc1b6bae-a120-42c2-af94-81d374f8ae0e/main-video.mp4"
    abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", video_path))
    
    if not os.path.exists(abs_path):
        logger.error(f"Video file not found: {abs_path}")
        # Try finding any mp4 in public/uploads
        import glob
        files = glob.glob(os.path.join(os.path.dirname(__file__), "..", "public", "uploads", "**", "*.mp4"), recursive=True)
        if files:
            abs_path = files[0]
            logger.info(f"Using alternative file: {abs_path}")
        else:
            return

    logger.info(f"Transcribing {abs_path}...")
    try:
        result = transcriber.transcribe(abs_path) # Use tiny from init
        
        logger.info("Transcription successful!")
        logger.info(f"Text length: {len(result['text'])}")
        logger.info(f"Word count: {len(result['words'])}")
        
        if result['words']:
            logger.info(f"First word: {result['words'][0]}")
            logger.info(f"Last word: {result['words'][-1]}")
            
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_transcription()
