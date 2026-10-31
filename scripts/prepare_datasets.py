"""
DRISHTI-X — Dataset Preparation Script
Normalises all datasets into a unified CSV format:
  id_code, diagnosis, dataset, image_path

Run once before training:
  python scripts/prepare_datasets.py
"""
import os, sys, pandas as pd, numpy as np
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
ROOT = Path(__file__).parent.parent

# ── APTOS 2019 ────────────────────────────────────────────────
def prepare_aptos():
    csv  = ROOT / "datasets/aptos2019/train.csv"
    imgs = ROOT / "datasets/aptos2019/train_images"
    if not csv.exists():
        print("APTOS 2019: NOT AVAILABLE"); return None
    df = pd.read_csv(csv)
    df = df[["id_code","diagnosis"]].copy()
    df["dataset"]    = "aptos2019"
    df["image_path"] = df["id_code"].apply(
        lambda x: str(imgs / f"{x}.png"))
    df = df[df["image_path"].apply(os.path.exists)]
    df = df.rename(columns={"diagnosis":"label"})
    print(f"APTOS 2019: {len(df)} images  dist={df['label'].value_counts().sort_index().to_dict()}")
    return df

# ── IDRiD ─────────────────────────────────────────────────────
def prepare_idrid():
    train_csv  = ROOT / "datasets/idrid/B. Disease Grading/2. Groundtruths/a. IDRiD_Disease Grading_Training Labels.csv"
    train_imgs = ROOT / "datasets/idrid/B. Disease Grading/1. Original Images/a. Training Set"

    if not train_csv.exists() or not train_imgs.exists():
        print("IDRiD: NOT AVAILABLE"); return None
    
    # Use IDRiD Training set only for training to avoid ID collision with testing set
    df = pd.read_csv(train_csv, usecols=[0, 1])
    df.columns = ["id_code", "label"]
    df["id_code"] = df["id_code"].str.strip()
    df["dataset"] = "idrid"
    df["image_path"] = df["id_code"].apply(
        lambda x: str(train_imgs / f"{x}.jpg"))
    df = df[df["image_path"].apply(os.path.exists)]
    print(f"IDRiD (Training Set only): {len(df)} images  dist={df['label'].value_counts().sort_index().to_dict()}")
    return df

# ── Messidor-2 ────────────────────────────────────────────────
def prepare_messidor2():
    csv      = ROOT / "datasets/messidor2/archive/messidor_data.csv"
    img_dirs = [
        ROOT / "datasets/messidor2/archive",
        ROOT / "datasets/messidor2",
    ]
    if not csv.exists():
        print("Messidor-2: NOT AVAILABLE"); return None

    df = pd.read_csv(csv)
    print(f"  Messidor-2 columns: {df.columns.tolist()}")

    # Find grade column — Messidor uses adjudicated_dr_grade
    grade_col = None
    for c in ["adjudicated_dr_grade","retinopathy_grade","DR_grade","label","diagnosis"]:
        if c in df.columns:
            grade_col = c; break
    if grade_col is None:
        print("Messidor-2: cannot identify grade column"); return None

    img_col = df.columns[0]   # first column is image filename
    df = df[[img_col, grade_col]].copy()
    df.columns = ["id_code","label"]
    df["dataset"] = "messidor2"

    # Find image files
    def find_image(fname):
        for d in img_dirs:
            p = d / fname
            if p.exists(): return str(p)
        return ""
    df["image_path"] = df["id_code"].apply(find_image)
    df = df[df["image_path"] != ""]
    # Messidor grade 0-3 → remap to 0-4 scale (0→0, 1→1, 2→2, 3→4)
    remap = {0:0, 1:1, 2:2, 3:4}
    df["label"] = df["label"].map(remap).fillna(df["label"]).astype(int)
    df = df[df["label"].isin([0,1,2,3,4])]
    print(f"Messidor-2: {len(df)} images  dist={df['label'].value_counts().sort_index().to_dict()}")
    return df

# ── Combined dataset ──────────────────────────────────────────
def build_combined():
    frames = []
    for fn in [prepare_aptos, prepare_idrid, prepare_messidor2]:
        df = fn()
        if df is not None and len(df) > 0:
            frames.append(df[["id_code","label","dataset","image_path"]])

    if not frames:
        print("ERROR: No datasets available."); sys.exit(1)

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.dropna(subset=["label"])
    combined["label"] = combined["label"].astype(int)
    combined = combined[combined["label"].isin([0,1,2,3,4])]

    out = ROOT / "datasets/combined_train.csv"
    combined.to_csv(out, index=False)
    print(f"\nCombined: {len(combined)} images across {combined['dataset'].nunique()} datasets")
    print(f"Distribution: {combined['label'].value_counts().sort_index().to_dict()}")
    print(f"Saved: {out}")
    return combined

if __name__ == "__main__":
    build_combined()
