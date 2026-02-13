import os
import json
import logging
import threading
import time
from typing import Dict

from ml_engine import RoughCutModel

logger = logging.getLogger(__name__)

class MLScheduler:
    def __init__(self, data_file: str = "training_data/rough_cut_decisions.jsonl", state_file: str = "training_data/ml_state.json"):
        self.data_file = data_file
        self.state_file = state_file
        self.min_samples_to_train = 50
        self.new_samples_threshold = 20
        self.model = RoughCutModel() # Load existing model structure
        self.is_running = False
        
        # Ensure state file exists
        if not os.path.exists(self.state_file):
            self._save_state({"last_trained_count": 0, "last_trained_timestamp": None})

    def start(self, interval_seconds: int = 3600):
        """Start the scheduler in a background thread."""
        if self.is_running:
            return
            
        self.is_running = True
        thread = threading.Thread(target=self._loop, args=(interval_seconds,), daemon=True)
        thread.start()
        logger.info(f"ML Scheduler started. Checking every {interval_seconds} seconds.")

    def _loop(self, interval: int):
        while self.is_running:
            try:
                self.check_and_train()
            except Exception as e:
                logger.error(f"Error in ML Scheduler loop: {e}")
            
            time.sleep(interval)

    def stop(self):
        self.is_running = False

    def check_and_train(self):
        """Check if we have enough new data to retrain."""
        if not os.path.exists(self.data_file):
            return

        # 1. Count labeled samples
        labeled_count = 0
        try:
            with open(self.data_file, 'r', encoding='utf-8') as f:
                for line in f:
                    try:
                        record = json.loads(line)
                        if record.get('user_final_decision'):
                            labeled_count += 1
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            logger.error(f"Failed to read training data: {e}")
            return

        # 2. Check state
        state = self._load_state()
        last_count = state.get("last_trained_count", 0)

        logger.info(f"ML Scehduler: Found {labeled_count} labeled samples (Last trained at: {last_count})")

        # 3. Decision Logic
        # - Must have absolute minimum samples (e.g. 50)
        # - Must have enough NEW samples since last time (e.g. +20)
        if labeled_count >= self.min_samples_to_train and (labeled_count - last_count) >= self.new_samples_threshold:
            logger.info("Triggering automatic model retraining...")
            self._train(labeled_count)
        else:
            logger.info("Not enough new data to retrain yet.")

    def _train(self, current_count: int):
        try:
            # Run training
            metrics = self.model.train(self.data_file)
            
            # Update state
            self._save_state({
                "last_trained_count": current_count,
                "last_trained_timestamp": time.time(),
                "latest_metrics": metrics
            })
            
            logger.info(f"Automatic retraining complete. Accuracy: {metrics.get('accuracy', 'N/A')}")
            
        except Exception as e:
            logger.error(f"Automatic retraining failed: {e}")

    def _load_state(self) -> Dict:
        try:
            with open(self.state_file, 'r') as f:
                return json.load(f)
        except:
            return {}

    def _save_state(self, state: Dict):
        try:
            with open(self.state_file, 'w') as f:
                json.dump(state, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save ML state: {e}")
