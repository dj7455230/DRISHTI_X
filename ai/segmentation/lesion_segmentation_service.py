"""
DRISHTI-X — Advanced U-Net Lesion Segmentation Service
Features 11 & 12 Implementation.

Provides:
- Pixel-level U-Net lesion inference for Microaneurysms, Haemorrhages, Hard Exudates.
- Probability maps [4, 512, 512].
- Connected-component region extraction (count, area, bbox, centroid, mean confidence).
- Layered transparent color masks for multi-class toggling.
- Full provenance and clinical safety disclosures.
"""
import os
import cv2
import numpy as np
import torch
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
from PIL import Image
from torchvision import transforms

from ai.segmentation.unet import UNetLoader

# Color palette for lesion classes (RGB)
LESION_COLORS = {
    1: {"name": "microaneurysm", "color": [0, 255, 0],     "hex": "#00FF00", "label": "Microaneurysms (MA)"},
    2: {"name": "hemorrhage",    "color": [255, 30, 80],   "hex": "#FF1E50", "label": "Haemorrhages (HE)"},
    3: {"name": "hard_exudate",  "color": [255, 215, 0],   "hex": "#FFD700", "label": "Hard Exudates (EX)"},
}

LESION_THRESHOLDS = {
    1: 0.40,  # Microaneurysms probability threshold
    2: 0.40,  # Haemorrhages probability threshold
    3: 0.40,  # Hard Exudates probability threshold
}

_unet_loader: Optional[UNetLoader] = None

def get_unet_loader(weights_path: Optional[str] = None) -> UNetLoader:
    global _unet_loader
    if _unet_loader is None or not _unet_loader.is_ready():
        _unet_loader = UNetLoader(weights_path=weights_path)
    return _unet_loader


class LesionSegmentationService:
    def __init__(self, weights_path: Optional[str] = None):
        self.loader = get_unet_loader(weights_path=weights_path)
        self.tf = transforms.Compose([
            transforms.Resize((512, 512)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])

    def is_available(self) -> bool:
        return self.loader.is_ready()

    def segment_image(
        self,
        image_path: str,
        output_dir: str,
        threshold_dict: Optional[Dict[int, float]] = None,
    ) -> Dict[str, Any]:
        """
        Executes genuine U-Net lesion segmentation.
        Saves:
          - lesion_mask.png (RGBA composite overlay)
          - lesion_overlay.jpg (blended over original fundus image)
          - mask_ma.png, mask_he.png, mask_ex.png (per-class binary masks)
          - lesion_evidence.json
        """
        if not self.is_available():
            raise RuntimeError("U-Net model is not loaded or weights are unavailable.")

        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Input fundus image not found: {image_path}")

        thresholds = threshold_dict or LESION_THRESHOLDS
        orig_bgr = cv2.imread(image_path)
        if orig_bgr is None:
            raise ValueError(f"Unable to decode fundus image: {image_path}")

        orig_h, orig_w = orig_bgr.shape[:2]
        orig_rgb = cv2.cvtColor(orig_bgr, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(orig_rgb)

        # 1. Forward Pass through U-Net
        tensor = self.tf(pil_img).unsqueeze(0)  # [1, 3, 512, 512]
        probs = self.loader.predict_probabilities(tensor)  # [1, 4, 512, 512]
        probs_np = probs.squeeze(0).cpu().numpy()  # [4, 512, 512]

        out_path = Path(output_dir)
        out_path.mkdir(parents=True, exist_ok=True)

        # 2. Extract per-class regions and masks
        classes_summary = {}
        total_lesion_px = 0
        composite_rgba = np.zeros((512, 512, 4), dtype=np.uint8)

        # Retinal mask estimation for relative area calculation
        gray_512 = cv2.resize(cv2.cvtColor(orig_bgr, cv2.COLOR_BGR2GRAY), (512, 512))
        _, retinal_fov = cv2.threshold(gray_512, 15, 255, cv2.THRESH_BINARY)
        retinal_area_px = max(1, int(np.sum(retinal_fov > 0)))

        per_class_files = {}

        for cls_id, cls_info in LESION_COLORS.items():
            cls_name = cls_info["name"]
            thresh = thresholds.get(cls_id, 0.40)
            prob_map = probs_np[cls_id]  # [512, 512] float 0.0-1.0

            # Binary thresholding
            binary_mask = (prob_map >= thresh).astype(np.uint8)
            pixel_count = int(np.sum(binary_mask))
            total_lesion_px += pixel_count

            # Connected component analysis
            num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
                binary_mask, connectivity=8
            )

            regions: List[Dict[str, Any]] = []
            for label_idx in range(1, num_labels):
                area = int(stats[label_idx, cv2.CC_STAT_AREA])
                if area < 2:  # filter single-pixel isolated noise
                    continue
                x = int(stats[label_idx, cv2.CC_STAT_LEFT])
                y = int(stats[label_idx, cv2.CC_STAT_TOP])
                w = int(stats[label_idx, cv2.CC_STAT_WIDTH])
                h = int(stats[label_idx, cv2.CC_STAT_HEIGHT])
                cx = float(centroids[label_idx][0])
                cy = float(centroids[label_idx][1])

                comp_mask = (labels == label_idx)
                mean_conf = float(np.mean(prob_map[comp_mask])) if area > 0 else 0.0

                regions.append({
                    "region_id": label_idx,
                    "area_px": area,
                    "relative_area_pct": round((area / retinal_area_px) * 100, 4),
                    "bbox": [x, y, w, h],
                    "centroid": [round(cx, 1), round(cy, 1)],
                    "mean_confidence": round(mean_conf, 4),
                })

            # Save per-class binary mask (512x512)
            class_filename = f"mask_{cls_name}.png"
            cv2.imwrite(str(out_path / class_filename), binary_mask * 255)
            per_class_files[cls_name] = class_filename

            # Add to composite RGBA overlay
            color = cls_info["color"]
            composite_rgba[binary_mask > 0, 0] = color[0]
            composite_rgba[binary_mask > 0, 1] = color[1]
            composite_rgba[binary_mask > 0, 2] = color[2]
            composite_rgba[binary_mask > 0, 3] = 180  # ~70% opacity

            mean_class_prob = float(np.mean(prob_map[binary_mask > 0])) if pixel_count > 0 else 0.0

            classes_summary[cls_name] = {
                "class_id": cls_id,
                "label": cls_info["label"],
                "color_hex": cls_info["hex"],
                "region_count": len(regions),
                "total_area_px": pixel_count,
                "retinal_coverage_pct": round((pixel_count / retinal_area_px) * 100, 3),
                "mean_probability": round(mean_class_prob, 4),
                "threshold_applied": thresh,
                "regions": regions,
            }

        # 3. Save Composite RGBA Overlay
        composite_path = str(out_path / "lesion_mask.png")
        cv2.imwrite(composite_path, cv2.cvtColor(composite_rgba, cv2.COLOR_RGBA2BGRA))

        # 4. Save Blended Fundus Overlay
        orig_512 = cv2.resize(orig_rgb, (512, 512))
        blended = orig_512.copy()
        mask_any = composite_rgba[:, :, 3] > 0
        blended[mask_any] = cv2.addWeighted(
            orig_512[mask_any], 0.45,
            composite_rgba[mask_any, :3], 0.55,
            0
        )
        overlay_path = str(out_path / "lesion_overlay.jpg")
        cv2.imwrite(overlay_path, cv2.cvtColor(blended, cv2.COLOR_RGB2BGR))

        # 5. Compute Lesion Evidence Score (0.0 to 1.0)
        # Weight hard exudates, hemorrhages, and microaneurysms
        ma_count = classes_summary.get("microaneurysm", {}).get("region_count", 0)
        he_count = classes_summary.get("hemorrhage", {}).get("region_count", 0)
        ex_count = classes_summary.get("hard_exudate", {}).get("region_count", 0)

        evidence_score = min(1.0, round(
            (min(ma_count, 15) * 0.02) +
            (min(he_count, 20) * 0.035) +
            (min(ex_count, 20) * 0.04),
            3
        ))

        return {
            "model": {
                "name": "U-Net Retinal Lesion Segmenter",
                "architecture": "4-Stage Encoder-Decoder with Skip Connections",
                "parameters": 31037828,
                "weights_epoch": self.loader.epoch,
                "weights_val_loss": round(float(self.loader.val_loss), 4) if self.loader.val_loss else None,
                "input_resolution": [512, 512],
                "status": self.loader.status,
            },
            "provenance": "UNET_SEGMENTATION",
            "supported_classes": list(LESION_COLORS.values()),
            "unsupported_classes": [
                {
                    "name": "soft_exudate",
                    "reason": "Not trained in 4-class U-Net due to incomplete IDRiD training annotations.",
                    "status": "UNSUPPORTED"
                },
                {
                    "name": "neovascularization",
                    "reason": "Requires high-magnification fluorescein angiography (FA) or dedicated proliferative model.",
                    "status": "UNSUPPORTED"
                }
            ],
            "total_lesion_count": ma_count + he_count + ex_count,
            "total_lesion_area_px": total_lesion_px,
            "lesion_evidence_score": evidence_score,
            "classes": classes_summary,
            "files": {
                "composite_mask": "lesion_mask.png",
                "blended_overlay": "lesion_overlay.jpg",
                "per_class": per_class_files,
            },
            "disclaimer": (
                "U-Net candidate lesion segmentation is an AI decision-support indicator. "
                "Pixel-level predictions do not constitute a definitive medical diagnosis "
                "and require clinical verification by an ophthalmologist."
            ),
        }

