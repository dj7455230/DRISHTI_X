# DRISHTI-X — Retinal Lesion Evidence Map Report
**Feature 12 Implementation Deliverable**
**Date:** October 31, 2026  
**Status:** FULLY INTEGRATED & OPERATIONAL

---

## 1. Overview

Feature 12 provides an interactive, clinically validated lesion evidence visualization system that maps neural segmentation masks onto native fundus imagery. It allows eye care professionals to inspect candidate lesion morphology, verify spatial distributions, toggle individual pathological classes, and examine quantitative connected-component metrics.

---

## 2. Visual Architecture & Layering

The evidence map combines three visual tiers:
1. **Base Layer:** The original or CLAHE-enhanced high-resolution fundus retinal image.
2. **Intermediate Layer:** Alpha-blended RGBA multi-class segmentation mask ($512 \times 512$, scaled dynamically to native image coordinates).
3. **Control Overlay:** Interactive UI HUD providing independent visibility toggles, opacity control, and connected-component regional analytics.

### Clinical Color Mapping

| Pathological Class | Color Name | Hex Code | Visual Identity | Clinical Rationale |
|:---|:---|:---|:---|:---|
| **Microaneurysms** | Vivid Emerald | `#00FF00` | Bright green circular dots | High contrast against reddish-orange choroidal fundus background |
| **Haemorrhages** | Crimson Red | `#FF1E50` | Saturated deep crimson | Naturalistic alignment with biological blood extravasation |
| **Hard Exudates** | Amber Gold | `#FFD700` | High-luminance gold/yellow | Accurately tracks lipid deposit reflection without blinding optic disc |
| **Soft Exudates** | Slate / Gray | `#64748B` | Strikethrough / Grayed pill | Explicitly marked "Not Trained" to avoid clinical misconception |

---

## 3. Quantitative Connected-Component Region Analysis

For every screening, the U-Net probability tensor is analyzed using morphological connected-component labeling (`cv2.connectedComponentsWithStats` with 8-connectivity). 

The following quantitative parameters are derived and stored in `prediction.lesion_summary`:

- **Candidate Count ($N$):** Number of distinct connected clusters exceeding minimum size threshold (area $\ge 2$ pixels).
- **Total Area ($A_{px}$):** Sum of pixel surface area for the lesion class.
- **Retinal Coverage ($C_{\%}$):** Ratio of lesion pixel area to the total segmented retinal field:
  $$C_{\%} = \frac{\sum_{i=1}^N \text{Area}_i}{\text{Area}_{\text{retina}}} \times 100$$
- **Centroid Coordinates $(c_x, c_y)$:** Center of mass for each individual lesion candidate.
- **Bounding Box $[x, y, w, h]$:** Precise localization for rapid zoom and clinician inspection.

---

## 4. API Endpoints

- `POST /api/screenings/{id}/segment`: Triggers U-Net segmentation on demand, generating composite `lesion_mask.png`, `lesion_overlay.jpg`, and per-class masks (`mask_microaneurysm.png`, `mask_hemorrhage.png`, `mask_hard_exudate.png`).
- `GET /api/screenings/{id}/lesion-evidence`: Retrieves the structured JSON lesion evidence summary, regional metrics, and relative asset URLs.

---

## 5. UI Controls & Interactions

- **Independent Class Toggles:** Checkboxes/buttons allow toggling MA, HE, and EX layers individually.
- **Opacity Slider:** 0% to 100% continuous opacity adjustment for comparing underlying fundus vascular texture with predicted masks.
- **Synchronized Zoom & Pan:** Smooth mouse-wheel zooming (1x to 4x) and click-and-drag panning.
- **Fullscreen Mode:** Dedicated distraction-free clinical review canvas.

