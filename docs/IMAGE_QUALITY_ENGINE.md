# DRISHTI-X — Retinal Image Quality Engine & Recapture Guidance

**Module:** `ai/quality/quality_engine.py`  
**Purpose:** Pre-inference quality assurance gate to prevent ungradable images from triggering false negative or misleading AI classifications.

---

## 1. Quality Metrics & Mathematical Formulations

### A. Focus & Vascular Sharpness ($S_{\text{blur}}$)
Calculated as the variance of the 2D Laplacian operator applied to the green channel ($I_G$), where retinal microvasculature has maximum contrast against the pigment epithelium:

$$\nabla^2 I_G = \frac{\partial^2 I_G}{\partial x^2} + \frac{\partial^2 I_G}{\partial y^2}$$

$$S_{\text{blur}} = \text{Var}\left(\nabla^2 I_G\right)$$

- Threshold: $S_{\text{blur}} \ge 100.0$ indicates sharp focus on retinal capillaries.

### B. Illumination & Exposure ($S_{\text{illum}}$)
Evaluated in the YCrCb color space over the luminance channel $Y$ within the detected retinal circular mask ($M_{\text{retina}}$):

$$\mu_Y = \frac{1}{|M|} \sum_{(x,y) \in M} Y(x,y)$$

- Target Range: $40.0 \le \mu_Y \le 210.0$.
- $\mu_Y < 40$: Underexposed / insufficient flash / small pupil.
- $\mu_Y > 210$: Overexposed / cornea flash glare.

### C. Contrast ($S_{\text{contrast}}$)
Standard deviation of the luminance intensity across the active retinal field of view:

$$S_{\text{contrast}} = \sqrt{\frac{1}{|M|} \sum_{(x,y) \in M} \left(Y(x,y) - \mu_Y\right)^2}$$

- Threshold: $S_{\text{contrast}} \ge 25.0$.

### D. Field of View & Centering ($S_{\text{fov}}$)
Evaluates whether the circular fundus optical mask covers at least 35% of the frame and is centered on the posterior pole (macula and optic disc):

$$S_{\text{fov}} = \frac{|M_{\text{retina}}|}{H \times W}$$

- Target: $S_{\text{fov}} \ge 0.35$.

---

## 2. Quality Classification Categories

| Category | Clinical Interpretation | Pipeline Action |
| :--- | :--- | :--- |
| **Good** | Crisp focus, even illumination, fully centered posterior pole | Proceeds directly to AI screening inference |
| **Borderline** | Minor illumination gradient or subtle blur, but major landmarks identifiable | Proceeds with warning badge and logged quality note |
| **Poor (`UNGRADABLE`)** | Severe blur, underexposure, corneal glare, or missed posterior pole | **Blocks AI classification**; triggers mandatory recapture |

---

## 3. Smart Recapture Guidance Rules

| Detected Flaw | Threshold Condition | Actionable Clinical Instruction |
| :--- | :--- | :--- |
| **Severe Blur** | $S_{\text{blur}} < 60.0$ | "Hold camera steady; verify patient fixation and focus on retinal microvasculature." |
| **Low Illumination** | $\mu_Y < 40.0$ | "Increase flash intensity; ensure patient pupil is sufficiently dilated or wait in dim lighting." |
| **Overexposure / Glare** | $\mu_Y > 210.0$ | "Reduce illumination intensity; adjust camera angle to eliminate corneal reflections." |
| **Low Contrast** | $S_{\text{contrast}} < 20.0$ | "Optimize flash exposure and check fundus camera lens for smudges or moisture." |
| **Partial Field of View** | $S_{\text{fov}} < 0.30$ | "Re-center camera on the posterior pole; ensure patient aligns eye directly with the central fixation LED." |

