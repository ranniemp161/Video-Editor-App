"""
Feedback Loop Logic.

Reconciles the "Final Timeline" (what the user kept) with the "Rough Cut Logs" (what the system saw).
Updates the training data with ground truth labels.
"""

import json
import os
import logging
from typing import List, Dict

# Import ML Engine to trigger retraining
try:
    from ml_engine import RoughCutModel
except ImportError:
    RoughCutModel = None

logger = logging.getLogger(__name__)

class FeedbackLoop:
    def __init__(self, data_dir: str = "training_data"):
        self.data_dir = data_dir
        self.log_file = os.path.join(data_dir, "rough_cut_decisions.jsonl")
        
    
    def process_feedback(self, project_id: str, final_timeline: Dict):
        """
        Compare Final Timeline against logged decisions using TIME OVERLAP.
        """
        if not os.path.exists(self.log_file):
            return { "success": False, "message": "No logs found" }

        # 1. Extract Kept Ranges from Timeline (v1 track)
        kept_ranges = []
        video_track = next((t for t in final_timeline.get('tracks', []) if t['id'] == 'v1'), None)
        
        if video_track:
            for clip in video_track.get('clips', []):
                # sourceStart = clip.start + (clip.trimStart - clip.start) ?? No.
                # The clip in timeline represents a range of the SOURCE asset.
                # trimStart is the start time in the source.
                # trimEnd is the end time in the source.
                # We match this against the original segment's start/end.
                kept_ranges.append((clip.get('trimStart', 0), clip.get('trimEnd', 0)))

        # 2. Read Logs and Label
        updated_lines = []
        match_count = 0
        
        with open(self.log_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        for line in lines:
            try:
                record = json.loads(line)
                
                # Check for time overlap
                seg_start = record.get('start')
                seg_end = record.get('end')
                
                if seg_start is None or seg_end is None:
                    # Fallback to text match if time missing (old logs)
                    updated_lines.append(line)
                    continue
                    
                # Is this segment covered by any kept range?
                # We consider it KEPT if at least 50% of it is covered.
                seg_duration = seg_end - seg_start
                covered_duration = 0
                
                for k_start, k_end in kept_ranges:
                    # Calculate overlap
                    overlap_start = max(seg_start, k_start)
                    overlap_end = min(seg_end, k_end)
                    overlap = max(0, overlap_end - overlap_start)
                    covered_duration += overlap
                
                coverage_ratio = covered_duration / seg_duration if seg_duration > 0 else 0
                
                # Labeling Logic
                if coverage_ratio > 0.5:
                    record['user_final_decision'] = 'KEEP'
                else:
                    record['user_final_decision'] = 'CUT'
                    
                match_count += 1
                updated_lines.append(json.dumps(record))
                
            except json.JSONDecodeError:
                updated_lines.append(line)

        # 3. Write back
        with open(self.log_file, 'w', encoding='utf-8') as f:
            f.write('\n'.join(updated_lines) + '\n')
            
        if match_count > 0 and RoughCutModel:
            logger.info("Triggering ML Model Retraining...")
            try:
                model = RoughCutModel()
                model.train(self.log_file)
                logger.info("Model retraining complete.")
            except Exception as e:
                logger._log(logging.ERROR, f"Failed to retrain model: {e}", [])

        logger.info(f"Feedback Loop: Updated {match_count} records based on timeline overlap.")
        return { "success": True, "updated_count": match_count }
