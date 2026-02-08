# Editing endpoints (auto-cut, analyze thoughts, train feedback)
import os
import time
import logging
from typing import List
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from db import SessionLocal, Project, RoughCutResult, get_db
from schemas import AutoCutRequest, AnalyzeThoughtsRequest, TrainFeedbackRequest
from core import ProfessionalRoughCutV2, ThoughtGrouper, find_zero_crossing
from feedback_loop import FeedbackLoop
from background_tasks import start_background_task, get_task_status

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
    
    # Save rough cut results to database for session recovery
    db = SessionLocal()
    try:
        # Delete existing result if any
        db.query(RoughCutResult).filter(RoughCutResult.projectId == request.asset.id).delete()
        
        # Create new result
        rough_cut_result = RoughCutResult(
            projectId=request.asset.id,
            clips=clips,
            statistics=stats,
            status="completed",
            createdAt=time.time(),
            completedAt=time.time()
        )
        db.add(rough_cut_result)
        db.commit()
        logger.info(f"Saved rough cut results to database for project {request.asset.id}")
    except Exception as e:
        logger.error(f"Failed to save rough cut results: {e}")
        db.rollback()
    finally:
        db.close()
    
    return {
        "clips": clips,
        "words": request.words,
        "statistics": stats
    }


@router.get("/rough-cut-status/{project_id}")
async def get_rough_cut_status(project_id: str, db: Session = Depends(get_db)):
    """Get saved rough cut results for a project (for session recovery)."""
    result = db.query(RoughCutResult).filter(RoughCutResult.projectId == project_id).first()
    
    if not result:
        return {"found": False}
    
    return {
        "found": True,
        "clips": result.clips,
        "statistics": result.statistics,
        "status": result.status,
        "createdAt": result.createdAt,
        "completedAt": result.completedAt
    }


@router.get("/processing-status/{task_id}")
async def get_processing_status(task_id: str):
    """Get the status of a background processing task."""
    status = get_task_status(task_id)
    
    if not status:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return status


@router.delete("/cleanup-project/{project_id}")
async def cleanup_project(project_id: str, db: Session = Depends(get_db)):
    """Delete project files and database records."""
    from api.projects import delete_project
    return delete_project(project_id, db)


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


from schemas import ExportEDLRequest, ExportXMLRequest
from fastapi.responses import Response
import io


def seconds_to_timecode(seconds: float, fps: int = 30) -> str:
    """Convert seconds to timecode format HH:MM:SS:FF"""
    total_frames = round(seconds * fps)
    hours = total_frames // (fps * 3600)
    minutes = (total_frames % (fps * 3600)) // (fps * 60)
    secs = (total_frames % (fps * 60)) // fps
    frames = total_frames % fps
    return f"{hours:02d}:{minutes:02d}:{secs:02d}:{frames:02d}"


@router.post("/export-edl")
async def export_edl(request: ExportEDLRequest, cleanup: bool = False, db: Session = Depends(get_db)):
    """
    Export timeline as CMX 3600 EDL format for DaVinci Resolve.
    Returns the EDL file content directly as a downloadable file.
    """
    tracks = request.timeline.tracks
    assets = request.assets
    
    # Find video track
    video_track = next((t for t in tracks if t.type == 'video'), None)
    if not video_track or not video_track.clips:
        return {"success": False, "error": "No video clips to export"}
    
    # Sort clips by start time
    video_clips = sorted(video_track.clips, key=lambda c: c.start)
    
    # Build EDL content
    edl_lines = [
        "TITLE: Rough Cut Export",
        "FCM: NON-DROP FRAME",
        ""
    ]
    
    record_in = 0.0
    
    for idx, clip in enumerate(video_clips):
        # Find matching asset
        asset = next((a for a in assets if a.id == clip.assetId), None)
        if not asset:
            continue
        
        duration = clip.end - clip.start
        if duration <= 0:
            continue
        
        # Get clip name (max 8 chars for EDL reel name)
        clip_name = clip.sourceFileName or clip.name or asset.name or "CLIP"
        reel_name = clip_name[:8].upper().replace(" ", "_")
        
        # Source in/out (from original video)
        source_in = clip.trimStart
        source_out = source_in + duration
        
        # Record in/out (on timeline)
        record_out = record_in + duration
        
        # Event number (3 digits)
        event_num = f"{idx + 1:03d}"
        
        # EDL line format: {event} {reel} {track} {edit} {src_in} {src_out} {rec_in} {rec_out}
        edl_lines.append(
            f"{event_num}  {reel_name.ljust(8)} V     C        "
            f"{seconds_to_timecode(source_in)} {seconds_to_timecode(source_out)} "
            f"{seconds_to_timecode(record_in)} {seconds_to_timecode(record_out)}"
        )
        
        # Add clip name comment
        edl_lines.append(f"* FROM CLIP NAME: {clip_name}")
        
        # Add source file comment if available
        if asset.src:
            edl_lines.append(f"* SOURCE FILE: {asset.src}")
        
        edl_lines.append("")
        
        record_in = record_out
    
    edl_content = "\n".join(edl_lines)
    
    logger.info(f"EDL Export: Generated {len(video_clips)} events")
    
    # Cleanup project files if requested
    if cleanup and video_clips:
        # Get project ID from first asset
        first_asset_id = video_clips[0].assetId
        try:
            from api.projects import delete_project
            delete_project(first_asset_id, db)
            logger.info(f"Cleaned up project {first_asset_id} after EDL export")
        except Exception as e:
            logger.error(f"Failed to cleanup project after export: {e}")
    
    return Response(
        content=edl_content,
        media_type="text/plain",
        headers={
            "Content-Disposition": f"attachment; filename=rough_cut_{int(time.time())}.edl"
        }
    )


@router.post("/export-xml")
async def export_xml(request: ExportXMLRequest, cleanup: bool = False, db: Session = Depends(get_db)):
    """
    Export timeline as FCP 7 XML format for DaVinci Resolve.
    Returns the XML file content directly as a downloadable file.
    """
    tracks = request.timeline.tracks
    assets = request.assets
    
    # Find video track
    video_track = next((t for t in tracks if t.type == 'video'), None)
    if not video_track or not video_track.clips:
        return {"success": False, "error": "No video clips to export"}
    
    # Sort clips by start time
    video_clips = sorted(video_track.clips, key=lambda c: c.start)
    
    # Calculate total duration
    total_duration = max(c.end for c in video_clips) if video_clips else 0
    
    FPS = 30
    
    # Build FCP 7 XML
    xml_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE xmeml>',
        '<xmeml version="4">',
        '  <sequence>',
        '    <name>Rough Cut Export</name>',
        f'    <duration>{int(total_duration * FPS)}</duration>',
        '    <rate>',
        '      <timebase>30</timebase>',
        '      <ntsc>FALSE</ntsc>',
        '    </rate>',
        '    <media>',
        '      <video>',
        '        <track>',
    ]
    
    for idx, clip in enumerate(video_clips):
        asset = next((a for a in assets if a.id == clip.assetId), None)
        if not asset:
            continue
        
        clip_name = clip.sourceFileName or clip.name or asset.name or "Clip"
        
        xml_lines.extend([
            '          <clipitem>',
            f'            <name>{clip_name}</name>',
            f'            <duration>{int((clip.end - clip.start) * FPS)}</duration>',
            '            <rate>',
            '              <timebase>30</timebase>',
            '              <ntsc>FALSE</ntsc>',
            '            </rate>',
            f'            <start>{int(clip.start * FPS)}</start>',
            f'            <end>{int(clip.end * FPS)}</end>',
            f'            <in>{int(clip.trimStart * FPS)}</in>',
            f'            <out>{int(clip.trimEnd * FPS)}</out>',
            '            <file>',
            f'              <name>{asset.name}</name>',
            f'              <duration>{int(asset.duration * FPS)}</duration>',
            '            </file>',
            '          </clipitem>',
        ])
    
    xml_lines.extend([
        '        </track>',
        '      </video>',
        '    </media>',
        '  </sequence>',
        '</xmeml>',
    ])
    
    xml_content = "\n".join(xml_lines)
    
    logger.info(f"XML Export: Generated {len(video_clips)} clips")
    
    # Cleanup project files if requested
    if cleanup and video_clips:
        # Get project ID from first asset
        first_asset_id = video_clips[0].assetId
        try:
            from api.projects import delete_project
            delete_project(first_asset_id, db)
            logger.info(f"Cleaned up project {first_asset_id} after XML export")
        except Exception as e:
            logger.error(f"Failed to cleanup project after export: {e}")
    
    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={
            "Content-Disposition": f"attachment; filename=rough_cut_{int(time.time())}.xml"
        }
    )

