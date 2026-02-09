"""
Machine Learning Engine for Rough Cut.

Responsibilities:
1. Feature Extraction: Uses FeatureExtractor to convert segments to vectors.
2. Training: Trains a RandomForestClassifier on labeled data.
3. Prediction: Returns probability of "CUT" for a new segment.
"""

import logging
import os
import json
import joblib
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from feature_extractor import FeatureExtractor

logger = logging.getLogger(__name__)

class RoughCutModel:
    def __init__(self, model_dir: str = "models"):
        self.model_dir = model_dir
        os.makedirs(model_dir, exist_ok=True)
        self.model_path = os.path.join(model_dir, "rough_cut_model.pkl")
        self.model = None
        self.extractor = FeatureExtractor()
        
        # Updated feature names to match enhanced FeatureExtractor
        # Total: 20 features (was 8)
        self.feature_names = [
            # Original timing features (5)
            'duration', 'word_count', 'speech_rate', 
            'pause_before', 'pause_after',
            
            # Original text features (4)
            'stop_word_ratio', 'starts_with_repeat', 'has_filler', 'filler_count',
            
            # New linguistic complexity features (4)
            'unique_word_ratio', 'avg_word_length', 
            'question_count', 'exclamation_count',
            
            # New sentiment features (3)
            'sentiment_positive', 'sentiment_negative', 'sentiment_subjectivity',
            
            # New contextual features (2)
            'position_in_video', 'time_since_last_cut',
            
            # New audio features (4)
            'avg_energy', 'energy_variance', 'avg_pitch', 'pitch_stability'
        ]
        
        self.load_model()

    def train(self, training_data_path: str):
        """
        Train the model from a JSONL file.
        Format: Each line is a dict with 'features' (dict) and 'user_final_decision' ('KEEP'/'CUT').
        """
        if not os.path.exists(training_data_path):
            logger.error(f"Training data not found: {training_data_path}")
            return

        logger.info("Loading training data...")
        data = []
        with open(training_data_path, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    record = json.loads(line)
                    # Only train on labeled data (where user made a decision)
                    if record.get('user_final_decision'):
                        features = record['features']
                        label = 1 if record['user_final_decision'] == 'CUT' else 0
                        
                        # Flatten features to list
                        feature_vector = [features.get(name, 0.0) for name in self.feature_names]
                        data.append(feature_vector + [label])
                except Exception as e:
                    logger.warning(f"Skipping bad training record: {e}")

        if not data:
            logger.warning("No valid training data found.")
            return

        # Create DataFrame
        df = pd.DataFrame(data, columns=self.feature_names + ['label'])
        
        X = df[self.feature_names]
        y = df['label']
        
        # Train/Test Split
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        # Initialize and Train with Enhanced Hyperparameters
        logger.info(f"Training on {len(X_train)} examples...")
        self.model = RandomForestClassifier(
            n_estimators=200,            # More trees = better accuracy (was 100)
            max_depth=15,                # Prevent overfitting
            min_samples_split=10,        # Require more samples to split nodes
            min_samples_leaf=5,          # Smoother decision boundaries
            max_features='sqrt',         # Feature randomness for diversity
            class_weight='balanced',     # Handle imbalanced KEEP/CUT data
            random_state=42,
            n_jobs=-1                    # Use all CPU cores for speed
        )
        self.model.fit(X_train, y_train)
        
        # Evaluate with detailed metrics
        y_pred = self.model.predict(X_test)
        logger.info("Training complete.")
        logger.info(f"Accuracy: {accuracy_score(y_test, y_pred):.3f}")
        logger.info(f"\n{classification_report(y_test, y_pred, target_names=['KEEP', 'CUT'])}")
        
        # Save
        self.save_model()

    def predict(self, segment: dict, prev_segment: dict = None, next_segment: dict = None, audio_features: dict = None) -> float:
        """
        Predict probability that a segment should be CUT.
        Returns: float (0.0 to 1.0)
        """
        if not self.model:
            return 0.0 # Default to KEEP if no model
            
        features = self.extractor.extract_features(segment, prev_segment, next_segment, audio_features)
        feature_vector = [features.get(name, 0.0) for name in self.feature_names]
        
        # Reshape for single prediction
        X = np.array(feature_vector).reshape(1, -1)
        
        # Get probability of class 1 (CUT)
        prob_cut = self.model.predict_proba(X)[0][1]
        
        return float(prob_cut)

    def save_model(self):
        joblib.dump(self.model, self.model_path)
        logger.info(f"Model saved to {self.model_path}")

    def load_model(self):
        if os.path.exists(self.model_path):
            try:
                self.model = joblib.load(self.model_path)
                logger.info("Loaded specialized rough cut model.")
            except Exception as e:
                logger.error(f"Failed to load model: {e}")
        else:
            logger.info("No trained model found. Running in heuristic-only mode.")
