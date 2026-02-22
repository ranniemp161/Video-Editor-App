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
    projectId: Optional[str] = None


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


class TimelineClip(BaseModel):
    """A clip in the timeline."""
    id: str
    assetId: str
    trackId: str
    name: str
    sourceFileName: Optional[str] = None
    start: float
    end: float
    trimStart: float
    trimEnd: float
    opacity: Optional[int] = 100
    volume: Optional[int] = 100


class TimelineTrack(BaseModel):
    """A track in the timeline."""
    id: str
    type: str
    clips: List[TimelineClip]
    muted: Optional[bool] = False
    locked: Optional[bool] = False


class TimelineState(BaseModel):
    """Timeline state structure."""
    tracks: List[TimelineTrack]


class ExportAsset(BaseModel):
    """Asset info for export."""
    id: str
    name: str
    duration: float
    src: Optional[str] = None


class ExportEDLRequest(BaseModel):
    """Request to export EDL file."""
    timeline: TimelineState
    assets: List[ExportAsset]


class ExportXMLRequest(BaseModel):
    """Request to export XML file."""
    timeline: TimelineState
    assets: List[ExportAsset]

