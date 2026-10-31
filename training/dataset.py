"""
DRISHTI-X — Dataset Pipeline
Supports: APTOS 2019, IDRiD, Messidor-2, combined CSV.
Handles: class imbalance, stratified splits, corrupt image detection,
         class weight computation, combined multi-dataset loading.
"""
import os
import pandas as pd
import numpy as np
from PIL import Image
from typing import Optional, Tuple, Dict, List
from torch.utils.data import Dataset
from collections import Counter
import torch


DR_GRADE_LABELS = {
    0: "No DR",
    1: "Mild NPDR",
    2: "Moderate NPDR",
    3: "Severe NPDR",
    4: "Proliferative DR",
}


class RetinalDataset(Dataset):
    """
    PyTorch Dataset for retinal fundus images.
    Supports both:
      - CSV with image filenames + image_dir (APTOS style)
      - CSV with full image_path column (combined style)
    """

    def __init__(
        self,
        csv_path: str,
        image_dir: Optional[str] = None,
        image_col: str = "id_code",
        label_col: str = "diagnosis",
        transform=None,
        ext: str = ".png",
    ):
        if not os.path.exists(csv_path):
            raise FileNotFoundError(
                f"DATASET NOT AVAILABLE: {csv_path}"
            )

        self.df = pd.read_csv(csv_path)
        self.image_dir = image_dir
        self.image_col = image_col
        self.label_col = label_col
        self.transform = transform
        self.ext = ext

        # Detect whether image_col contains full paths
        first_val = str(self.df[image_col].iloc[0])
        self.full_paths = os.path.sep in first_val or first_val.startswith("/")

        self._validate()

    def _validate(self):
        missing = 0
        for _, row in self.df.iterrows():
            path = self._get_path(str(row[self.image_col]))
            if not os.path.exists(path):
                missing += 1
        if missing > 0:
            print(f"WARNING: {missing}/{len(self.df)} image files not found")

    def _get_path(self, val: str) -> str:
        if self.full_paths:
            return val
        fname = val if val.endswith(self.ext) else val + self.ext
        return os.path.join(self.image_dir, fname) if self.image_dir else fname

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int):
        row   = self.df.iloc[idx]
        path  = self._get_path(str(row[self.image_col]))
        label = int(row[self.label_col])

        try:
            image = Image.open(path).convert("RGB")
        except Exception as e:
            print(f"WARNING: Corrupt image {path}: {e}")
            image = Image.fromarray(np.zeros((224, 224, 3), dtype=np.uint8))

        if self.transform:
            image = self.transform(image)
        return image, label

    def get_labels(self) -> List[int]:
        return self.df[self.label_col].astype(int).tolist()


def compute_class_weights(labels: List[int], num_classes: int = 5) -> torch.Tensor:
    """Inverse-frequency class weights for imbalanced DR datasets."""
    counts = Counter(labels)
    total  = len(labels)
    weights = []
    for c in range(num_classes):
        weights.append(total / (num_classes * counts[c]) if counts[c] > 0 else 1.0)
    return torch.tensor(weights, dtype=torch.float32)


def analyze_dataset(csv_path: str, label_col: str = "diagnosis") -> Dict:
    if not os.path.exists(csv_path):
        return {"error": f"DATASET NOT AVAILABLE: {csv_path}"}
    df     = pd.read_csv(csv_path)
    counts = df[label_col].value_counts().sort_index()
    total  = len(df)
    dist   = {
        int(g): {
            "label":      DR_GRADE_LABELS.get(int(g), f"Grade {g}"),
            "count":      int(c),
            "percentage": round(c / total * 100, 1),
        }
        for g, c in counts.items()
    }
    ratio = max(counts) / max(min(counts), 1)
    return {
        "total_images":     total,
        "num_classes":      len(counts),
        "distribution":     dist,
        "imbalance_ratio":  round(float(ratio), 2),
        "recommendation":   (
            "High imbalance — use weighted loss + oversampling"
            if ratio > 5 else "Moderate imbalance — weighted loss recommended"
        ),
    }


def stratified_split(
    csv_path: str,
    label_col: str = "diagnosis",
    train_ratio: float = 0.70,
    val_ratio: float   = 0.15,
    test_ratio: float  = 0.15,
    seed: int = 42,
    output_dir: str = "datasets",
) -> Tuple[str, str, str]:
    from sklearn.model_selection import train_test_split
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"DATASET NOT AVAILABLE: {csv_path}")
    df = pd.read_csv(csv_path)

    train_df, temp_df = train_test_split(
        df, test_size=(val_ratio + test_ratio),
        stratify=df[label_col], random_state=seed
    )
    val_df, test_df = train_test_split(
        temp_df, test_size=(test_ratio / (val_ratio + test_ratio)),
        stratify=temp_df[label_col], random_state=seed
    )

    os.makedirs(output_dir, exist_ok=True)
    train_path = os.path.join(output_dir, "train_split.csv")
    val_path   = os.path.join(output_dir, "val_split.csv")
    test_path  = os.path.join(output_dir, "test_split.csv")
    train_df.to_csv(train_path, index=False)
    val_df.to_csv(val_path, index=False)
    test_df.to_csv(test_path, index=False)
    print(f"Split: train={len(train_df)}, val={len(val_df)}, test={len(test_df)}")
    return train_path, val_path, test_path
