import * as THREE from "three";

// ──────────────────────────────────────────────
// BODY REGION DEFINITIONS
// Shared between BodyViewer3D (passive) and
// InteractiveBodyMap (interactive click-to-select).
//
// GLB model analysis: single static low-poly mesh (4,944 verts)
// Raw space: X: -0.71..+0.71, Y: -0.28..+0.28, Z: 0..3.05 (Z=height in raw)
// normalizeMesh() rotates -90° around X → height becomes Y axis
// Rotation formula: new_Z = -old_Y
// If original Y > 0 = front → new_Z < 0  (front of body is at NEGATIVE Z)
// If original Y < 0 = back  → new_Z > 0  (back of body is at POSITIVE Z)
//
// Final normalized coordinate system:
//   Y : -1 = feet   +1 = head
//   Z : -0.18 = front surface   +0.18 = back surface   ← IMPORTANT
//   X :  0 = centre  +x = model's right
//
// `radius` = approximate zone radius for hit detection
// `category` = visual color group
// ──────────────────────────────────────────────

export const CATEGORY_COLORS = {
  head:   "#ff9966",
  neck:   "#ffcc66",
  torso:  "#00d4ff",
  back:   "#6699ff",
  arm:    "#aa77ff",
  pelvis: "#ff77aa",
  leg:    "#66dd88",
  skin:   "#ffee66",
};

export const BODY_REGIONS = [
  // ─── FACE / HEAD (front-facing, Z negative) ───
  { kw: ["forehead"],                                                          pos: [ 0.00,  0.91, -0.17], label: "Forehead",         category: "head",   radius: 0.10 },
  { kw: ["migraine", "headache"],                                              pos: [ 0.00,  0.87, -0.13], label: "Head",             category: "head",   radius: 0.14 },
  { kw: ["eye", "vision", "optic", "sight", "conjunctiv", "cataract", "glaucoma"], pos: [0.07, 0.86, -0.18], label: "Eye",           category: "head",   radius: 0.07 },
  { kw: ["ear", "hearing", "tinnitus", "otitis"],                              pos: [ 0.14,  0.84, -0.06], label: "Ear",             category: "head",   radius: 0.07 },
  { kw: ["nose", "nasal", "sinus", "rhinitis", "sneezing"],                    pos: [ 0.00,  0.83, -0.20], label: "Nose / Sinuses",  category: "head",   radius: 0.07 },
  { kw: ["mouth", "lip", "tongue", "teeth", "tooth", "dental", "gum", "oral"],pos: [ 0.00,  0.79, -0.19], label: "Mouth / Teeth",   category: "head",   radius: 0.08 },
  { kw: ["jaw", "tmj", "mandible"],                                            pos: [ 0.09,  0.77, -0.16], label: "Jaw",             category: "head",   radius: 0.08 },
  { kw: ["face", "facial", "cheek", "chin"],                                   pos: [ 0.00,  0.81, -0.18], label: "Face",            category: "head",   radius: 0.10 },
  { kw: ["brain", "skull", "cranial", "scalp", "head"],                        pos: [ 0.00,  0.87, -0.13], label: "Head",            category: "head",   radius: 0.14 },

  // ─── NECK / THROAT (front-facing) ───
  { kw: ["throat", "tonsil", "pharynx", "larynx", "strep", "swallow"],         pos: [ 0.00,  0.60, -0.15], label: "Throat",          category: "neck",   radius: 0.08 },
  { kw: ["thyroid", "goiter"],                                                  pos: [ 0.00,  0.59, -0.16], label: "Thyroid",         category: "neck",   radius: 0.07 },
  { kw: ["neck", "cervical", "stiff neck"],                                     pos: [ 0.00,  0.62, -0.10], label: "Neck",            category: "neck",   radius: 0.10 },

  // ─── SHOULDERS / ARMS (side-facing, Z near 0) ───
  { kw: ["shoulder", "rotator cuff", "deltoid"],                                pos: [ 0.34,  0.50, -0.04], label: "Shoulder",        category: "arm",    radius: 0.12 },
  { kw: ["armpit", "axilla"],                                                   pos: [ 0.28,  0.40, -0.06], label: "Armpit",          category: "arm",    radius: 0.09 },
  { kw: ["upper arm", "bicep", "tricep", "humerus"],                            pos: [ 0.38,  0.24,  0.00], label: "Upper Arm",       category: "arm",    radius: 0.10 },
  { kw: ["elbow", "tennis elbow"],                                              pos: [ 0.43,  0.00,  0.02], label: "Elbow",           category: "arm",    radius: 0.08 },
  { kw: ["forearm", "radius", "ulna"],                                          pos: [ 0.44, -0.18,  0.00], label: "Forearm",         category: "arm",    radius: 0.09 },
  { kw: ["wrist", "carpal tunnel", "carpal"],                                   pos: [ 0.45, -0.34,  0.00], label: "Wrist",           category: "arm",    radius: 0.07 },
  { kw: ["hand", "palm", "finger", "thumb", "knuckle"],                         pos: [ 0.46, -0.50,  0.00], label: "Hand",            category: "arm",    radius: 0.09 },
  { kw: ["arm"],                                                                pos: [ 0.40,  0.15,  0.00], label: "Arm",             category: "arm",    radius: 0.13 },

  // ─── CHEST (front surface, Z negative) ───
  { kw: ["heart", "cardiac", "palpitation", "angina", "myocardial"],            pos: [-0.08,  0.34, -0.10], label: "Heart",           category: "torso",  radius: 0.10 },
  { kw: ["lung", "pulmonary", "breath", "breathing", "respiratory",
          "bronch", "asthma", "cough", "pneumonia", "copd", "tuberculosis",
          "tb ", "inhale", "exhale", "wheeze"],                                  pos: [ 0.07,  0.34, -0.08], label: "Lungs",           category: "torso",  radius: 0.13 },
  { kw: ["breast", "nipple"],                                                   pos: [ 0.10,  0.30, -0.16], label: "Chest / Breast",  category: "torso",  radius: 0.10 },
  { kw: ["rib", "sternum", "costal"],                                           pos: [ 0.13,  0.28, -0.13], label: "Ribs",            category: "torso",  radius: 0.11 },
  { kw: ["chest"],                                                              pos: [ 0.00,  0.32, -0.16], label: "Chest",           category: "torso",  radius: 0.15 },

  // ─── BACK (back surface, Z positive) ───
  { kw: ["upper back", "thoracic"],                                             pos: [ 0.00,  0.30,  0.14], label: "Upper Back",      category: "back",   radius: 0.13 },
  { kw: ["lower back", "lumbar", "sciatica", "lumbago"],                        pos: [ 0.00, -0.10,  0.14], label: "Lower Back",      category: "back",   radius: 0.13 },
  { kw: ["spine", "spinal", "vertebra", "disc", "herniated", "spondyl",
          "back pain", "back"],                                                  pos: [ 0.00,  0.10,  0.13], label: "Back / Spine",    category: "back",   radius: 0.16 },

  // ─── UPPER ABDOMEN (front surface) ───
  { kw: ["stomach", "gastric", "epigastric", "nausea", "vomiting", "ulcer"],    pos: [ 0.00,  0.16, -0.16], label: "Stomach",         category: "torso",  radius: 0.11 },
  { kw: ["liver", "hepatic", "jaundice", "hepatitis"],                          pos: [ 0.13,  0.18, -0.09], label: "Liver",           category: "torso",  radius: 0.09 },
  { kw: ["gallbladder", "bile", "biliary", "cholecystitis"],                    pos: [ 0.13,  0.16, -0.11], label: "Gallbladder",     category: "torso",  radius: 0.08 },
  { kw: ["spleen"],                                                             pos: [-0.13,  0.18, -0.05], label: "Spleen",          category: "torso",  radius: 0.08 },
  { kw: ["pancreas", "pancreatitis"],                                           pos: [ 0.00,  0.12, -0.06], label: "Pancreas",        category: "torso",  radius: 0.08 },
  { kw: ["kidney", "renal", "nephritis", "kidney stone"],                       pos: [ 0.13,  0.06,  0.09], label: "Kidney",          category: "torso",  radius: 0.09 },

  // ─── LOWER ABDOMEN (front surface) ───
  { kw: ["navel", "umbilical"],                                                 pos: [ 0.00,  0.00, -0.17], label: "Navel",           category: "torso",  radius: 0.07 },
  { kw: ["appendix", "appendicitis"],                                           pos: [ 0.13, -0.08, -0.13], label: "Appendix",        category: "torso",  radius: 0.08 },
  { kw: ["bowel", "intestine", "colon", "diarrhea", "constipation", "ibs",
          "crohn"],                                                              pos: [ 0.00, -0.06, -0.13], label: "Intestines",      category: "torso",  radius: 0.12 },
  { kw: ["abdomen", "abdominal", "belly", "tummy", "stomach ache"],             pos: [ 0.00,  0.04, -0.16], label: "Abdomen",         category: "torso",  radius: 0.14 },

  // ─── PELVIS (front surface) ───
  { kw: ["bladder", "urinary", "urine", "uti", "cystitis"],                     pos: [ 0.00, -0.22, -0.15], label: "Bladder",         category: "pelvis", radius: 0.09 },
  { kw: ["uterus", "cervix", "menstrual", "period", "cramp", "endometriosis",
          "ovary", "ovarian", "pcos", "gynaec", "gynec", "vagina", "vulva"],    pos: [ 0.00, -0.24, -0.13], label: "Pelvic / Reproductive", category: "pelvis", radius: 0.10 },
  { kw: ["prostate", "testicular", "testicle", "scrotal"],                      pos: [ 0.00, -0.26, -0.13], label: "Pelvic / Urogenital",   category: "pelvis", radius: 0.09 },
  { kw: ["groin", "inguinal", "hernia"],                                        pos: [ 0.13, -0.36, -0.14], label: "Groin",           category: "pelvis", radius: 0.10 },
  { kw: ["hip"],                                                                pos: [ 0.23, -0.20, -0.05], label: "Hip",             category: "pelvis", radius: 0.10 },
  { kw: ["pelvis", "pelvic"],                                                   pos: [ 0.00, -0.20, -0.11], label: "Pelvis",          category: "pelvis", radius: 0.12 },

  // ─── LEGS (front/outer surface) ───
  { kw: ["thigh", "quadricep", "hamstring", "femur"],                           pos: [ 0.14, -0.50, -0.07], label: "Thigh",           category: "leg",    radius: 0.12 },
  { kw: ["knee", "patella", "meniscus", "acl", "cruciate"],                     pos: [ 0.12, -0.67, -0.12], label: "Knee",            category: "leg",    radius: 0.09 },
  { kw: ["shin", "tibia", "fibula"],                                            pos: [ 0.10, -0.79, -0.12], label: "Shin",            category: "leg",    radius: 0.09 },
  { kw: ["calf", "gastrocnemius"],                                              pos: [ 0.09, -0.79,  0.11], label: "Calf",            category: "leg",    radius: 0.09 },
  { kw: ["ankle", "achilles"],                                                  pos: [ 0.09, -0.93, -0.07], label: "Ankle",           category: "leg",    radius: 0.07 },
  { kw: ["foot", "feet", "heel", "toe", "plantar", "metatarsal"],               pos: [ 0.09, -0.99, -0.10], label: "Foot",            category: "leg",    radius: 0.10 },
  { kw: ["leg"],                                                                pos: [ 0.12, -0.60, -0.07], label: "Leg",             category: "leg",    radius: 0.13 },

  // ─── SKIN / WHOLE-BODY ───
  { kw: ["rash", "skin", "itch", "dermat", "eczema", "psoriasis",
          "acne", "hive", "blister"],                                            pos: [ 0.00,  0.10, -0.19], label: "Skin",            category: "skin",   radius: 0.20 },
  { kw: ["fever", "flu", "infection", "virus", "bacterial"],                    pos: [ 0.00,  0.00, -0.19], label: "Body (General)",  category: "skin",   radius: 0.20 },
  { kw: ["fatigue", "tired", "weakness", "dizziness", "faint"],                 pos: [ 0.00,  0.00, -0.19], label: "Body (General)",  category: "skin",   radius: 0.20 },
];

// ── Visible guide markers in the 3D scene (non-interactive visual cues) ──
// Z is negative for front-of-body, positive for back-of-body
export const GUIDE_DOTS = [
  { pos: [ 0.00,  0.87, -0.13], color: "#ff9966", label: "Head"       },
  { pos: [ 0.00,  0.62, -0.10], color: "#ffcc66", label: "Neck"       },
  { pos: [ 0.00,  0.32, -0.16], color: "#00d4ff", label: "Chest"      },
  { pos: [ 0.00,  0.04, -0.16], color: "#00b8d9", label: "Abdomen"    },
  { pos: [ 0.00, -0.20, -0.11], color: "#ff77aa", label: "Pelvis"     },
  { pos: [ 0.00,  0.10,  0.13], color: "#6699ff", label: "Back"       },
  { pos: [ 0.34,  0.50, -0.04], color: "#aa77ff", label: "Shoulder"   },
  { pos: [ 0.46, -0.50,  0.00], color: "#cc99ff", label: "Hand"       },
  { pos: [ 0.12, -0.67, -0.12], color: "#66dd88", label: "Knee"       },
  { pos: [ 0.09, -0.99, -0.10], color: "#44cc77", label: "Foot"       },
];

// ── Keyword-based lookup (symptom text → region) ──
export function getBodyRegion(symptomText) {
  if (!symptomText) return { pos: [0, 0, -0.19], label: "Body" };
  const lower = symptomText.toLowerCase();

  const sorted = BODY_REGIONS.map((r) => ({
    ...r,
    maxLen: Math.max(...r.kw.map((k) => k.length)),
  })).sort((a, b) => b.maxLen - a.maxLen);

  for (const region of sorted) {
    for (const keyword of region.kw) {
      if (lower.includes(keyword)) {
        return { pos: region.pos, label: region.label };
      }
    }
  }
  return { pos: [0, 0, -0.19], label: "Body (General)" };
}

// ── Position-based lookup (3D click point → nearest region) ──
// Uses zone-based detection: regions with a `radius` field are checked first.
// Falls back to pure proximity if no zone candidates found.
export function getNearestRegion(point) {
  const px = point.x, py = point.y, pz = point.z;

  const wDist = (region) => {
    const [rx, ry, rz] = region.pos;
    return (
      (px - rx) ** 2 * 1.0 +
      (py - ry) ** 2 * 2.5 +  // Y (height) most important
      (pz - rz) ** 2 * 1.5    // Z (depth front/back) secondary
    );
  };

  // First pass: zone candidates within radius × 1.4
  const candidates = [];
  for (const region of BODY_REGIONS) {
    const r = region.radius || 0.15;
    const [rx, ry, rz] = region.pos;
    const euclidean = Math.sqrt(
      (px - rx) ** 2 + (py - ry) ** 2 + (pz - rz) ** 2
    );
    if (euclidean < r * 1.4) {
      candidates.push({ region, d: wDist(region) });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => a.d - b.d);
    return candidates[0].region;
  }

  // Fallback: nearest by weighted distance
  let nearest = BODY_REGIONS[0];
  let minD = Infinity;
  for (const region of BODY_REGIONS) {
    const d = wDist(region);
    if (d < minD) { minD = d; nearest = region; }
  }
  return nearest;
}

// ── Shared mesh normalisation (scale height → 2 units, centre) ──
export function normalizeMesh(scene) {
  const cloned = scene.clone(true);

  let box = new THREE.Box3().setFromObject(cloned);
  let size = box.getSize(new THREE.Vector3());

  // Orientation correction (GLB raw space: Z = height)
  if (size.z > size.y * 1.35) {
    cloned.rotation.x = -Math.PI / 2;
    cloned.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(cloned);
    size = box.getSize(new THREE.Vector3());
  } else if (size.x > size.y * 1.35) {
    cloned.rotation.z = Math.PI / 2;
    cloned.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(cloned);
    size = box.getSize(new THREE.Vector3());
  }

  // Scale so height = 2 units (Y: -1 feet → +1 head)
  const heightScale = 2.0 / Math.max(size.y, 0.001);
  cloned.scale.multiplyScalar(heightScale);

  // Re-centre after scaling
  cloned.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(cloned);
  const center = box.getCenter(new THREE.Vector3());
  cloned.position.set(-center.x, -center.y, -center.z);

  return cloned;
}
