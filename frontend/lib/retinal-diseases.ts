/**
 * DRISHTI-X — Retinal Disease Knowledge Base
 * Comprehensive clinical definitions for the 3D Retinal Disease Explorer.
 * Each disease includes visual lesion markers for 3D rendering on the retinal bowl.
 */

export interface DiseaseLesion {
  /** Position on the retinal bowl [x, y, z] — normalized to sphere radius ~1.94 */
  position: [number, number, number]
  /** Lesion rendering type */
  type: "microaneurysm" | "hemorrhage" | "hardExudate" | "cottonWoolSpot" | "neovascularization" | "edema" | "venousBeading" | "IRMA"
  /** Radius of the lesion marker */
  radius: number
  /** Color override */
  color?: string
}

export interface RetinalDisease {
  id: string
  name: string
  shortName: string
  category: "Diabetic Retinopathy" | "Macular Disease" | "Glaucoma" | "Complication"
  severity: "None" | "Mild" | "Moderate" | "Severe" | "Proliferative" | "Sight-Threatening"
  drGrade: number
  icon: string
  accentColor: string
  summary: string
  description: string
  symptoms: string[]
  signs: string[]
  pathophysiology: string
  treatment: string[]
  prognosis: string
  prevalence: string
  riskFactors: string[]
  lesions: DiseaseLesion[]
}

export const RETINAL_DISEASES: RetinalDisease[] = [
  {
    id: "no-dr",
    name: "No Diabetic Retinopathy",
    shortName: "No DR (Grade 0)",
    category: "Diabetic Retinopathy",
    severity: "None",
    drGrade: 0,
    icon: "CheckCircle2",
    accentColor: "#34D399",
    summary: "Normal retina with healthy vasculature and no visible microvascular pathology.",
    description:
      "The retinal microvasculature appears normal with no evidence of microaneurysms, hemorrhages, exudates, or neovascularization. Vessel calibre, arteriovenous ratio, and the foveal avascular zone are within normal limits.",
    symptoms: ["Asymptomatic", "Normal visual acuity (20/20 or better)"],
    signs: [
      "Normal retinal vasculature with healthy arteriovenous ratio (~2:3)",
      "Clear optic disc with physiological cup",
      "Foveal avascular zone intact",
      "No microaneurysms or hemorrhages",
    ],
    pathophysiology:
      "Chronic hyperglycemia has not yet caused detectable microvascular damage. Pericyte loss and basement membrane thickening may be subclinical but not visible on fundus imaging.",
    treatment: [
      "Annual diabetic retinopathy screening (recommended)",
      "Glycemic control (HbA1c < 7% for most adults)",
      "Blood pressure control (< 130/80 mmHg)",
      "Lipid management",
    ],
    prognosis: "Excellent. With continued glycemic control, risk of progression is minimal.",
    prevalence: "~60% of people with diabetes have no DR at any given time.",
    riskFactors: ["Duration of diabetes", "Poor glycemic control", "Hypertension", "Dyslipidemia"],
    lesions: [],
  },
  {
    id: "mild-npdr",
    name: "Mild Non-Proliferative Diabetic Retinopathy",
    shortName: "Mild NPDR (Grade 1)",
    category: "Diabetic Retinopathy",
    severity: "Mild",
    drGrade: 1,
    icon: "Dot",
    accentColor: "#FBBF24",
    summary: "Earliest detectable stage — small microaneurysms appear at vessel termini.",
    description:
      "Mild NPDR is defined by the presence of at least one microaneurysm. These are small, saccular outpouchings of capillary walls caused by pericyte loss and endothelial cell weakness. The retina remains largely healthy with minimal functional impact.",
    symptoms: ["Typically asymptomatic", "Normal or near-normal visual acuity"],
    signs: [
      "Microaneurysms (small red dots, 10-100µm) at arteriolar and venular termini",
      "No significant hemorrhage or exudate",
      "Vessel calibre normal",
      "Optic disc and macula appear normal",
    ],
    pathophysiology:
      "Hyperglycemia activates the polyol pathway and protein kinase C (PKC), leading to oxidative stress and pericyte apoptosis. Pericyte loss weakens capillary walls, causing focal outpouching (microaneurysms). These can leak plasma (leading to exudates) or rupture (causing hemorrhages).",
    treatment: [
      "Annual or biannual screening",
      "Optimize glycemic control (HbA1c target < 7%)",
      "Blood pressure management",
      "Lifestyle: diet, exercise, smoking cessation",
    ],
    prognosis:
      "Good. Most patients remain stable for years with glycemic control. ~5-10% progress to more severe stages within 1 year.",
    prevalence: "~20-25% of people with diabetes have mild NPDR.",
    riskFactors: ["Diabetes duration > 5 years", "HbA1c > 8%", "Hypertension", "Nephropathy"],
    lesions: [
      { position: [-0.3, 0.8, -1.82], type: "microaneurysm", radius: 0.04 },
      { position: [0.2, 0.9, -1.78], type: "microaneurysm", radius: 0.035 },
      { position: [-0.8, 0.5, -1.85], type: "microaneurysm", radius: 0.045 },
      { position: [0.9, 0.3, -1.80], type: "microaneurysm", radius: 0.03 },
      { position: [-0.5, -0.7, -1.83], type: "microaneurysm", radius: 0.04 },
      { position: [0.5, -0.6, -1.81], type: "microaneurysm", radius: 0.035 },
    ],
  },
  {
    id: "moderate-npdr",
    name: "Moderate Non-Proliferative Diabetic Retinopathy",
    shortName: "Moderate NPDR (Grade 2)",
    category: "Diabetic Retinopathy",
    severity: "Moderate",
    drGrade: 2,
    icon: "AlertCircle",
    accentColor: "#F97316",
    summary: "Microaneurysms plus intraretinal hemorrhages, hard exudates, and cotton-wool spots.",
    description:
      "Moderate NPDR shows progression beyond microaneurysms. Intraretinal (dot-blot) hemorrhages appear due to capillary rupture. Hard exudates (lipid deposits) form from leaking vessels. Cotton-wool spots (nerve fiber layer infarcts) may appear. This is the referable stage requiring ophthalmology evaluation.",
    symptoms: ["May notice mild blurring", "Often still asymptomatic", "Slight difficulty with night vision"],
    signs: [
      "Multiple microaneurysms across all quadrants",
      "Intraretinal dot-blot hemorrhages",
      "Hard exudates (yellow-white lipid deposits) in a circinate pattern",
      "Possible cotton-wool spots (white, fluffy nerve fiber infarcts)",
      "Retinal edema may be present",
    ],
    pathophysiology:
      "Progressive pericyte loss leads to capillary wall failure. Endothelial tight junctions break down, increasing vascular permeability. Plasma lipoproteins leak into the extracellular space forming hard exudates. Capillary occlusion causes microinfarcts (cotton-wool spots). The blood-retinal barrier is compromised.",
    treatment: [
      "Referral to ophthalmology (referable DR)",
      "Every 6-12 month screening interval",
      "Intensive glycemic control",
      "Blood pressure and lipid optimization",
      "Consider fenofibrate for diabetic retinopathy progression",
    ],
    prognosis:
      "Moderate. ~20-30% progress to severe NPDR within 1-3 years. Timely intervention can stabilize the condition.",
    prevalence: "~10-15% of people with diabetes have moderate NPDR.",
    riskFactors: ["Longstanding diabetes", "Poor HbA1c", "Hypertension", "Pregnancy", "Nephropathy"],
    lesions: [
      { position: [-0.3, 0.8, -1.82], type: "microaneurysm", radius: 0.04 },
      { position: [0.2, 0.9, -1.78], type: "microaneurysm", radius: 0.035 },
      { position: [-0.8, 0.5, -1.85], type: "microaneurysm", radius: 0.045 },
      { position: [0.9, 0.3, -1.80], type: "microaneurysm", radius: 0.03 },
      { position: [-0.5, -0.7, -1.83], type: "microaneurysm", radius: 0.04 },
      { position: [-0.6, 0.75, -1.84], type: "hemorrhage", radius: 0.08 },
      { position: [0.8, -0.4, -1.79], type: "hemorrhage", radius: 0.07 },
      { position: [0.4, 0.6, -1.80], type: "hardExudate", radius: 0.06 },
      { position: [-0.2, -0.5, -1.82], type: "hardExudate", radius: 0.055 },
      { position: [-1.0, -0.2, -1.80], type: "cottonWoolSpot", radius: 0.07 },
      { position: [1.0, 0.6, -1.77], type: "hardExudate", radius: 0.05 },
    ],
  },
  {
    id: "severe-npdr",
    name: "Severe Non-Proliferative Diabetic Retinopathy",
    shortName: "Severe NPDR (Grade 3)",
    category: "Diabetic Retinopathy",
    severity: "Severe",
    drGrade: 3,
    icon: "AlertTriangle",
    accentColor: "#EF4444",
    summary: "Extensive hemorrhages, venous beading, and intraretinal microvascular abnormalities (IRMA).",
    description:
      "Severe NPDR meets the '4-2-1 rule': hemorrhages in 4 quadrants, venous beading in 2+ quadrants, or IRMA in 1+ quadrant. The retina is increasingly ischemic with capillary dropout. This is a high-risk stage with imminent threat of progression to proliferative disease.",
    symptoms: ["Moderate visual blurring", "Floaters", "Reduced contrast sensitivity", "Possible visual field defects"],
    signs: [
      "Extensive intraretinal hemorrhages in all 4 quadrants",
      "Venous beading (irregular venous calibre) in ≥2 quadrants",
      "Intraretinal microvascular abnormalities (IRMA) in ≥1 quadrant",
      "Cotton-wool spots more numerous",
      "Capillary non-perfusion zones on FA/FAZ",
      "No neovascularization yet (that defines PDR)",
    ],
    pathophysiology:
      "Widespread capillary occlusion causes retinal ischemia. Hypoxia-inducible factors (HIF-1α) upregulate VEGF production, creating a pro-angiogenic environment. Venous beading reflects endothelial damage and basement membrane thickening. IRMA represents shunt vessels bypassing non-perfused capillary beds. The retina is primed for neovascularization.",
    treatment: [
      "Urgent ophthalmology referral (within 1 month)",
      "Panretinal laser photocoagulation (PRP) if approaching PDR",
      "Anti-VEGF therapy (off-label for NPDR with CME)",
      "Aggressive systemic control: HbA1c, BP, lipids",
      "Close monitoring every 3-4 months",
    ],
    prognosis:
      "High risk. ~50% progress to PDR within 1 year without treatment. PRP can reduce risk of severe vision loss by 50%.",
    prevalence: "~3-5% of people with diabetes have severe NPDR.",
    riskFactors: ["Diabetes duration > 15 years", "Poor glycemic control", "Severe hypertension", "Nephropathy"],
    lesions: [
      { position: [-0.3, 0.8, -1.82], type: "microaneurysm", radius: 0.04 },
      { position: [0.2, 0.9, -1.78], type: "microaneurysm", radius: 0.035 },
      { position: [-0.8, 0.5, -1.85], type: "microaneurysm", radius: 0.045 },
      { position: [-0.6, 0.75, -1.84], type: "hemorrhage", radius: 0.09 },
      { position: [0.8, -0.4, -1.79], type: "hemorrhage", radius: 0.08 },
      { position: [0.3, 0.5, -1.80], type: "hemorrhage", radius: 0.085 },
      { position: [-1.1, -0.3, -1.79], type: "hemorrhage", radius: 0.075 },
      { position: [0.4, 0.6, -1.80], type: "hardExudate", radius: 0.06 },
      { position: [-0.2, -0.5, -1.82], type: "hardExudate", radius: 0.055 },
      { position: [-1.0, -0.2, -1.80], type: "cottonWoolSpot", radius: 0.08 },
      { position: [1.1, -0.1, -1.78], type: "cottonWoolSpot", radius: 0.065 },
      { position: [-0.9, 0.9, -1.77], type: "cottonWoolSpot", radius: 0.07 },
      { position: [-0.5, 0.9, -1.80], type: "venousBeading", radius: 0.05 },
      { position: [0.7, 0.9, -1.76], type: "venousBeading", radius: 0.05 },
      { position: [-0.9, -0.8, -1.78], type: "IRMA", radius: 0.055 },
    ],
  },
  {
    id: "pdr",
    name: "Proliferative Diabetic Retinopathy",
    shortName: "PDR (Grade 4)",
    category: "Diabetic Retinopathy",
    severity: "Proliferative",
    drGrade: 4,
    icon: "Flame",
    accentColor: "#DC2626",
    summary: "Neovascularization of the disc (NVD) or elsewhere (NVE), risking vitreous hemorrhage and tractional retinal detachment.",
    description:
      "Proliferative DR is characterized by new, fragile blood vessel growth (neovascularization) on the optic disc (NVD) or elsewhere on the retina (NVE). These vessels are structurally abnormal, leaky, and prone to rupture. Fibrovascular proliferation can contract and cause tractional retinal detachment — a sight-threatening emergency.",
    symptoms: [
      "Sudden vision loss (vitreous hemorrhage)",
      "Floaters or cobwebs in vision",
      "Photopsias (flashing lights) if traction present",
      "Severe blurring or distortion",
    ],
    signs: [
      "Neovascularization of the disc (NVD) — fine, lacy vessels on the optic disc",
      "Neovascularization elsewhere (NVE) — new vessels along vascular arcades",
      "Preretinal or vitreous hemorrhage",
      "Fibrovascular proliferation and traction bands",
      "Possible tractional retinal detachment",
      "Rubeosis iridis in advanced cases",
    ],
    pathophysiology:
      "Severe retinal ischemia triggers HIF-1α–mediated VEGF overproduction. VEGF stimulates endothelial proliferation and migration, forming new vessels that lack pericytes and mature blood-retinal barrier properties. These vessels grow along the posterior hyaloid, and their rupture causes vitreous hemorrhage. Fibrous tissue accompanies neovascularization; contraction leads to tractional retinal detachment.",
    treatment: [
      "Panretinal laser photocoagulation (PRP) — gold standard, destroys ischemic retina to reduce VEGF",
      "Intravitreal anti-VEGF injections (bevacizumab, ranibizumab, aflibercept)",
      "Vitrectomy for non-clearing vitreous hemorrhage or tractional retinal detachment",
      "Urgent ophthalmology referral (< 1 week)",
    ],
    prognosis:
      "Without treatment, 50% develop severe vision loss within 5 years. PRP reduces severe vision loss by ~60%. Anti-VEGF can regress neovascularization within weeks.",
    prevalence: "~1-2% of people with diabetes have PDR.",
    riskFactors: [
      "Diabetes duration > 20 years",
      "Severe ischemia from uncontrolled diabetes",
      "Nephropathy/renal failure",
      "Pregnancy (can accelerate progression)",
    ],
    lesions: [
      { position: [-0.3, 0.8, -1.82], type: "microaneurysm", radius: 0.04 },
      { position: [-0.6, 0.75, -1.84], type: "hemorrhage", radius: 0.09 },
      { position: [0.8, -0.4, -1.79], type: "hemorrhage", radius: 0.08 },
      { position: [-1.0, -0.2, -1.80], type: "cottonWoolSpot", radius: 0.08 },
      { position: [-0.65, 0.25, -1.91], type: "neovascularization", radius: 0.12 },
      { position: [0.1, 0.95, -1.77], type: "neovascularization", radius: 0.1 },
      { position: [-0.9, 0.85, -1.77], type: "neovascularization", radius: 0.09 },
      { position: [1.0, -0.5, -1.78], type: "neovascularization", radius: 0.08 },
      { position: [-0.5, 0.9, -1.80], type: "venousBeading", radius: 0.05 },
      { position: [0.7, 0.9, -1.76], type: "venousBeading", radius: 0.05 },
    ],
  },
  {
    id: "dme",
    name: "Diabetic Macular Edema",
    shortName: "DME",
    category: "Macular Disease",
    severity: "Sight-Threatening",
    drGrade: -1,
    icon: "Droplet",
    accentColor: "#A78BFA",
    summary: "Fluid accumulation and thickening in the macula — the leading cause of vision loss in diabetic patients.",
    description:
      "Diabetic Macular Edema (DME) is retinal thickening within 1 disc diameter of the foveal center due to intraretinal fluid accumulation. It results from breakdown of the blood-retinal barrier, allowing plasma proteins and lipids to leak into the macula. DME can occur at any DR stage and is the most common cause of visual impairment in diabetic patients.",
    symptoms: [
      "Gradual central vision blurring",
      "Metamorphopsia (straight lines appear wavy)",
      "Difficulty reading or recognizing faces",
      "Reduced color vision",
    ],
    signs: [
      "Retinal thickening at or near the macula",
      "Hard exudates in circinate pattern around the fovea",
      "Cystoid macular edema on OCT (petalloid pattern)",
      "Foveal contour distortion on OCT",
      "May have associated microaneurysms",
    ],
    pathophysiology:
      "Chronic hyperglycemia disrupts tight junctions between retinal endothelial cells. VEGF and inflammatory cytokines increase vascular permeability. Fluid accumulates in the outer plexiform layer (Henle's fiber layer) and nuclear layers. Lipid/protein deposits precipitate as hard exudates. The foveal avascular zone distorts, reducing central visual acuity.",
    treatment: [
      "Intravitreal anti-VEGF therapy (first-line): aflibercept, ranibizumab, bevacizumab",
      "Focal/grid laser photocoagulation for persistent leakage",
      "Intravitreal corticosteroids (dexamethasone implant) for refractory cases",
      "Glycemic and blood pressure optimization",
    ],
    prognosis:
      "Good with early anti-VEGF treatment. ~50% gain 3+ lines of visual acuity. Untreated, progressive vision loss occurs.",
    prevalence: "~7% of people with diabetes have DME. Higher in type 2 (10%) than type 1 (4%).",
    riskFactors: ["Duration of diabetes", "HbA1c > 8%", "Hypertension", "Nephropathy", "Severe DR grade"],
    lesions: [
      { position: [0.65, -0.05, -1.91], type: "edema", radius: 0.25 },
      { position: [0.45, 0.15, -1.89], type: "hardExudate", radius: 0.06 },
      { position: [0.85, -0.25, -1.88], type: "hardExudate", radius: 0.05 },
      { position: [0.55, 0.25, -1.86], type: "hardExudate", radius: 0.04 },
      { position: [0.75, 0.15, -1.87], type: "microaneurysm", radius: 0.035 },
    ],
  },
  {
    id: "neovascular-glaucoma",
    name: "Neovascular Glaucoma",
    shortName: "NVG",
    category: "Glaucoma",
    severity: "Sight-Threatening",
    drGrade: -1,
    icon: "Eye",
    accentColor: "#06B6D4",
    summary: "Iris and angle neovascularization blocks aqueous outflow, causing severe intraocular pressure elevation.",
    description:
      "Neovascular Glaucoma (NVG) is a devastating complication of proliferative diabetic retinopathy. New vessels grow on the iris (rubeosis) and over the trabecular meshwork in the anterior chamber angle, blocking aqueous humor outflow. This causes a rapid, dangerous rise in intraocular pressure (IOP), leading to optic nerve damage and permanent vision loss if untreated.",
    symptoms: [
      "Severe eye pain and headache",
      "Red eye with conjunctival injection",
      "Blurred vision or rapid vision loss",
      "Nausea and vomiting (from high IOP)",
      "Halos around lights",
    ],
    signs: [
      "Iris neovascularization (rubeosis iridis) — fine vessels on iris surface",
      "Elevated IOP (often > 40 mmHg, normal is 10-21)",
      "Corneal edema (cloudy cornea from high pressure)",
      "Anterior chamber angle closure on gonioscopy",
      "Optic disc cupping if chronic",
    ],
    pathophysiology:
      "Retinal ischemia from severe PDR produces high VEGF levels. VEGF diffuses anteriorly, stimulating neovascularization of the iris (rubeosis) and anterior chamber angle. Fibrovascular membrane contracts, causing peripheral anterior synechiae (PAS) and permanent angle closure. Aqueous outflow is blocked → IOP rises → optic nerve damage.",
    treatment: [
      "Urgent IOP reduction: topical beta-blockers, alpha-2 agonists, carbonic anhydrase inhibitors",
      "Intravitreal anti-VEGF injection to regress iris neovessels",
      "Panretinal photocoagulation (PRP) to address ischemic drive",
      "Glaucoma drainage implant or trabeculectomy if uncontrolled medically",
      "Pain management if blind eye",
    ],
    prognosis:
      "Guarded. Even with treatment, vision prognosis is poor if not caught early. IOP control is achievable, but optic nerve damage may be irreversible.",
    prevalence: "Rare in absolute terms, but up to 4% of eyes with PDR develop NVG.",
    riskFactors: ["Proliferative DR", "Central retinal vein occlusion (CRVO)", "Ocular ischemic syndrome"],
    lesions: [
      { position: [-0.65, 0.25, -1.91], type: "neovascularization", radius: 0.1 },
      { position: [0.1, 0.95, -1.77], type: "neovascularization", radius: 0.09 },
      { position: [0.65, -0.05, -1.91], type: "edema", radius: 0.15 },
    ],
  },
  {
    id: "cataract",
    name: "Diabetic Cataract",
    shortName: "Cataract",
    category: "Complication",
    severity: "Moderate",
    drGrade: -1,
    icon: "Cloud",
    accentColor: "#94A3B8",
    summary: "Accelerated lens opacification due to sorbitol accumulation and oxidative stress.",
    description:
      "People with diabetes develop cataracts earlier and progress faster than the general population. The polyol pathway converts excess glucose to sorbitol, which accumulates in lens fibers causing osmotic swelling and opacification. Posterior subcapsular cataracts are particularly common and visually significant.",
    symptoms: [
      "Progressive blurring of vision",
      "Glare sensitivity (especially with oncoming headlights)",
      "Difficulty reading in low light",
      "Fading or yellowing of colors",
      "Frequent changes in spectacle prescription",
    ],
    signs: [
      "Lens opacification visible on slit-lamp exam",
      "Posterior subcapsular cataract (granular opacity at posterior pole)",
      "Nuclear sclerosis (yellow-brown central opacification)",
      "Cortical cataract (spoke-like opacities)",
      "Reduced visual acuity not correctable with refraction",
    ],
    pathophysiology:
      "Hyperglycemia drives the polyol pathway: glucose → sorbitol via aldose reductase. Sorbitol cannot cross cell membranes, accumulating in lens fibers and causing osmotic stress. This leads to fiber swelling, disruption, and opacification. Oxidative stress from chronic hyperglycemia further damages lens proteins.",
    treatment: [
      "Phacoemulsification with intraocular lens (IOL) implantation",
      "Blood glucose optimization before surgery (reduces post-op complications)",
      "Regular post-operative monitoring for diabetic macular edema",
      "Manage concurrent DR before cataract surgery if possible",
    ],
    prognosis: "Excellent surgical outcomes. Modern phacoemulsification is safe and effective even in diabetic patients.",
    prevalence: "~20% of people with diabetes have cataracts (2-5x higher than non-diabetics).",
    riskFactors: ["Poor glycemic control", "Diabetes duration", "Age", "UV exposure"],
    lesions: [
      { position: [0, 0, 1.3], type: "edema", radius: 0.4 },
    ],
  },
]
