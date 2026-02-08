# Transcript upload/export endpoints
import os
import re
import json
import uuid
import logging
from fastapi import APIRouter
from fastapi.responses import FileResponse

from db import SessionLocal, Project
from schemas import UploadTranscriptRequest, ExportTranscriptRequest
from core import distribute_word_timestamps, refine_word_timestamps_with_audio

logger = logging.getLogger(__name__)

router = APIRouter(tags=["transcripts"])

UPLOAD_DIR = "public/uploads"


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
