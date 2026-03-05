# Transcript upload/export endpoints
import os
import re
import json
import uuid
import logging
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import FileResponse
from core.limiter import limiter
from sqlalchemy.orm import Session

from db import Project, get_db
from schemas import UploadTranscriptRequest, ExportTranscriptRequest, TranscribeRequest
from core import distribute_word_timestamps, refine_word_timestamps_with_audio
from core.transcriber import WhisperTranscriber
from background_tasks import start_background_task, update_task_progress
from core.config import settings

logger = logging.getLogger(__name__)

from core.limiter import limiter

router = APIRouter(tags=["transcripts"])

UPLOAD_DIR = str(settings.upload_dir)

# Global transcriber instance (lazy loaded)
transcriber = WhisperTranscriber()

# Progress tracking moved to app.state

@router.post("/transcribe")
@limiter.limit("2/minute")
def transcribe_media(request: Request, transcribe_data: TranscribeRequest, db: Session = Depends(get_db)):
    """
    Transcribe a video/audio file using Faster-Whisper.
    """
    logger.info(f"Received transcription request for: {transcribe_data.videoPath}")
    
    # We need to resolve this to an absolute path
    rel_path = transcribe_data.videoPath.lstrip('/')
    abs_path = None

    # 1. PRIORITY: Resolve via projectId and DB
    if transcribe_data.projectId:
        db_project = db.query(Project).filter(Project.id == transcribe_data.projectId).first()
        if db_project and db_project.mediaPath and os.path.exists(db_project.mediaPath):
            abs_path = db_project.mediaPath
            logger.info(f"Resolved path from DB for project {transcribe_data.projectId}: {abs_path}")

    # 2. Check if it's already an absolute path in the container
    if not abs_path and transcribe_data.videoPath.startswith('/app/') and os.path.exists(transcribe_data.videoPath):
        abs_path = transcribe_data.videoPath

    # 3. Try primary relative path resolution
    if not abs_path:
        test_path = os.path.join(os.getcwd(), "public", rel_path)
        if os.path.exists(test_path):
            abs_path = test_path
        else:
            test_path = os.path.join(os.getcwd(), rel_path)
            if os.path.exists(test_path):
                abs_path = test_path

    # 4. Final Fallback: Recursive file search in upload directory
    if not abs_path:
        filename = os.path.basename(rel_path)
        logger.info(f"File not found at primary locations. Searching for '{filename}'...")
        
        found_path = None
        search_root = UPLOAD_DIR
        if transcribe_data.projectId:
            possible_project_dir = os.path.join(UPLOAD_DIR, transcribe_data.projectId)
            if os.path.exists(possible_project_dir):
                search_root = possible_project_dir

        for root, dirs, files in os.walk(search_root):
            for f in files:
                if f.lower() == filename.lower():
                    found_path = os.path.join(root, f)
                    break
            if found_path: break
        
        if not found_path and search_root != UPLOAD_DIR:
            for root, dirs, files in os.walk(UPLOAD_DIR):
                for f in files:
                    if f.lower() == filename.lower():
                        found_path = os.path.join(root, f)
                        break
                if found_path: break

        if found_path:
            logger.info(f"Fallback found file at: {found_path}")
            abs_path = os.path.abspath(found_path)
        else:
            is_frontend_id = transcribe_data.projectId and transcribe_data.projectId.startswith("asset-")
            if is_frontend_id:
                logger.error(f"File not found: {transcribe_data.videoPath} — projectId '{transcribe_data.projectId}' is a frontend asset ID.")
                return {"success": False, "error": "Upload not complete yet."}
            
            logger.error(f"File not found: {transcribe_data.videoPath} (projectId: {transcribe_data.projectId})")
            return {"success": False, "error": f"File not found: {filename}."}
        
    try:
        # Update progress to started
        request.app.state.transcription_progress[transcribe_data.videoPath] = 10
        
        def on_progress(pct: int):
            request.app.state.transcription_progress[transcribe_data.videoPath] = pct
        
        # Run transcription
        result = transcriber.transcribe(abs_path, progress_callback=on_progress)
        
        # Update progress to finished
        request.app.state.transcription_progress[transcribe_data.videoPath] = 100
        
        # Persist to DB if projectId is provided
        if transcribe_data.projectId:
            try:
                from db import Segment as DBSegment
                db.query(DBSegment).filter(DBSegment.projectId == transcribe_data.projectId).delete()
                
                for w in result.get('words', []):
                    db_seg = DBSegment(
                        projectId=transcribe_data.projectId,
                        start=w['start'] / 1000.0,
                        end=w['end'] / 1000.0,
                        text=w['word'],
                        type="speech"
                    )
                    db.add(db_seg)
                db.commit()
                logger.info(f"Persisted {len(result.get('words', []))} segments for project {transcribe_data.projectId}")
            except Exception as e:
                logger.error(f"Failed to persist segments: {e}")
                db.rollback()
        
        return {
            "success": True,
            "transcription": result,
            "segments": [
                {
                    "start": w['start'] / 1000.0,
                    "end": w['end'] / 1000.0,
                    "text": w['word'],
                    "type": "speech",
                    "isDeleted": False
                } for w in result.get('words', [])
            ] if transcribe_data.projectId else None
        }
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        return {"success": False, "error": str(e)}

@router.post("/project/{project_id}/refine-transcript")
async def refine_transcript(project_id: str, db: Session = Depends(get_db)):
    """
    Refine existing transcript timings using audio analysis.
    """
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return {"success": False, "error": "Project not found"}
            
        # Get existing words
        # We need to fetch from DB segments? Or assume frontend sends them?
        # The request doesn't include words, so we must load from DB or Project.segments
        
        # Start from project media path
        if not os.path.exists(project.mediaPath):
             return {"success": False, "error": "Media file not found"}
             
        # We need the current transcript. 
        # API design issue: Project model stores segments, but not raw 'words' blob usually?
        # Let's check Project schema...
        # Project has 'segments' relationship.
        
        current_words = []
        for s in project.segments:
             current_words.append({
                 "word": s.text,
                 "start": s.start * 1000,
                 "end": s.end * 1000,
                 "type": s.type
             })
             
        if not current_words:
            return {"success": False, "error": "No transcript to refine"}
            
        # Refine
        refined_words = refine_word_timestamps_with_audio(
            words=current_words,
            audio_path=project.mediaPath, # Audio lib handles video files too usually via ffmpeg
            start_sec=0,
            end_sec=project.duration
        )
        
        # Save back to DB? 
        # Or just return for frontend to preview?
        # Let's save back to DB to make it permanent.
        
        # We need to map back to segments.
        # This is tricky because existing segments might be "cut" or "deleted".
        # Refinement should theoretically just shift timestamps.
        
        # Ideally, we update the segments in place.
        for i, refined in enumerate(refined_words):
            if i < len(project.segments):
                seg = project.segments[i]
                seg.start = refined['start'] / 1000.0
                seg.end = refined['end'] / 1000.0
                
        db.commit()
        
        return {
            "success": True, 
            "words": refined_words,
            "message": f"Refined {len(refined_words)} words"
        }
        
    except Exception as e:
        logger.error(f"Refinement failed: {e}")
        db.rollback()
        return {"success": False, "error": str(e)}




@router.post("/upload-transcript")
async def upload_transcript_manual(request: UploadTranscriptRequest, db: Session = Depends(get_db)):
    """Upload and parse a transcript file (SRT, VTT, JSON, or plain text)."""
    logger.info(f"Received manual transcript upload: {request.fileName} (size: {len(request.content)})")
    if request.projectId:
        logger.info(f"Target Project ID: {request.projectId}")
    
    def parse_time(t_str):
        """Parse timestamp string to seconds."""
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
            for w in data["words"]:
                words.append({
                    "word": w.get("word", ""),
                    "start": w.get("start", 0) * 1000 if w.get("start", 0) < 10000 else w.get("start", 0),
                    "end": w.get("end", 0) * 1000 if w.get("end", 0) < 10000 else w.get("end", 0),
                    "type": w.get("type", "speech")
                })
            
            return {
                "success": True, 
                "transcription": {
                    "words": words,
                    "text": " ".join([w['word'] for w in words])
                }
            }
    except:
        pass  # Not JSON

    # Check for VTT-style timestamps
    vtt_pattern = re.compile(r'((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{2,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{2,3})')
    
    # Handle UTF-8 BOM
    if text.startswith('\ufeff'):
        text = text[1:]
        
    lines = text.split('\n')
    has_vtt = any(vtt_pattern.search(line) for line in lines[:30])
    
    if has_vtt:
        logger.info("Detected SRT/VTT format")
        current_start = 0.0
        current_end = 0.0
        block_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
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
            
            match = vtt_pattern.search(line)
            if match:
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
                continue
                
            if line.isdigit():
                continue
                
            line = re.sub(r'<[^>]+>', '', line)
            if line:
                block_lines.append(line)
        
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

        # Refine with audio if projectId is known
        if words and request.projectId:
            db_project = db.query(Project).filter(Project.id == request.projectId).first()
            if db_project:
                wav_path = db_project.mediaPath + ".wav"
                if os.path.exists(wav_path):
                    words = refine_word_timestamps_with_audio(
                        words=words,
                        audio_path=wav_path,
                        start_sec=words[0]['start']/1000,
                        end_sec=words[-1]['end']/1000
                    )
    else:
        # Fallback to crude splitting
        raw_words = text.split()
        for i, w in enumerate(raw_words):
            words.append({
                "word": w,
                "start": i * 500,
                "end": (i * 500) + 400,
                "type": "speech"
            })
        
    return {
        "success": True, 
        "transcription": {
            "words": words,
            "text": text
        }
    }


@router.post("/export-transcript")
async def export_transcript(request: ExportTranscriptRequest):
    """Export transcript to downloadable file."""
    words = request.transcription.get('words', [])
    output_lines = []
    
    for w in words:
        # words in frontend/transcription blob are in milliseconds
        start_ms = w.get('start', 0)
        start_sec = start_ms / 1000.0
        
        hours = int(start_sec // 3600)
        minutes = int((start_sec % 3600) // 60)
        seconds = int(start_sec % 60)
        timestamp = f"[{hours:02}:{minutes:02}:{seconds:02}]"
        
        output_lines.append(f"{timestamp} {w.get('word', '')}")
        
    content = "\n".join(output_lines)
    
    temp_filename = f"transcript_{uuid.uuid4()}.txt"
    temp_path = os.path.join(UPLOAD_DIR, temp_filename)
    
    with open(temp_path, "w", encoding="utf-8") as f:
        f.write(content)
        
    return FileResponse(temp_path, filename=temp_filename, media_type="text/plain")
