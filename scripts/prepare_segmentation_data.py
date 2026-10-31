#!/usr/bin/env python3
"""
DRISHTI-X — Segmentation Data Preparation Pipeline
Pairs IDRiD original fundus images with corresponding pixel-level masks for:
  - Microaneurysms (MA)
  - Haemorrhages (HE)
  - Hard Exudates (EX)
  - Optic Disc (OD)
  - Soft Exudates (SE)
Produces structured manifests:
  - data/manifests/idrid_segmentation_train.json
  - data/manifests/idrid_segmentation_test.json
  - data/manifests/segmentation_summary.json
"""

import os
import sys
import json
from pathlib import Path
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent

def build_segmentation_manifests():
    print("Preparing IDRiD segmentation manifests...")
    seg_base = ROOT / "datasets" / "idrid" / "A. Segmentation"
    orig_base = seg_base / "1. Original Images"
    gt_base = seg_base / "2. All Segmentation Groundtruths"
    manifests_dir = ROOT / "data" / "manifests"
    manifests_dir.mkdir(parents=True, exist_ok=True)
    
    subsets = {
        "train": {
            "orig_folder": orig_base / "a. Training Set",
            "gt_folder": gt_base / "a. Training Set",
            "out_file": manifests_dir / "idrid_segmentation_train.json"
        },
        "test": {
            "orig_folder": orig_base / "b. Testing Set",
            "gt_folder": gt_base / "b. Testing Set",
            "out_file": manifests_dir / "idrid_segmentation_test.json"
        }
    }
    
    lesion_dirs = {
        "MA": "1. Microaneurysms",
        "HE": "2. Haemorrhages",
        "EX": "3. Hard Exudates",
        "SE": "4. Soft Exudates",
        "OD": "5. Optic Disc"
    }
    
    summary = {}
    
    for split_name, paths in subsets.items():
        orig_imgs = sorted(list(paths["orig_folder"].glob("*.jpg")))
        samples = []
        lesion_frequencies = {k: 0 for k in lesion_dirs}
        
        for img_path in orig_imgs:
            stem = img_path.stem  # e.g., IDRiD_01
            sample_masks = {}
            present = []
            
            for code, folder in lesion_dirs.items():
                expected_mask = paths["gt_folder"] / folder / f"{stem}_{code}.tif"
                if expected_mask.exists():
                    sample_masks[code] = str(expected_mask)
                    lesion_frequencies[code] += 1
                    present.append(code)
                else:
                    sample_masks[code] = None
                    
            samples.append({
                "image_id": stem,
                "image_path": str(img_path),
                "masks": sample_masks,
                "lesions_present": present
            })
            
        with open(paths["out_file"], "w") as f:
            json.dump(samples, f, indent=2)
            
        print(f"  -> Saved {split_name} manifest to {paths['out_file']} ({len(samples)} samples)")
        summary[split_name] = {
            "total_images": len(samples),
            "lesion_coverage": lesion_frequencies
        }
        
    summary_path = manifests_dir / "segmentation_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"  -> Saved segmentation summary to {summary_path}")
    return summary

if __name__ == "__main__":
    build_segmentation_manifests()
    print("Segmentation preparation complete!")

