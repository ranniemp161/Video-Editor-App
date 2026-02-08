# Editing endpoints (auto-cut, analyze thoughts, train feedback)
import os
import time
import logging
from typing import List
from fastapi import APIRouter

from db import SessionLocal, Project
from schemas import AutoCutRequest, AnalyzeThoughtsRequest, TrainFeedbackRequest
from core import ProfessionalRoughCutV2, ThoughtGrouper, find_zero_crossing
from feedback_loop import FeedbackLoop

logger = logging.getLogger(__name__)

router = APIRouter(tags=["editing"])


@router.post("/auto-cut")
async def auto_cut(request: AutoCutRequest):
    """
    Professional rough cut following industry-standard editing principles:
    1. Silence & Pause Management (>2s removed)
    2. Repetition Handling (keep LAST version)
    3. "Cut That" Signal Processing
    4. Incomplete Sentence Detection
    """
    
    # Normalize words to seconds if they are in ms
    normalized_words = []
    for w in request.words:
        nw = w.copy()
        if 'word' not in nw and 'text' in nw:
            nw['word'] = nw['text']
            
        if nw.get('start', 0) > request.asset.duration * 1.1:
            nw['start'] /= 1000.0
            nw['end'] /= 1000.0
            
        normalized_words.append(nw)

    # Run Professional Rough Cut Analysis
    rough_cut = ProfessionalRoughCutV2(normalized_words)
    segments = rough_cut.analyze()
    stats = rough_cut.get_statistics()
    
    logger.info(f"Professional rough cut: {len(segments)} segments, "
                f"{stats['reduction_percentage']}% reduction, "
                f"{stats['time_saved']:.1f}s saved")
    logger.info(f"  • Silences removed: {stats['silences_removed']}")
    logger.info(f"  • Repetitions removed: {stats['repetitions_removed']}")
    logger.info(f"  • 'Cut that' signals: {stats['cut_that_signals']}")
    logger.info(f"  • Incomplete sentences removed: {stats['incomplete_sentences']}")
    
    # Load audio for zero-crossing snapping if possible
    audio_buffer = None
    sr = 16000
    db = SessionLocal()
    try:
        db_project = db.query(Project).filter(Project.id == request.asset.id).first()
        if db_project and os.path.exists(db_project.mediaPath):
            wav_path = db_project.mediaPath + ".wav"
            if os.path.exists(wav_path):
                import librosa
                audio_buffer, _ = librosa.load(wav_path, sr=sr)
    except Exception as e:
        logger.warning(f"Auto-cut: Could not load audio for snapping: {e}")
    finally:
        db.close()

    # Convert segments to Timeline Clips
    clips = []
    timeline_pos = 0.0
    
    for i, seg in enumerate(segments):
        trim_start = seg['start']
        trim_end = seg['end']
        
        # Snap to zero crossings to avoid clicks
        if audio_buffer is not None:
            trim_start = find_zero_crossing(audio_buffer, sr, trim_start)
            trim_end = find_zero_crossing(audio_buffer, sr, trim_end)
            
        clip_duration = trim_end - trim_start
        
        if clip_duration <= 0:
            logger.warning(f"Auto-cut: Skipping clip {i} due to zero or negative duration after snapping")
            continue
        
        clip = {
            "id": f"autocut-{i}-{int(time.time()*1000)}",
            "assetId": request.asset.id,
            "trackId": request.trackId,
            "name": request.asset.name,
            "sourceFileName": request.asset.name,
            "start": timeline_pos,
            "end": timeline_pos + clip_duration,
            "trimStart": trim_start,
            "trimEnd": trim_end,
            "opacity": 100,
            "volume": 100
        }
        
        clips.append(clip)
        timeline_pos += clip_duration
    
    logger.info(f"Created {len(clips)} timeline clips")
    
    return {
        "clips": clips,
        "words": request.words,
        "statistics": stats
    }


@router.post("/analyze-thoughts")
async def analyze_thoughts(request: AnalyzeThoughtsRequest):
    """
    Analyze and return thought groupings without performing rough cut.
    Useful for visualizing how content will be grouped.
    """
    # Normalize words to seconds if needed
    normalized_words = []
    for w in request.words:
        nw = w.copy()
        if 'word' not in nw and 'text' in nw:
            nw['word'] = nw['text']
        
        if nw.get('start', 0) > 10000:
            nw['start'] /= 1000.0
            nw['end'] /= 1000.0
        
        normalized_words.append(nw)
    
    # Group into thoughts
    grouper = ThoughtGrouper(normalized_words)
    thoughts = grouper.group_into_thoughts()
    summary = grouper.get_thought_summary()
    
    logger.info(f"Analyzed {len(thoughts)} thoughts from {len(normalized_words)} words")
    
    return {
        "thoughts": [
            {
                'id': i,
                'start_time': t['start_time'],
                'end_time': t['end_time'],
                'text': t['text'],
                'word_indices': t['word_indices'],
                'word_count': t['word_count'],
                'coherence_score': t['coherence_score'],
                'type': t['type']
            }
            for i, t in enumerate(thoughts)
        ],
        "summary": summary
    }


@router.post("/train-feedback")
async def train_feedback(request: TrainFeedbackRequest):
    """Endpoint to receive final user timeline and update training data."""
    loop = FeedbackLoop()
    result = loop.process_feedback(request.projectId, request.finalTimeline)
    return result
