#!/usr/bin/env python3
"""
DRISHTI-X — Classification Data Preparation Pipeline
Prepares verified split manifests for APTOS 2019 (train, val, test) and Messidor-2 (external).
Validates image files and computes balanced class weights.
Outputs:
  - data/splits/aptos_train.csv
  - data/splits/aptos_val.csv
  - data/splits/aptos_test.csv
  - data/splits/messidor2_external.csv
  - data/splits/class_weights.json
"""

import os
import sys
import json
from pathlib import Path
from collections import Counter
import pandas as pd
import numpy as np

ROOT = Path(__file__).resolve().parent.parent

def prepare_aptos_splits():
    print("Preparing APTOS 2019 manifests...")
    aptos_dir = ROOT / "datasets" / "aptos2019"
    img_dir = aptos_dir / "train_images"
    splits_dir = ROOT / "data" / "splits"
    splits_dir.mkdir(parents=True, exist_ok=True)
    
    split_files = {
        "train": "train.csv",
        "val": "val.csv",
        "test": "test.csv"
    }
    
    results = {}
    train_labels = []
    
    for split_name, csv_filename in split_files.items():
        src_csv = aptos_dir / csv_filename
        if not src_csv.exists():
            raise FileNotFoundError(f"Missing {src_csv}")
            
        df = pd.read_csv(src_csv)
        rows = []
        for _, row in df.iterrows():
            id_code = str(row["id_code"])
            label = int(row["diagnosis"])
            img_path = img_dir / f"{id_code}.png"
            if not img_path.exists():
                print(f"Warning: Image {img_path} not found!")
                continue
                
            is_referable = 1 if label >= 2 else 0
            rows.append({
                "id_code": id_code,
                "label": label,
                "referable": is_referable,
                "dataset": "aptos2019",
                "split": split_name,
                "image_path": str(img_path)
            })
            if split_name == "train":
                train_labels.append(label)
                
        out_df = pd.DataFrame(rows)
        out_path = splits_dir / f"aptos_{split_name}.csv"
        out_df.to_csv(out_path, index=False)
        print(f"  -> Saved {split_name} split to {out_path} ({len(out_df)} records)")
        results[split_name] = {
            "count": len(out_df),
            "distribution": dict(Counter(out_df["label"]))
        }
        
    # Compute inverse class frequencies with power smoothing (power=0.5)
    counts = Counter(train_labels)
    total = len(train_labels)
    num_classes = 5
    raw_weights = [total / max(1, counts[c]) for c in range(num_classes)]
    # Smooth with square root
    smoothed = [w ** 0.5 for w in raw_weights]
    norm_smoothed = [round(w / sum(smoothed) * num_classes, 4) for w in smoothed]
    
    weights_meta = {
        "num_classes": num_classes,
        "train_counts": {c: counts[c] for c in range(num_classes)},
        "smoothed_class_weights": norm_smoothed,
        "class_names": {
            0: "No DR",
            1: "Mild NPDR",
            2: "Moderate NPDR",
            3: "Severe NPDR",
            4: "Proliferative DR"
        }
    }
    
    weights_path = splits_dir / "class_weights.json"
    with open(weights_path, "w") as f:
        json.dump(weights_meta, f, indent=2)
    print(f"  -> Saved smoothed class weights to {weights_path}")
    return results

def prepare_messidor_external():
    print("Preparing Messidor-2 external validation manifest...")
    base = ROOT / "datasets" / "messidor2"
    csv_path = base / "archive" / "messidor_data.csv"
    img_dir = base / "archive" / "messidor-2" / "messidor-2" / "preprocess"
    splits_dir = ROOT / "data" / "splits"
    
    if not csv_path.exists():
        raise FileNotFoundError(f"Missing {csv_path}")
        
    df = pd.read_csv(csv_path)
    rows = []
    for _, row in df.iterrows():
        id_code = str(row["id_code"])
        label = int(row["diagnosis"])
        img_path = img_dir / id_code
        if not img_path.exists():
            continue
        rows.append({
            "id_code": id_code,
            "label": label,
            "referable": 1 if label >= 2 else 0,
            "dme": int(row["adjudicated_dme"]),
            "gradable": int(row["adjudicated_gradable"]),
            "dataset": "messidor2",
            "split": "external_test",
            "image_path": str(img_path)
        })
        
    out_df = pd.DataFrame(rows)
    out_path = splits_dir / "messidor2_external.csv"
    out_df.to_csv(out_path, index=False)
    print(f"  -> Saved Messidor-2 external manifest to {out_path} ({len(out_df)} records)")
    return len(out_df)

if __name__ == "__main__":
    prepare_aptos_splits()
    prepare_messidor_external()
    print("Classification preparation complete!")

