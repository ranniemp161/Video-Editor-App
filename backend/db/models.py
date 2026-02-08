# SQLAlchemy ORM models
from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from .database import Base


class Project(Base):
    """Project entity representing a video editing project."""
    __tablename__ = "projects"

    id = Column(String, primary_key=True, index=True)
    mediaPath = Column(String)
    duration = Column(Float, default=0.0)
    originalFileName = Column(String)
    createdAt = Column(Float)  # Timestamp

    segments = relationship("Segment", back_populates="project", cascade="all, delete-orphan")
    rough_cut_result = relationship("RoughCutResult", back_populates="project", cascade="all, delete-orphan", uselist=False)


class Segment(Base):
    """Segment entity representing a portion of video content."""
    __tablename__ = "segments"

    id = Column(Integer, primary_key=True, index=True)
    projectId = Column(String, ForeignKey("projects.id"))
    start = Column(Float)
    end = Column(Float)
    text = Column(String)
    type = Column(String, default="speech")
    isDeleted = Column(Boolean, default=False)

    project = relationship("Project", back_populates="segments")


class RoughCutResult(Base):
    """Store rough cut processing results for session recovery."""
    __tablename__ = "rough_cut_results"

    id = Column(Integer, primary_key=True, index=True)
    projectId = Column(String, ForeignKey("projects.id"), unique=True)
    clips = Column(JSON)  # Stores the array of timeline clips
    statistics = Column(JSON)  # Stores rough cut statistics
    status = Column(String, default="pending")  # pending, processing, completed, failed
    createdAt = Column(Float)
    completedAt = Column(Float, nullable=True)

    project = relationship("Project", back_populates="rough_cut_result")
