import os
import json
import logging
import shutil
import time
from ml_scheduler import MLScheduler

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TEST_DIR = "test_training_data"
DATA_FILE = os.path.join(TEST_DIR, "rough_cut_decisions.jsonl")
STATE_FILE = os.path.join(TEST_DIR, "ml_state.json")

def setup():
    if os.path.exists(TEST_DIR):
        shutil.rmtree(TEST_DIR)
    os.makedirs(TEST_DIR)
    
    # Create dummy state
    with open(STATE_FILE, 'w') as f:
        json.dump({"last_trained_count": 0}, f)

def create_dummy_data(count):
    with open(DATA_FILE, 'w') as f:
        for i in range(count):
            entry = {
                "features": {
                    "duration": 1.0, "word_count": 5, "speech_rate": 2.5,
                    "pause_before": 0.5, "pause_after": 0.5,
                    "stop_word_ratio": 0.2, "starts_with_repeat": 0.0, "has_filler": 0.0
                },
                "user_final_decision": "KEEP" if i % 2 == 0 else "CUT"
            }
            f.write(json.dumps(entry) + "\n")

def test_scheduler():
    setup()
    
    # 1. Create 60 samples (enough to trigger training > 50)
    logger.info("Creating 60 samples...")
    create_dummy_data(60)
    
    # 2. Initialize Scheduler
    scheduler = MLScheduler(data_file=DATA_FILE, state_file=STATE_FILE)
    
    # 3. Check and Train
    logger.info("Running check_and_train()...")
    scheduler.check_and_train()
    
    # 4. Verify State
    with open(STATE_FILE, 'r') as f:
        state = json.load(f)
        
    logger.info(f"State after training: {state}")
    
    if state['last_trained_count'] == 60:
        print("[SUCCESS] Scheduler trained on 60 samples.")
    else:
        print(f"[FAILURE] Expected 60 samples trained, got {state['last_trained_count']}")
        
    # 5. Add 10 more samples (Total 70) -> Should NOT train (threshold 20)
    logger.info("Adding 10 more samples (Total 70)...")
    create_dummy_data(70) # Overwrite with 70
    scheduler.check_and_train()
    
    with open(STATE_FILE, 'r') as f:
        state = json.load(f)
        
    if state['last_trained_count'] == 60:
         print("[SUCCESS] Scheduler did NOT train on +10 samples (Threshold respected).")
    else:
         print(f"[FAILURE] Scheduler trained prematurely on {state['last_trained_count']} samples.")

    # 6. Add 15 more samples (Total 85, +25 total new) -> Should train
    logger.info("Adding 15 more samples (Total 85)...")
    create_dummy_data(85)
    scheduler.check_and_train()
    
    with open(STATE_FILE, 'r') as f:
        state = json.load(f)
        
    if state['last_trained_count'] == 85:
         print("[SUCCESS] Scheduler trained on +25 samples.")
    else:
         print(f"[FAILURE] Expected 85 samples trained, got {state['last_trained_count']}")

if __name__ == "__main__":
    test_scheduler()
