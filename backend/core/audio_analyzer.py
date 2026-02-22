
import os
import logging
import numpy as np
import librosa
import re

logger = logging.getLogger(__name__)

class AudioAnalyzer:
    def __init__(self, video_path: str):
        self.video_path = video_path
        self.y = None
        self.sr = None
        self.rms = None
        self.pitches = None
        self.magnitudes = None
        self.is_ready = False
        self._load_audio()

    def _extract_to_wav(self, path: str) -> str:
        """Extract audio from a video file to a temp WAV so soundfile can load it."""
        import subprocess, time
        video_extensions = {'.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'}
        ext = os.path.splitext(path)[1].lower()
        if ext not in video_extensions:
            return path  # Already an audio file, no extraction needed

        temp_dir = os.path.join(os.getcwd(), "temp_audio")
        os.makedirs(temp_dir, exist_ok=True)
        name = os.path.splitext(os.path.basename(path))[0]
        wav_path = os.path.join(temp_dir, f"{name}_analyzer_{int(time.time())}.wav")

        cmd = ["ffmpeg", "-y", "-i", path, "-ar", "22050", "-ac", "1", "-c:a", "pcm_s16le", wav_path]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            logger.info(f"AudioAnalyzer: extracted WAV to {wav_path}")
            return wav_path
        except subprocess.CalledProcessError as e:
            logger.warning(f"AudioAnalyzer: ffmpeg extraction failed: {e.stderr.decode()[:200]}")
            return path  # Fallback to original

    def _load_audio(self):
        """Load audio and pre-calculate base features."""
        wav_path = None
        try:
            if not os.path.exists(self.video_path):
                logger.error(f"Video file not found: {self.video_path}")
                return

            logger.info(f"Loading audio from {self.video_path}...")

            # Extract to WAV first so soundfile (fast, no warnings) can handle it
            wav_path = self._extract_to_wav(self.video_path)
            self.y, self.sr = librosa.load(wav_path, sr=22050, mono=True)

            # Pre-calculate RMS Energy (Volume)
            self.rms = librosa.feature.rms(y=self.y)[0]

            # Pre-calculate Pitch (f0) using PIPTRACK
            self.pitches, self.magnitudes = librosa.piptrack(y=self.y, sr=self.sr)

            self.is_ready = True
            logger.info("Audio features pre-calculated successfully.")
        except Exception as e:
            logger.error(f"Failed to load audio features: {e}")
        finally:
            # Clean up temp WAV if we created one
            if wav_path and wav_path != self.video_path and os.path.exists(wav_path):
                try:
                    os.remove(wav_path)
                except Exception:
                    pass


    def get_features(self, start_time: float, end_time: float) -> dict:
        """
        Extract audio features for a specific time window.
        """
        if not self.is_ready:
            return {}

        try:
            # Convert time to frame indices
            # librosa.time_to_frames uses default hop_length=512
            start_frame = int(librosa.time_to_frames(start_time, sr=self.sr))
            end_frame = int(librosa.time_to_frames(end_time, sr=self.sr))
            
            # Ensure indices are within bounds
            start_frame = max(0, min(start_frame, len(self.rms) - 1))
            end_frame = max(start_frame + 1, min(end_frame, len(self.rms)))
            
            # 1. Energy Features
            segment_rms = self.rms[start_frame:end_frame]
            avg_energy = float(np.mean(segment_rms)) if len(segment_rms) > 0 else 0.0
            energy_variance = float(np.var(segment_rms)) if len(segment_rms) > 0 else 0.0
            
            # 2. Pitch Features
            # Get strongest pitch for each frame in range
            segment_pitches = []
            for t in range(start_frame, min(end_frame, self.pitches.shape[1])):
                index = self.magnitudes[:, t].argmax()
                pitch = self.pitches[index, t]
                if pitch > 0:
                    segment_pitches.append(pitch)
            
            avg_pitch = float(np.mean(segment_pitches)) if segment_pitches else 0.0
            # Pitch stability (lower std dev = more stable tone)
            pitch_stability = float(np.std(segment_pitches)) if segment_pitches else 0.0
            
            return {
                'avg_energy': round(avg_energy, 4),
                'energy_variance': round(energy_variance, 4),
                'avg_pitch': round(avg_pitch, 2),
                'pitch_stability': round(pitch_stability, 2)
            }
        except Exception as e:
            logger.warning(f"Error extracting audio features for {start_time}-{end_time}: {e}")
            return {}
