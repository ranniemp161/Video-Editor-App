"""
Analyze ML Training Data Quality and Balance.

This script examines the rough cut training data to provide insights on:
- Total labeled samples
- KEEP vs CUT balance ratio
- Data quality issues
- Training readiness
"""

import json
import os
from pathlib import Path
from collections import Counter
from datetime import datetime

class TrainingDataAnalyzer:
    def __init__(self, data_dir="training_data"):
        self.data_dir = data_dir
        self.log_file = os.path.join(data_dir, "rough_cut_decisions.jsonl")
    
    def analyze(self):
        """Perform comprehensive analysis of training data."""
        
        if not Path(self.log_file).exists():
            print(f"❌ No training data found at: {self.log_file}")
            print(f"   Train the AI first by using the 'TRAIN AI' button after editing a video.")
            return None
        
        print("🔍 Analyzing Training Data...\n")
        print("=" * 60)
        
        # Read all records
        labeled_records = []
        unlabeled_records = []
        invalid_records = 0
        
        with open(self.log_file, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                try:
                    record = json.loads(line)
                    
                    # Check if labeled
                    if record.get('user_final_decision'):
                        labeled_records.append(record)
                    else:
                        unlabeled_records.append(record)
                        
                except json.JSONDecodeError:
                    invalid_records += 1
                except Exception as e:
                    print(f"⚠️  Error on line {line_num}: {e}")
                    invalid_records += 1
        
        # Basic counts
        total_records = len(labeled_records) + len(unlabeled_records)
        print(f"📊 BASIC STATISTICS")
        print(f"   Total Records:     {total_records}")
        print(f"   Labeled Records:   {len(labeled_records)} ✅")
        print(f"   Unlabeled Records: {len(unlabeled_records)}")
        print(f"   Invalid Records:   {invalid_records}")
        print()
        
        if len(labeled_records) == 0:
            print("❌ No labeled data available for training!")
            print("   Use the 'TRAIN AI' button to label your edits.")
            return None
        
        # Label distribution
        decisions = [r['user_final_decision'] for r in labeled_records]
        decision_counts = Counter(decisions)
        
        keep_count = decision_counts.get('KEEP', 0)
        cut_count = decision_counts.get('CUT', 0)
        
        print(f"🎯 LABEL DISTRIBUTION")
        print(f"   KEEP: {keep_count} ({keep_count/len(labeled_records)*100:.1f}%)")
        print(f"   CUT:  {cut_count} ({cut_count/len(labeled_records)*100:.1f}%)")
        
        # Calculate balance ratio
        if cut_count > 0:
            balance_ratio = keep_count / cut_count
            print(f"   Balance Ratio: {balance_ratio:.2f}:1 (KEEP:CUT)")
            
            # Assess balance
            if balance_ratio > 5:
                print(f"   ⚠️  HIGHLY IMBALANCED - Model may be biased toward KEEP")
            elif balance_ratio > 2:
                print(f"   ⚡ MODERATELY IMBALANCED - class_weight='balanced' will help")
            else:
                print(f"   ✅ WELL BALANCED - Good for training")
        else:
            print(f"   ⚠️  NO CUT EXAMPLES - Cannot train classification model!")
        
        print()
        
        # Feature completeness
        print(f"🔬 FEATURE QUALITY")
        complete_features = sum(1 for r in labeled_records if r.get('features'))
        print(f"   Records with features: {complete_features}/{len(labeled_records)}")
        
        if complete_features > 0:
            # Check feature consistency
            sample_features = next((r['features'] for r in labeled_records if r.get('features')), {})
            feature_count = len(sample_features)
            print(f"   Features per record:   {feature_count}")
            print(f"   Feature names:         {', '.join(sample_features.keys())}")
        
        print()
        
        # Training readiness
        print(f"📈 TRAINING READINESS")
        min_samples = 50  # Minimum recommended for training
        
        if len(labeled_records) < min_samples:
            print(f"   ⚠️  INSUFFICIENT DATA: {len(labeled_records)}/{min_samples} samples")
            print(f"      Recommendation: Edit and train on {min_samples - len(labeled_records)} more videos")
        elif len(labeled_records) < 100:
            print(f"   ⚡ MINIMUM DATA: {len(labeled_records)} samples")
            print(f"      Recommendation: 100+ samples for better accuracy")
        elif len(labeled_records) < 500:
            print(f"   ✅ GOOD DATA: {len(labeled_records)} samples")
            print(f"      Model should train with decent accuracy")
        else:
            print(f"   🚀 EXCELLENT DATA: {len(labeled_records)} samples")
            print(f"      Model should train with high accuracy")
        
        print()
        print("=" * 60)
        
        # Return summary for programmatic use
        return {
            'total_records': total_records,
            'labeled_count': len(labeled_records),
            'unlabeled_count': len(unlabeled_records),
            'keep_count': keep_count,
            'cut_count': cut_count,
            'balance_ratio': keep_count / cut_count if cut_count > 0 else None,
            'feature_count': feature_count if complete_features > 0 else 0,
            'training_ready': len(labeled_records) >= min_samples
        }

if __name__ == "__main__":
    analyzer = TrainingDataAnalyzer()
    result = analyzer.analyze()
    
    if result:
        print(f"\n✅ Analysis complete! {result['labeled_count']} labeled samples available.")
        
        if result['training_ready']:
            print(f"🎓 Ready to train! Run the training endpoint or use 'TRAIN AI' button.")
        else:
            print(f"⏳ Need more data. Edit more videos and use 'TRAIN AI' after each session.")
