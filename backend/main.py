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

from expert_editor import analyze_transcript
from word_timing import distribute_word_timestamps, refine_word_timestamps_with_audio, find_zero_crossing
from professional_rough_cut_v2 import ProfessionalRoughCutV2
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

@app.post("/transcribe")
async def transcribe_generic(request: TranscribeRequest):
    # Find the file
    # request.videoPath comes as "/filename.mp4"
    filename = os.path.basename(request.videoPath)
    
    target_path = None
    target_project_id = None
    
    # 1. Check direct path in UPLOAD_DIR (if strictly matching)
    direct_path = os.path.join(UPLOAD_DIR, filename)
    if os.path.exists(direct_path):
        target_path = direct_path
    else:
        # 2. Search DB for matching original filename
        db = SessionLocal()
        try:
            db_project = db.query(models.Project).filter(models.Project.originalFileName == filename).first()
            if db_project:
                target_path = db_project.mediaPath
                target_project_id = db_project.id
        finally:
            db.close()
    
    if not target_path or not os.path.exists(target_path):
        # Fallback: check if videoPath is relative to root?
        # User might have "public/uploads/..." 
        possible_path = request.videoPath.lstrip('/')
        if os.path.exists(possible_path):
            target_path = possible_path
            
    if not target_path or not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail=f"Video file not found: {filename}")
        
    # --- Transcription Logic (Reused) ---
    # We create a dummy project if needed or use existing
    
    wav_path = target_path + ".wav"
    abs_wav_path = os.path.abspath(wav_path)
    
    try:
        # Extract audio if missing
        if not os.path.exists(wav_path):
            logger.info(f"Extracting audio to {wav_path}...")
            cmd = ["ffmpeg", "-y", "-i", target_path, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav_path]
            subprocess.run(cmd, check=True, capture_output=True)
            
        # Run Whisper
        if not os.path.exists(WHISPER_EXE):
             return {"success": False, "error": "Whisper not found"}
             
        logger.info(f"Running Whisper on {abs_wav_path}...")
        cmd = [
            WHISPER_EXE, "-m", WHISPER_MODEL_PATH, "-f", abs_wav_path, "-ml", "1", "-oj"
        ]
        process = subprocess.run(cmd, cwd=WHISPER_ROOT, check=False, capture_output=True)
        if process.returncode != 0:
             logger.error(f"Whisper error: {process.stderr.decode('utf-8')}")
             raise Exception("Whisper failed")
             
        # Parse JSON
        json_path = abs_wav_path + ".json"
        if os.path.exists(json_path):
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Extract words
            transcription = data.get("transcription", [])
            words = []
            
            BLACKLIST = {'BL', 'ANK', 'AUD', 'IO', '_', '[', ']', 'BLANK_AUDIO', '[BLANK_AUDIO]', 'SILENCE', '[SILENCE]', 'MUSIC', '[MUSIC]', 'APPLAUSE', '[APPLAUSE]'}
            
            for item in transcription:
                text = item.get("text", "").strip()
                start_ms = item.get("offsets", {}).get("from", 0)
                end_ms = item.get("offsets", {}).get("to", 0)
                
                if not text or text in BLACKLIST: continue
                
                # Split phrases into words to ensure word-level granularity
                sub_words = text.split()
                if not sub_words: continue
                
                # Use smart syllable-based distribution for better precision
                smart_words = distribute_word_timestamps(
                    sentence_start=start_ms / 1000.0,
                    sentence_end=end_ms / 1000.0,
                    words=sub_words
                )
                
                for sw in smart_words:
                    words.append({
                        "word": sw['word'],
                        "start": sw['start'], # Already in ms from utility
                        "end": sw['end'],
                        "type": "speech"
                    })
                
            # Cleanup
            try:
                os.remove(json_path)
                os.remove(wav_path)
            except: pass
            
            # Convert to structure expected by useTimeline 'transcribeAsset'
            # It expects { success: true, transcription: { words: [] } }
            return {
                "success": True, 
                "transcription": {
                    "words": words,
                    "text": "Generated transcript"
                }
            }
            
        else:
            raise Exception("No JSON output")

    except Exception as e:
        logger.error(f"Generic transcribe failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/transcription-progress")
async def get_transcription_progress(videoPath: str):
    # This is a stub to prevent 404 errors. 
    # Real progress tracking would require monitoring the Whisper output stream.
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
    db.delete(db_project)
    db.commit()
    
    return {"success": True}

import subprocess

# Path to Whisper.cpp
WHISPER_ROOT = r"c:/Users/USER/OneDrive/Desktop/Antigravity project/claude project rannie/my-video/whisper.cpp"
WHISPER_EXE = os.path.join(WHISPER_ROOT, "main.exe")
WHISPER_MODEL = "tiny.en" 
WHISPER_MODEL_PATH = os.path.join(WHISPER_ROOT, "models", f"ggml-{WHISPER_MODEL}.bin")

@app.post("/project/{project_id}/transcribe")
async def transcribe_project(project_id: str, db: Session = Depends(get_db)):
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    media_path = db_project.mediaPath
    
    # 1. Extract Audio to WAV (16kHz, Mono, PCM)
    wav_path = media_path + ".wav"
    abs_wav_path = os.path.abspath(wav_path)
    
    try:
        if not os.path.exists(wav_path):
            logger.info(f"Extracting audio to {wav_path}...")
            cmd = [
                "ffmpeg", "-y", "-i", media_path, 
                "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", 
                wav_path
            ]
            subprocess.run(cmd, check=True, capture_output=True)
    except Exception as e:
        logger.error(f"FFmpeg failed: {e}")
        raise HTTPException(status_code=500, detail="Audio extraction failed")
        
    # 2. Run Whisper.cpp
    if not os.path.exists(WHISPER_EXE):
        logger.error(f"Whisper executable not found at {WHISPER_EXE}")
        # Fallback to mock
        mock_segments = [
            models.Segment(projectId=project_id, start=0.0, end=2.0, text="Whisper binary not found.", type="speech"),
            models.Segment(projectId=project_id, start=2.0, end=5.0, text="Please check config.", type="speech")
        ]
        # Clear existing and add mock
        db.query(models.Segment).filter(models.Segment.projectId == project_id).delete()
        for s in mock_segments: db.add(s)
        db.commit()
        return {"success": True, "segments": mock_segments}
        
    try:
        logger.info(f"Running Whisper on {abs_wav_path}...")
        cmd = [
            WHISPER_EXE, 
            "-m", WHISPER_MODEL_PATH,
            "-f", abs_wav_path,
            "-ml", "1",
            "-oj"
        ]
        
        process = subprocess.run(cmd, cwd=WHISPER_ROOT, check=False, capture_output=True)
        
        if process.returncode != 0:
            logger.error(f"Whisper failed with code {process.returncode}")
            raise Exception("Whisper failed")
        
        # 3. Parse JSON Output
        json_path = abs_wav_path + ".json"
        BLACKLIST = {'BL', 'ANK', 'AUD', 'IO', '_', '[', ']', 'BLANK_AUDIO', '[BLANK_AUDIO]', 'SILENCE', '[SILENCE]', 'MUSIC', '[MUSIC]', 'APPLAUSE', '[APPLAUSE]'}
        
        if os.path.exists(json_path):
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            transcription = data.get("transcription", [])
            all_words = []
            
            for item in transcription:
                text = item.get("text", "").strip()
                start_ms = item.get("offsets", {}).get("from", 0)
                end_ms = item.get("offsets", {}).get("to", 0)
                
                if not text or text in BLACKLIST: continue
                
                sub_words = text.split()
                if not sub_words: continue
                
                smart_words = distribute_word_timestamps(
                    sentence_start=start_ms / 1000.0,
                    sentence_end=end_ms / 1000.0,
                    words=sub_words
                )
                
                for sw in smart_words:
                    all_words.append({
                        "text": sw['word'],
                        "start": sw['start'] / 1000.0,
                        "end": sw['end'] / 1000.0,
                        "type": "speech"
                    })
            
            # Apply Expert Analysis
            ms_for_analysis = [{"word": w["text"], "start": w["start"] * 1000, "end": w["end"] * 1000} for w in all_words]
            analyzed_ms = analyze_transcript(ms_for_analysis)
            
            # 4. Save to Database
            # Clear old segments
            db.query(models.Segment).filter(models.Segment.projectId == project_id).delete()
            
            final_segments = []
            for i, w in enumerate(all_words): 
                 seg = models.Segment(
                     projectId=project_id,
                     start=w['start'],
                     end=w['end'],
                     text=w['text'],
                     type=w.get('type', 'speech'),
                     isDeleted=analyzed_ms[i].get('isDeleted', False) 
                 )
                 db.add(seg)
                 final_segments.append(seg)
            
            db.commit()
            
            # --- STORAGE CLEANUP ---
            # Delete temporary .wav and .json files after processing
            try:
                if os.path.exists(json_path): os.remove(json_path)
                if os.path.exists(wav_path): os.remove(wav_path)
                logger.info(f"Cleaned up temporary transcription files for {project_id}")
            except Exception as e:
                logger.error(f"Temp cleanup failed: {e}")
            
            return {"success": True, "segments": final_segments}
        else:
             raise Exception("Output JSON not generated")

    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

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
        # Supports 00:00:00.000 or 00:00:00,000 or 00:00.000
        t_str = t_str.replace(',', '.')
        try:
            parts = t_str.split(':')
            if len(parts) == 3:
                h, m, s = parts
                return int(h) * 3600 + int(m) * 60 + float(s)
            elif len(parts) == 2:
                m, s = parts
                return int(m) * 60 + float(s)
        except:
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
            from expert_editor import analyze_transcript
            words = analyze_transcript(words)
            
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
    # Pattern: 00:00:41,366 --> 00:00:43,066
    vtt_pattern = re.compile(r'(\d{1,2}:?\d{2}:\d{2}[.,]\d{3})\s-->\s(\d{1,2}:?\d{2}:\d{2}[.,]\d{3})')
    
    lines = text.split('\n')
    has_vtt = any(vtt_pattern.search(line) for line in lines[:20]) # Check first 20 lines
    
    if has_vtt:
        current_start = 0.0
        current_end = 0.0
        
        for line in lines:
            line = line.strip()
            if not line: continue
            
            # Check for timestamp
            match = vtt_pattern.search(line)
            if match:
                current_start = parse_time(match.group(1))
                current_end = parse_time(match.group(2))
                continue
                
            # If line is just numbers (cue ID), skip
            if line.isdigit():
                continue
                
            # It's text content
            # Clean HTML tags if any
            line = re.sub(r'<[^>]+>', '', line)
            
            # Use smart word timing estimation based on syllables
            line_words = line.split()
            if not line_words: continue
            
            # Use syllable-based distribution
            smart_words = distribute_word_timestamps(
                sentence_start=current_start,
                sentence_end=current_end,
                words=line_words
            )
            
            # Optional: Refine with audio if projectId is known
            if request.projectId:
                db = SessionLocal()
                try:
                    db_project = db.query(models.Project).filter(models.Project.id == request.projectId).first()
                    if db_project:
                        # Ensure we have audio
                        wav_path = db_project.mediaPath + ".wav"
                        if os.path.exists(wav_path):
                            smart_words = refine_word_timestamps_with_audio(
                                words=smart_words,
                                audio_path=wav_path,
                                start_sec=current_start,
                                end_sec=current_end
                            )
                finally:
                    db.close()
            
            words.extend(smart_words)
        
        from expert_editor import analyze_transcript
        words = analyze_transcript(words)
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
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
