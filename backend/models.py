from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, index=True)
    mediaPath = Column(String)
    duration = Column(Float, default=0.0)
    originalFileName = Column(String)
    createdAt = Column(Float) # Timestamp

    segments = relationship("Segment", back_populates="project", cascade="all, delete-orphan")

class Segment(Base):
    __tablename__ = "segments"

    id = Column(Integer, primary_key=True, index=True)
    projectId = Column(String, ForeignKey("projects.id"))
    start = Column(Float)
    end = Column(Float)
    text = Column(String)
    type = Column(String, default="speech")
    isDeleted = Column(Boolean, default=False)

    project = relationship("Project", back_populates="segments")
