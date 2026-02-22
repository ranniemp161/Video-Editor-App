import os
import logging
import time
from typing import List, Dict, Optional
from faster_whisper import WhisperModel
from .word_timing import refine_word_timestamps_with_audio

logger = logging.getLogger(__name__)

class WhisperTranscriber:
    def __init__(self, model_size: str = "small", device: str = "cpu", compute_type: str = "int8"):
        """
        Initialize the Faster-Whisper model.
        
        Args:
            model_size: Size of the model (tiny, base, small, medium, large-v2, large-v3)
            device: "cuda" for NVIDIA GPU, "cpu" for CPU, or "auto"
            compute_type: "float16" for GPU, "int8" for CPU quantization
        """
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.model = None

    def _load_model(self):
        """Lazy load the model only when needed."""
        if self.model is None:
            logger.info(f"Loading Whisper model: {self.model_size} ({self.device})")
            try:
                self.model = WhisperModel(self.model_size, device=self.device, compute_type=self.compute_type)
                logger.info("Whisper model loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load Whisper model: {e}")
                # Fallback to CPU/int8 if CUDA fails
                if self.device == "cuda":
                    logger.warning("Falling back to CPU (int8)...")
                    self.device = "cpu"
                    self.compute_type = "int8"
                    self.model = WhisperModel(self.model_size, device=self.device, compute_type=self.compute_type)

    def _extract_audio(self, video_path: str) -> str:
        """Extract audio from video to a temp WAV file using ffmpeg."""
        import subprocess
        
        # Create temp filename
        filename = os.path.basename(video_path)
        name_without_ext = os.path.splitext(filename)[0]
        temp_dir = os.path.join(os.getcwd(), "temp_audio")
        os.makedirs(temp_dir, exist_ok=True)
        
        # Use UUID to avoid collisions
        wav_path = os.path.join(temp_dir, f"{name_without_ext}_{int(time.time())}.wav")
        
        cmd = [
            "ffmpeg", "-y", 
            "-i", video_path,
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            wav_path
        ]
        
        logger.info(f"Extracting audio: {' '.join(cmd)}")
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            return wav_path
        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.decode()
            logger.error(f"FFmpeg failed: {error_msg}")
            raise RuntimeError(f"Failed to extract audio: {error_msg}")

    def transcribe(self, audio_path: str, language: str = None, beam_size: int = 5, model_size: str = None) -> Dict:
        """
        Transcribe audio file to word-level segments.
        
        Returns:
            Dict containing 'text' and 'words' list.
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
            
        # Switch model if needed
        if model_size and model_size != self.model_size:
            logger.info(f"Switching model from {self.model_size} to {model_size}")
            self.model_size = model_size
            self.model = None # Force reload
            
        self._load_model()
        
        logger.info(f"Starting transcription for: {audio_path}")
        start_time = time.time()
        
        # Extract audio first to avoid container issues
        try:
            clean_audio_path = self._extract_audio(audio_path)
        except Exception as e:
            logger.error(f"Audio extraction failed, falling back to direct file: {e}")
            clean_audio_path = audio_path
        
        # Run transcription on the clean WAV
        try:
            segments, info = self.model.transcribe(
                clean_audio_path, 
                beam_size=2,       # Reduced from 5 — faster with minimal quality loss
                language=language,
                word_timestamps=True,
                vad_filter=True,   # Skip silent regions automatically
                vad_parameters=dict(min_silence_duration_ms=500)
            )
            
            full_text = []
            words_list = []
            
            # Generator to list (this runs the inference)
            for segment in segments:
                full_text.append(segment.text)
                
                # segment.words contains the word-level timestamps
                if segment.words:
                    for word in segment.words:
                        words_list.append({
                            "word": word.word.strip(),
                            "start": word.start * 1000, # Convert to ms
                            "end": word.end * 1000,
                            "score": word.probability
                        })
            
            duration = time.time() - start_time
            logger.info(f"Transcription complete in {duration:.2f}s. Detected language: {info.language}")
            
            # Refine timestamps using audio energy (Onset detection)
            # This fixes "drifting" or "late" timestamps common in Whisper
            try:
                words_list = refine_word_timestamps_with_audio(
                    words=words_list,
                    audio_path=clean_audio_path, # Use the clean WAV!
                    start_sec=0,
                    end_sec=info.duration
                )
                logger.info("Timestamps refined with audio analysis.")
            except Exception as e:
                logger.warning(f"Timestamp refinement skipped due to error: {e}")
            
            # Cleanup temp file
            if clean_audio_path != audio_path and os.path.exists(clean_audio_path):
                try:
                    os.remove(clean_audio_path)
                except:
                    pass

            return {
                "text": " ".join(full_text),
                "language": info.language,
                "duration": info.duration,
                "words": words_list
            }
        except Exception as e:
            # Cleanup on error
            if 'clean_audio_path' in locals() and clean_audio_path != audio_path and os.path.exists(clean_audio_path):
                    try:
                        os.remove(clean_audio_path)
                    except:
                        pass
            raise e
