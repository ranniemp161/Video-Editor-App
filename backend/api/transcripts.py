# Transcript upload/export endpoints
import os
import re
import json
import uuid
import logging
from fastapi import APIRouter
from fastapi.responses import FileResponse


from db import SessionLocal, Project
from schemas import UploadTranscriptRequest, ExportTranscriptRequest, TranscribeRequest
from core import distribute_word_timestamps, refine_word_timestamps_with_audio
from core.transcriber import WhisperTranscriber
from background_tasks import start_background_task, update_task_progress

logger = logging.getLogger(__name__)

router = APIRouter(tags=["transcripts"])

UPLOAD_DIR = "public/uploads"

# Global transcriber instance (lazy loaded)
transcriber = WhisperTranscriber()

@router.post("/transcribe")
def transcribe_media(request: TranscribeRequest):
    """
    Transcribe a video/audio file using Faster-Whisper.
    """
    logger.info(f"Received transcription request for: {request.videoPath}")
    
    # Check if file exists
    # videoPath from frontend is relative to project root or public?
    # Usually it's like "/uploads/uuid/file.mp4"
    
    # We need to resolve this to an absolute path
    # Assuming public/uploads is where they are
    
    rel_path = request.videoPath.lstrip('/')
    abs_path = os.path.join(os.getcwd(), "public", rel_path)
    
    if not os.path.exists(abs_path):
        # Try without "public" if it's already included
        abs_path = os.path.join(os.getcwd(), rel_path)
        
    if not os.path.exists(abs_path):
        # Fallback: Search in public/uploads recursively
        # This handles cases where frontend sends just the filename (e.g. "/MyVideo.mp4")
        # but the file is stored in public/uploads/{uuid}/MyVideo.mp4
        filename = os.path.basename(rel_path)
        logger.info(f"File not found at {abs_path}. Searching for '{filename}' in uploads...")
        
        found_path = None
        for root, dirs, files in os.walk(UPLOAD_DIR):
            if filename in files:
                found_path = os.path.join(root, filename)
                break
        
        if found_path:
            logger.info(f"Found file at: {found_path}")
            abs_path = os.path.abspath(found_path)
        else:
            logger.error(f"File not found: {abs_path} (and not found in uploads search)")
            return {"success": False, "error": "File not found"}
        
    try:
        # Run transcription (Synchronous for now, but faster-whisper is fast)
        # For very long videos, we should use background tasks, but user complained about 29m wait.
        # Faster-whisper should take ~2-3 mins for 25 mins on CPU, seconds on GPU.
        
        # Determine model size based on duration? Or just use small/medium.
        result = transcriber.transcribe(abs_path, model_size="medium")
        
        return {
            "success": True,
            "transcription": result
        }
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        return {"success": False, "error": str(e)}

@router.post("/project/{project_id}/refine-transcript")
async def refine_transcript(project_id: str):
    """
    Refine existing transcript timings using audio analysis.
    """
    db = SessionLocal()
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
        return {"success": False, "error": str(e)}
    finally:
        db.close()




@router.post("/upload-transcript")
async def upload_transcript_manual(request: UploadTranscriptRequest):
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
            db = SessionLocal()
            try:
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
            finally:
                db.close()
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
        start_sec = w.get('start', 0)
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
