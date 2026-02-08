# Pydantic request/response schemas
from typing import List, Optional
from pydantic import BaseModel


class Segment(BaseModel):
    """Segment of video content with timing and text."""
    start: float
    end: float
    text: str
    type: str = "speech"
    isDeleted: bool = False


class ProjectState(BaseModel):
    """Current state of a project."""
    projectId: str
    mediaPath: str
    segments: List[Segment]
    duration: float
    originalFileName: Optional[str] = None


class TranscribeRequest(BaseModel):
    """Request to transcribe video."""
    videoPath: str
    duration: float


class UploadTranscriptRequest(BaseModel):
    """Request to upload manual transcript."""
    content: str
    fileName: str
    projectId: Optional[str] = None


class ExportTranscriptRequest(BaseModel):
    """Request to export transcript."""
    transcription: dict
    format: str


class AssetInfo(BaseModel):
    """Asset metadata for editing operations."""
    id: str
    name: str
    duration: float


class TrainFeedbackRequest(BaseModel):
    """Feedback loop training data."""
    projectId: str
    finalTimeline: dict


class AutoCutRequest(BaseModel):
    """Request for auto-cut operation."""
    words: List[dict]
    asset: AssetInfo
    trackId: str


class AnalyzeThoughtsRequest(BaseModel):
    """Request to analyze thought groupings."""
    words: List[dict]
