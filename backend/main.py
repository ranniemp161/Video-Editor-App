import os
import uuid
import json
import logging
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import shutil
from pathlib import Path

# from expert_editor import analyze_transcript
from word_timing import distribute_word_timestamps, refine_word_timestamps_with_audio, find_zero_crossing
from professional_rough_cut_v2 import ProfessionalRoughCutV2
from feedback_loop import FeedbackLoop
from thought_grouper import ThoughtGrouper

from database import SessionLocal, engine, Base, get_db
import models
from sqlalchemy.orm import Session
from fastapi import Depends

# Create tables
Base.metadata.create_all(bind=engine)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data Models ---

class Segment(BaseModel):
    start: float
    end: float
    text: str
    type: str = "speech"
    isDeleted: bool = False

class ProjectState(BaseModel):
    projectId: str
    mediaPath: str
    segments: List[Segment]
    duration: float
    originalFileName: Optional[str] = None



class TranscribeRequest(BaseModel):
    videoPath: str
    duration: float

# Transcription endpoint removed - Whisper integration no longer needed

@app.get("/transcription-progress")
async def get_transcription_progress(videoPath: str):
    # Stub endpoint for compatibility
    return {"progress": 0, "status": "processing"}





# In-memory storage (Remove in favor of DB)
# projects = {}
UPLOAD_DIR = "public/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# --- Helpers ---

def cleanup_orphaned_files(db: Session):
    """Delete files in UPLOAD_DIR that are not referenced in the database."""
    try:
        db_files = {os.path.basename(p.mediaPath) for p in db.query(models.Project).all()}
        # Also include active rendering/temp files if naming convention allows
        # For now, just protect files created in the last 10 minutes to avoid deleting active uploads
        import time
        now = time.time()
        
        for item in os.listdir(UPLOAD_DIR):
            item_path = os.path.join(UPLOAD_DIR, item)
            
            # 1. Handle project directories (the new structure)
            if os.path.isdir(item_path):
                if item not in db_files and (now - os.path.getmtime(item_path)) > 600:
                    logger.info(f"Cleaning up orphaned project directory: {item}")
                    try:
                        shutil.rmtree(item_path)
                    except Exception as e:
                        logger.error(f"Failed to delete directory {item}: {e}")
                continue
            
            # 2. Handle legacy flat files (cleanup old versions)
            filename = item
            if filename not in db_files and (now - os.path.getmtime(item_path)) > 600:
                logger.info(f"Cleaning up orphaned file: {filename}")
                try:
                    os.remove(item_path)
                    # Also try to remove matching .wav, .json etc
                    base = os.path.splitext(item_path)[0]
                    for ext in ['.wav', '.json', '.txt']:
                        if os.path.exists(base + ext):
                            os.remove(base + ext)
                except Exception as e:
                    logger.error(f"Failed to delete {filename}: {e}")
    except Exception as e:
        logger.error(f"Orphan cleanup failed: {e}")

@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    try:
        cleanup_orphaned_files(db)
    finally:
        db.close()

# --- Endpoints ---

@app.get("/")
def read_root():
    return {"message": "Gling-like Video Editor Backend API"}

@app.post("/upload")
async def upload_video(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        file_id = str(uuid.uuid4())
        project_dir = os.path.join(UPLOAD_DIR, file_id)
        os.makedirs(project_dir, exist_ok=True)
        
        # Preserve original filename for Resolve compatibility
        file_path = os.path.join(project_dir, file.filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Initialize Database Entry
        import time
        db_project = models.Project(
            id=file_id,
            mediaPath=file_path,
            duration=0.0,
            originalFileName=file.filename,
            createdAt=time.time()
        )
        db.add(db_project)
        db.commit()
        
        return {"success": True, "projectId": file_id, "filePath": f"/uploads/{file_id}/{file.filename}"}
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/project/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Map to ProjectState model
    return {
        "projectId": db_project.id,
        "mediaPath": db_project.mediaPath,
        "duration": db_project.duration,
        "originalFileName": db_project.originalFileName,
        "segments": [
            {
                "start": s.start,
                "end": s.end,
                "text": s.text,
                "type": s.type,
                "isDeleted": s.isDeleted
            } for s in db_project.segments
        ]
    }

@app.delete("/project/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # 1. Delete associated files
    media_path = db_project.mediaPath
    try:
        if os.path.exists(media_path):
            os.remove(media_path)
            # Try to remove sidecars/temps
            base = os.path.splitext(media_path)[0]
            for ext in ['.wav', '.json', '.txt', '.srt', '.vtt']:
                sidecar = base + ext
                if os.path.exists(sidecar):
                    os.remove(sidecar)
    except Exception as e:
        logger.error(f"Error deleting files for project {project_id}: {e}")

    # 2. Delete from DB
    try:
        # Explicitly delete segments first to avoid cascade issues or foreign key constraints
        db.query(models.Segment).filter(models.Segment.projectId == project_id).delete()
        
        db.delete(db_project)
        db.commit()
    except Exception as e:
        logger.error(f"Error deleting project from DB {project_id}: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error during deletion: {str(e)}")
    
    return {"success": True}

import subprocess

# Project transcription endpoint removed - Whisper integration no longer needed

@app.put("/project/{project_id}/segments")
async def update_segments(project_id: str, segments: List[Segment], db: Session = Depends(get_db)):
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Replace segments
    db.query(models.Segment).filter(models.Segment.projectId == project_id).delete()
    for s in segments:
        db_seg = models.Segment(
            projectId=project_id,
            start=s.start,
            end=s.end,
            text=s.text,
            type=s.type,
            isDeleted=s.isDeleted
        )
        db.add(db_seg)
    
    db.commit()
    return {"success": True}

class UploadTranscriptRequest(BaseModel):
    content: str
    fileName: str
    projectId: Optional[str] = None

@app.post("/upload-transcript")
async def upload_transcript_manual(request: UploadTranscriptRequest):
    import re
    logger.info(f"Received manual transcript upload: {request.fileName} (size: {len(request.content)})")
    if request.projectId:
        logger.info(f"Target Project ID: {request.projectId}")
    
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
            logger.warning(f"Failed to parse time '{t_str}': {e}")
            return 0.0
        return 0.0

    text = request.content
    words = []
    
    # Check if it's JSON
    try:
        data = json.loads(text)
        if isinstance(data, dict) and "words" in data:
            # Word-level JSON support
            for w in data["words"]:
                # Ensure start/end are in ms for frontend
                words.append({
                    "word": w.get("word", ""),
                    "start": w.get("start", 0) * 1000 if w.get("start", 0) < 10000 else w.get("start", 0), # heuristics for sec vs ms
                    "end": w.get("end", 0) * 1000 if w.get("end", 0) < 10000 else w.get("end", 0),
                    "type": w.get("type", "speech")
                })
            # from expert_editor import analyze_transcript
            # words = analyze_transcript(words)
            
            return {
                "success": True, 
                "transcription": {
                    "words": words,
                    "text": " ".join([w['word'] for w in words])
                }
            }
    except:
        pass # Not JSON

    # Check for VTT-style timestamps
    # Pattern: 00:00:41,366 --> 00:00:43,066 (Flexible whitespace)
    # Improved regex to support optional hours (MM:SS,mmm or H:MM:SS,mmm)
    # Using non-capturing group (?:...) for optional hours part so that main groups remain 1 and 2
    vtt_pattern = re.compile(r'((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{2,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{2,3})')
    
    # Handle UTF-8 BOM
    if text.startswith('\ufeff'):
        text = text[1:]
        
    lines = text.split('\n')
    has_vtt = any(vtt_pattern.search(line) for line in lines[:30]) # Check first 30 lines
    
    if has_vtt:
        logger.info("Detected SRT/VTT format")
        current_start = 0.0
        current_end = 0.0
        block_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
                # End of block reached? Process accumulated lines for this timestamp
                if block_lines and current_end > current_start:
                    all_text = " ".join(block_lines)
                    line_words = all_text.split()
                    if line_words:
                        smart_words = distribute_word_timestamps(
                            sentence_start=current_start,
                            sentence_end=current_end,
                            words=line_words
                        )
                        words.extend(smart_words)
                    block_lines = []
                continue
            
            # Check for timestamp
            match = vtt_pattern.search(line)
            if match:
                # If we had a previous block without a blank line separator, process it now
                if block_lines and current_end > current_start:
                    all_text = " ".join(block_lines)
                    line_words = all_text.split()
                    if line_words:
                        smart_words = distribute_word_timestamps(
                            sentence_start=current_start,
                            sentence_end=current_end,
                            words=line_words
                        )
                        words.extend(smart_words)
                    block_lines = []
                    
                t1_str = match.group(1)
                t2_str = match.group(2)
                current_start = parse_time(t1_str)
                current_end = parse_time(t2_str)
                # logger.debug(f"Parsed timestamp: {t1_str} -> {t2_str} ({current_start} -> {current_end})")
                continue
                
            # If line is just numbers (cue ID), skip
            if line.isdigit():
                continue
                
            # It's text content
            # Clean HTML tags if any
            line = re.sub(r'<[^>]+>', '', line)
            if line:
                block_lines.append(line)
        
        # Process final block if file doesn't end with blank line
        if block_lines and current_end > current_start:
            all_text = " ".join(block_lines)
            line_words = all_text.split()
            if line_words:
                smart_words = distribute_word_timestamps(
                    sentence_start=current_start,
                    sentence_end=current_end,
                    words=line_words
                )
                words.extend(smart_words)

        # Optional: Refine with audio if projectId is known
        if words and request.projectId:
            db = SessionLocal()
            try:
                db_project = db.query(models.Project).filter(models.Project.id == request.projectId).first()
                if db_project:
                    wav_path = db_project.mediaPath + ".wav"
                    if os.path.exists(wav_path):
                        # Group by original sentence boundaries for better refinement?
                        # For now, just pass all words
                        words = refine_word_timestamps_with_audio(
                            words=words,
                            audio_path=wav_path,
                            start_sec=words[0]['start']/1000,
                            end_sec=words[-1]['end']/1000
                        )
            finally:
                db.close()
        
        # from expert_editor import analyze_transcript
        # words = analyze_transcript(words)
    else:
        # Fallback to crude splitting (e.g. for plain txt)
        raw_words = text.split()
        for i, w in enumerate(raw_words):
            words.append({
                "word": w,
                "start": i * 500, # 500ms per word
                "end": (i * 500) + 400,
                "type": "speech"
            })
        
        # DISABLED: Auto-expert analysis
        # words = analyze_transcript(words)
        
    return {
        "success": True, 
        "transcription": {
            "words": words,
            "text": text
        }
    }

class ExportTranscriptRequest(BaseModel):
    transcription: dict
    format: str

@app.post("/export-transcript")
async def export_transcript(request: ExportTranscriptRequest):
    # Generate a temp file and return it
    # Format: [00:00:00] Word
    
    words = request.transcription.get('words', [])
    output_lines = []
    
    for w in words:
        start_sec = w.get('start', 0)
        # Format HH:MM:SS
        hours = int(start_sec // 3600)
        minutes = int((start_sec % 3600) // 60)
        seconds = int(start_sec % 60)
        timestamp = f"[{hours:02}:{minutes:02}:{seconds:02}]"
        
        output_lines.append(f"{timestamp} {w.get('word', '')}")
        
    content = "\n".join(output_lines)
    
    # Create temp file
    temp_filename = f"transcript_{uuid.uuid4()}.txt"
    temp_path = os.path.join(UPLOAD_DIR, temp_filename)
    
    with open(temp_path, "w", encoding="utf-8") as f:
        f.write(content)
        
    return FileResponse(temp_path, filename=temp_filename, media_type="text/plain")

class AssetInfo(BaseModel):
    id: str
    name: str
    duration: float

class TrainFeedbackRequest(BaseModel):
    projectId: str
    finalTimeline: dict

@app.post("/train-feedback")
async def train_feedback(request: TrainFeedbackRequest):
    """
    Endpoint to receive final user timeline and update training data.
    """
    loop = FeedbackLoop()
    result = loop.process_feedback(request.projectId, request.finalTimeline)
    return result

class AutoCutRequest(BaseModel):
    words: List[dict]
    asset: AssetInfo
    trackId: str

@app.post("/auto-cut")
async def auto_cut(request: AutoCutRequest):
    """
    Professional rough cut following industry-standard editing principles:
    1. Silence & Pause Management (>2s removed)
    2. Repetition Handling (keep LAST version)
    3. "Cut That" Signal Processing
    4. Incomplete Sentence Detection
    """
    
    # 1. Normalize words to seconds if they are in ms
    normalized_words = []
    for w in request.words:
        nw = w.copy()
        # Handle word vs text key
        if 'word' not in nw and 'text' in nw:
            nw['word'] = nw['text']
            
        # Detect units (heuristically check if timestamps are in ms)
        if nw.get('start', 0) > request.asset.duration * 1.1:
            nw['start'] /= 1000.0
            nw['end'] /= 1000.0
            
        normalized_words.append(nw)

    # 2. Run Professional Rough Cut Analysis
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
    
    # 3. Load audio for zero-crossing snapping if possible
    audio_buffer = None
    sr = 16000
    db = SessionLocal()
    try:
        db_project = db.query(models.Project).filter(models.Project.id == request.asset.id).first()
        if db_project and os.path.exists(db_project.mediaPath):
            # Extract/Load a bit of audio to find zero crossings
            # To be efficient, we'll load the whole audio as it's usually small enough for librosa
            # or we could load snippets. For now, let's load the whole thing if it's not too long.
            wav_path = db_project.mediaPath + ".wav"
            if os.path.exists(wav_path):
                audio_buffer, _ = librosa.load(wav_path, sr=sr)
    except Exception as e:
        logger.warning(f"Auto-cut: Could not load audio for snapping: {e}")
    finally:
        db.close()

    # 4. Convert segments to Timeline Clips
    clips = []
    timeline_pos = 0.0
    
    import time
    
    for i, seg in enumerate(segments):
        trim_start = seg['start']
        trim_end = seg['end']
        
        # Snap to zero crossings to avoid clicks
        if audio_buffer is not None:
            trim_start = find_zero_crossing(audio_buffer, sr, trim_start)
            trim_end = find_zero_crossing(audio_buffer, sr, trim_end)
            
        # Calculate duration after snapping
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

class AnalyzeThoughtsRequest(BaseModel):
    words: List[dict]

@app.post("/analyze-thoughts")
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
        
        # Heuristic: if start > 10000, assume ms
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



if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
