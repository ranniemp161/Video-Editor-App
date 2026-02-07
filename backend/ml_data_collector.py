"""
ML Data Collector.

Logs "Rough Cut" decisions to a JSONL file to build a training dataset.
Schema:
{
    "timestamp": "ISO8601",
    "project_id": "str",
    "segment_id": "str",
    "start": float,
    "end": float,
    "features": { ... extracted features ... },
    "heuristic_decision": "KEEP" | "CUT",
    "user_final_decision": "KEEP" | "CUT" (Added later via reconciliation)
}
"""

import json
import logging
import os
from datetime import datetime
from typing import Dict, Any

logger = logging.getLogger(__name__)

class MLDataCollector:
    def __init__(self, data_dir: str = "training_data"):
        self.data_dir = data_dir
        os.makedirs(data_dir, exist_ok=True)
        self.log_file = os.path.join(data_dir, "rough_cut_decisions.jsonl")
    
    def log_decision(self, 
                     project_id: str, 
                     segment_id: str, 
                     start: float,
                     end: float,
                     features: Dict[str, float], 
                     heuristic_decision: str, 
                     segment_text: str):
        """
        Log a system decision. 
        Note: 'user_final_decision' is initially None, to be filled later.
        """
        entry = {
            "timestamp": datetime.now().isoformat(),
            "project_id": project_id,
            "segment_id": segment_id,
            "start": start,
            "end": end,
            "text_snippet": segment_text[:50], # Helpful for debugging
            "features": features,
            "heuristic_decision": heuristic_decision,
            "user_final_decision": None # To be labeled later
        }
        
        try:
            with open(self.log_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(entry) + "\n")
        except Exception as e:
            logger.error(f"Failed to log ML data: {e}")

    def reconcile_decisions(self, project_id: str, final_timeline_segments: list):
        """
        Compare logged heuristic decisions with the Final Timeline.
        (This would effectively label the data).
        Parsing complex timelines to match segments by ID or time is non-trivial.
        For now, this is a placeholder for the logic.
        """
        pass
