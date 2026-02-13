"""
Background task system for async rough cut processing.
Uses threading for lightweight background jobs without requiring Redis/Celery.
"""
import time
import threading
import logging
import traceback
from typing import Dict, Any, Callable, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class TaskStatus:
    """Represents the status of a background task."""
    task_id: str
    status: str  # pending, processing, completed, failed
    progress: float = 0.0  # 0-100
    result: Optional[Any] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None


class TaskRegistry:
    """Thread-safe registry to track all background tasks."""
    
    def __init__(self):
        self._tasks: Dict[str, TaskStatus] = {}
        self._lock = threading.Lock()
    
    def create_task(self, task_id: str) -> TaskStatus:
        """Create a new task entry."""
        with self._lock:
            task = TaskStatus(task_id=task_id, status="pending")
            self._tasks[task_id] = task
            return task
    
    def update_task(self, task_id: str, **kwargs):
        """Update task attributes."""
        with self._lock:
            if task_id in self._tasks:
                task = self._tasks[task_id]
                for key, value in kwargs.items():
                    setattr(task, key, value)
    
    def get_task(self, task_id: str) -> Optional[TaskStatus]:
        """Get task status by ID."""
        with self._lock:
            return self._tasks.get(task_id)
    
    def delete_task(self, task_id: str):
        """Remove task from registry."""
        with self._lock:
            if task_id in self._tasks:
                del self._tasks[task_id]
    
    def cleanup_old_tasks(self, max_age_seconds: int = 3600):
        """Remove completed tasks older than max_age."""
        now = time.time()
        with self._lock:
            to_delete = []
            for task_id, task in self._tasks.items():
                if task.status in ["completed", "failed"] and task.completed_at:
                    if now - task.completed_at > max_age_seconds:
                        to_delete.append(task_id)
            
            for task_id in to_delete:
                del self._tasks[task_id]
                logger.info(f"Cleaned up old task: {task_id}")


# Global task registry
_registry = TaskRegistry()


def get_task_status(task_id: str) -> Optional[Dict[str, Any]]:
    """Get the status of a background task."""
    task = _registry.get_task(task_id)
    if not task:
        return None
    
    return {
        "task_id": task.task_id,
        "status": task.status,
        "progress": task.progress,
        "result": task.result,
        "error": task.error,
        "created_at": task.created_at,
        "completed_at": task.completed_at
    }


def run_background_task(task_id: str, func: Callable, *args, **kwargs):
    """
    Run a function in a background thread and track its status.
    The function should accept a progress_callback parameter.
    """
    def progress_callback(progress: float):
        """Update task progress (0-100)."""
        _registry.update_task(task_id, progress=progress)
    
    def wrapper():
        try:
            _registry.update_task(task_id, status="processing")
            logger.info(f"Starting background task: {task_id}")
            
            # Add progress callback to kwargs
            kwargs['progress_callback'] = progress_callback
            
            # Execute the function
            result = func(*args, **kwargs)
            
            # Mark as completed
            _registry.update_task(
                task_id,
                status="completed",
                progress=100.0,
                result=result,
                completed_at=time.time()
            )
            logger.info(f"Background task completed: {task_id}")
            
        except Exception as e:
            error_msg = f"{str(e)}\n{traceback.format_exc()}"
            logger.error(f"Background task failed: {task_id}\n{error_msg}")
            _registry.update_task(
                task_id,
                status="failed",
                error=str(e),
                completed_at=time.time()
            )
    
    # Start thread
    thread = threading.Thread(target=wrapper, daemon=True)
    thread.start()


def start_background_task(func: Callable, *args, **kwargs) -> str:
    """
    Start a background task and return its task ID.
    
    Args:
        func: Function to execute in background
        *args, **kwargs: Arguments to pass to func
    
    Returns:
        task_id: Unique identifier for tracking this task
    """
    task_id = f"task-{int(time.time() * 1000)}"
    _registry.create_task(task_id)
    run_background_task(task_id, func, *args, **kwargs)
    return task_id


def update_task_progress(task_id: str, progress: float):
    """
    Update the progress of a running task.
    """
    _registry.update_task(task_id, progress=progress)


# Cleanup old tasks periodically
def _cleanup_daemon():
    """Background daemon to cleanup old completed tasks."""
    while True:
        time.sleep(300)  # Run every 5 minutes
        _registry.cleanup_old_tasks(max_age_seconds=3600)


# Start cleanup daemon
_cleanup_thread = threading.Thread(target=_cleanup_daemon, daemon=True)
_cleanup_thread.start()
