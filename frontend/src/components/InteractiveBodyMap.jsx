import React, { useState, useMemo, useRef, useCallback, Suspense, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { BODY_REGIONS, CATEGORY_COLORS, GUIDE_DOTS, getNearestRegion, normalizeMesh } from "../utils/bodyRegions";

// Category display order and labels
const CATEGORY_ORDER = ["head", "neck", "torso", "back", "arm", "pelvis", "leg", "skin"];
const CATEGORY_LABELS = {
  head:   "Head & Face",
  neck:   "Neck & Throat",
  torso:  "Chest & Abdomen",
  back:   "Back & Spine",
  arm:    "Shoulder & Arm",
  pelvis: "Pelvis & Hip",
  leg:    "Leg & Foot",
  skin:   "Skin",
};

// Camera positions: model front is at -Z (after normalizeMesh -90° X rotation)
const VIEW_PRESETS = {
  front: [0, 0, -3.8],
  back:  [0, 0,  3.8],
  left:  [ 3.8, 0, 0],
  right: [-3.8, 0, 0],
};

const VIEW_PRESET_META = {
  front: { label: "Front", key: "1", title: "Front view (press 1)" },
  back:  { label: "Back",  key: "2", title: "Back view (press 2)" },
  left:  { label: "Left",  key: "3", title: "Left view (press 3)" },
  right: { label: "Right", key: "4", title: "Right view (press 4)" },
};

// ──────────────────────────────────────────────
// PULSING RED MARKER  (selected region)
// ──────────────────────────────────────────────
function PulsingMarker({ position }) {
  const outerRef = useRef();
  useFrame(({ clock }) => {
    if (outerRef.current) {
      const t = clock.elapsedTime;
      const s = 1 + 0.45 * Math.sin(t * 3.8);
      outerRef.current.scale.setScalar(s);
      outerRef.current.material.opacity = 0.45 + 0.32 * Math.sin(t * 3.8);
    }
  });
  return (
    <group position={position}>
      <mesh ref={outerRef}>
        <sphereGeometry args={[0.075, 22, 22]} />
        <meshStandardMaterial
          color="#ff2222" emissive="#ff0000" emissiveIntensity={1.6}
          transparent opacity={0.5} depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.030, 16, 16]} />
        <meshStandardMaterial color="#ffffff" emissive="#ff5533" emissiveIntensity={3.0} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.055, 0.008, 8, 32]} />
        <meshStandardMaterial
          color="#ff4444" emissive="#ff2222" emissiveIntensity={2.0}
          transparent opacity={0.7} depthWrite={false}
        />
      </mesh>
      <pointLight color="#ff3333" intensity={1.2} distance={0.6} decay={2} />
    </group>
  );
}

// ──────────────────────────────────────────────
// HOVER INDICATOR
// ──────────────────────────────────────────────
function HoverMarker({ position, category }) {
  const color = CATEGORY_COLORS[category] || "#58a6ff";
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.048, 16, 16]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={1.6}
          transparent opacity={0.55} depthWrite={false}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.062, 0.006, 8, 28]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={2.0}
          transparent opacity={0.45} depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ──────────────────────────────────────────────
// GUIDE DOTS
// ──────────────────────────────────────────────
function GuideDots({ selectedLabel }) {
  return (
    <group>
      {GUIDE_DOTS.map((dot, i) => {
        if (selectedLabel && dot.label === selectedLabel) return null;
        return (
          <group key={i} position={dot.pos}>
            <mesh raycast={() => null}>
              <sphereGeometry args={[0.020, 10, 10]} />
              <meshStandardMaterial
                color={dot.color} emissive={dot.color} emissiveIntensity={0.9}
                transparent opacity={0.25} depthWrite={false}
              />
            </mesh>
            <mesh raycast={() => null} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.034, 0.005, 6, 20]} />
              <meshStandardMaterial
                color={dot.color} emissive={dot.color} emissiveIntensity={1.4}
                transparent opacity={0.32} depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ──────────────────────────────────────────────
// CAMERA CONTROLLER
// ──────────────────────────────────────────────
function CameraController({ view, controlsRef }) {
  const { camera } = useThree();
  const prevView = useRef(null);

  useEffect(() => {
    if (view === prevView.current) return;
    prevView.current = view;
    const pos = VIEW_PRESETS[view];
    if (pos) {
      camera.position.set(...pos);
      camera.lookAt(0, 0, 0);
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
    }
  }, [view, camera, controlsRef]);

  return null;
}

// ──────────────────────────────────────────────
// CLICKABLE BODY MESH
// ──────────────────────────────────────────────
function ClickableBodyMesh({ onSelect, selectedRegion, canClick, onHover }) {
  const { scene } = useGLTF("/human.glb");
  const [hovered, setHovered] = useState(null);

  const normalizedScene = useMemo(() => {
    const cloned = normalizeMesh(scene);
    cloned.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color("#6fa8c8"),
          roughness: 0.65,
          metalness: 0.04,
          transparent: true,
          opacity: 0.90,
        });
        child.castShadow = true;
      }
    });
    return cloned;
  }, [scene]);

  const handlePointerMove = useCallback((e) => {
    e.stopPropagation();
    if (e.buttons > 0) {
      setHovered(null);
      onHover(null);
      return;
    }
    const region = getNearestRegion(e.point);
    setHovered(region);
    onHover(region);
  }, [onHover]);

  const handlePointerLeave = useCallback(() => {
    setHovered(null);
    onHover(null);
  }, [onHover]);

  const handleClick = useCallback((e) => {
    e.stopPropagation();
    if (!canClick.current) return;
    const region = getNearestRegion(e.point);
    setHovered(null);
    onHover(null);
    onSelect(region);
  }, [canClick, onSelect, onHover]);

  const isHoverSameAsSelected =
    hovered && selectedRegion && hovered.label === selectedRegion.label;

  return (
    <group>
      <primitive
        object={normalizedScene}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
      />
      {hovered && !isHoverSameAsSelected && (
        <HoverMarker position={hovered.pos} category={hovered.category} />
      )}
      {selectedRegion && (
        <PulsingMarker position={selectedRegion.pos} />
      )}
    </group>
  );
}

// Simple CSS loading indicator (shown while GLB loads)
function LoadingCube() {
  const ref = useRef();
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 1.2;
  });
  return (
    <mesh ref={ref}>
      <boxGeometry args={[0.18, 0.18, 0.18]} />
      <meshStandardMaterial color="#58a6ff" wireframe />
    </mesh>
  );
}

useGLTF.preload("/human.glb");

// ──────────────────────────────────────────────
// MAIN EXPORT — Interactive Body Map Modal
// ──────────────────────────────────────────────
export default function InteractiveBodyMap({ onClose, onConsult }) {
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState("");
  const [viewPreset, setViewPreset] = useState("front");
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [regionSearch, setRegionSearch] = useState("");
  const [isFlashing, setIsFlashing] = useState(false);

  const canClick = useRef(true);
  const controlsRef = useRef();
  const prevSelectedRef = useRef(null);
  const searchInputRef = useRef();

  // Keyboard navigation: 1-4 = view presets, Escape = close
  useEffect(() => {
    const handler = (e) => {
      // Don't intercept keys if user is typing in an input/textarea
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "1") setViewPreset("front");
      else if (e.key === "2") setViewPreset("back");
      else if (e.key === "3") setViewPreset("left");
      else if (e.key === "4") setViewPreset("right");
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Flash feedback when a region is selected
  useEffect(() => {
    if (selected && selected !== prevSelectedRef.current) {
      prevSelectedRef.current = selected;
      setIsFlashing(true);
      const t = setTimeout(() => setIsFlashing(false), 420);
      return () => clearTimeout(t);
    }
  }, [selected]);

  // Deduplicate BODY_REGIONS by label
  const uniqueRegions = useMemo(() => {
    const seen = new Set();
    return BODY_REGIONS.filter((r) => {
      if (seen.has(r.label)) return false;
      seen.add(r.label);
      return true;
    });
  }, []);

  // Filter regions by search query
  const filteredRegions = useMemo(() => {
    const q = regionSearch.trim().toLowerCase();
    if (!q) return uniqueRegions;
    return uniqueRegions.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.kw.some((k) => k.toLowerCase().includes(q))
    );
  }, [uniqueRegions, regionSearch]);

  // Group filtered regions by category
  const groupedRegions = useMemo(() => {
    const groups = {};
    for (const cat of CATEGORY_ORDER) {
      const regions = filteredRegions.filter((r) => r.category === cat);
      if (regions.length) groups[cat] = regions;
    }
    return groups;
  }, [filteredRegions]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleConsult = () => {
    const region = selected?.label;
    let msg = "";
    if (region && details.trim()) {
      msg = `I have pain/discomfort in my ${region}. ${details.trim()}`;
    } else if (region) {
      msg = `I have pain/discomfort in my ${region}.`;
    } else {
      msg = details.trim();
    }
    if (msg) onConsult(msg);
  };

  const canConsult = selected || details.trim().length > 0;

  const handleRegionSelect = (region) => {
    setSelected(region);
  };

  const selectedColor = selected
    ? CATEGORY_COLORS[selected.category] || "#58a6ff"
    : null;

  const hoverColor = hoveredRegion
    ? CATEGORY_COLORS[hoveredRegion.category] || "#58a6ff"
    : null;

  return (
    <div className="ibm-overlay" onClick={handleOverlayClick}>
      <div className="ibm-panel">

        {/* ── Header ── */}
        <div className="ibm-header">
          <div>
            <h2 className="ibm-title">📍 Pinpoint Your Pain</h2>
            <p className="ibm-subtitle">
              Rotate the 3D model · hover to preview · click to select
            </p>
          </div>
          <button className="ibm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* ── Body ── */}
        <div className="ibm-body">

          {/* 3D Canvas */}
          <div
            className="ibm-canvas-wrap"
            onPointerDown={() => { canClick.current = true; }}
            onPointerMove={(e) => { if (e.buttons > 0) canClick.current = false; }}
          >
            <Canvas
              camera={{ position: VIEW_PRESETS.front, fov: 38 }}
              gl={{ antialias: true, alpha: false }}
            >
              <color attach="background" args={["#070c14"]} />

              <ambientLight intensity={0.50} />
              <directionalLight position={[2, 4, -3]} intensity={0.90} />
              <directionalLight position={[-2, 1, 1]} intensity={0.28} color="#4488bb" />
              <pointLight position={[0, 1.5, -2.5]} intensity={0.40} color="#58a6ff" />
              <pointLight position={[0, -1, -1.5]} intensity={0.18} color="#7755ff" />

              <CameraController view={viewPreset} controlsRef={controlsRef} />

              <Suspense fallback={<LoadingCube />}>
                <GuideDots selectedLabel={selected?.label} />
                <ClickableBodyMesh
                  onSelect={handleRegionSelect}
                  selectedRegion={selected}
                  canClick={canClick}
                  onHover={setHoveredRegion}
                />
              </Suspense>

              <OrbitControls
                ref={controlsRef}
                enablePan={false}
                minDistance={1.8}
                maxDistance={6.0}
                enableDamping
                dampingFactor={0.08}
              />
            </Canvas>

            {/* View preset buttons overlaid top-left of canvas */}
            <div className="ibm-view-btns">
              {Object.entries(VIEW_PRESET_META).map(([v, meta]) => (
                <button
                  key={v}
                  className={`ibm-view-btn${viewPreset === v ? " active" : ""}`}
                  onClick={() => setViewPreset(v)}
                  title={meta.title}
                  aria-label={meta.title}
                >
                  {meta.label}
                </button>
              ))}
            </div>

            <p className="ibm-canvas-hint">
              🖱 Drag · Scroll zoom · <strong>Click to select</strong>
            </p>
          </div>

          {/* ── Side controls ── */}
          <div className="ibm-controls">

            {/* Hover status */}
            <div className="ibm-hover-status">
              {hoveredRegion ? (
                <div className="ibm-hover-active">
                  <span className="ibm-category-dot" style={{ background: hoverColor }} />
                  <span className="ibm-hover-region-name">{hoveredRegion.label}</span>
                </div>
              ) : (
                <span className="ibm-hover-idle">Hover over the body to preview regions</span>
              )}
            </div>

            {/* Selected region display with flash */}
            <div
              className={`ibm-selection-box${isFlashing ? " ibm-flash-active" : ""}`}
              style={selectedColor ? { borderColor: selectedColor + "55" } : {}}
            >
              {selected ? (
                <>
                  <div className="ibm-selected-row">
                    <span className="ibm-category-dot" style={{ background: selectedColor }} />
                    <span className="ibm-selected-name">{selected.label}</span>
                    <button
                      className="ibm-deselect"
                      onClick={() => setSelected(null)}
                      title="Clear selection"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="ibm-selected-hint">Add details below or start consultation</p>
                </>
              ) : (
                <p className="ibm-no-selection">
                  No region selected.<br />
                  <span>Click the 3D model or search below</span>
                </p>
              )}
            </div>

            {/* Optional description */}
            <div className="ibm-details-wrap">
              <label className="ibm-details-label">
                Describe your symptoms <span>(optional)</span>
              </label>
              <textarea
                className="ibm-textarea"
                rows={2}
                placeholder={
                  selected
                    ? `e.g., sharp pain in my ${selected.label} for 2 days, worse at night…`
                    : "e.g., sharp, throbbing pain that started 2 days ago…"
                }
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>

            {/* Region search + full list */}
            <div className="ibm-quick-section">
              <div className="ibm-search-wrap">
                <input
                  ref={searchInputRef}
                  className="ibm-search-box"
                  type="text"
                  placeholder="Search region (e.g. knee, chest)…"
                  value={regionSearch}
                  onChange={(e) => setRegionSearch(e.target.value)}
                  aria-label="Search body region"
                />
                {regionSearch && (
                  <button
                    className="ibm-search-clear"
                    onClick={() => { setRegionSearch(""); searchInputRef.current?.focus(); }}
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="ibm-region-list">
                {Object.keys(groupedRegions).length === 0 && (
                  <p className="ibm-no-results">No regions match "{regionSearch}"</p>
                )}
                {Object.entries(groupedRegions).map(([cat, regions]) => (
                  <div key={cat} className="ibm-region-group">
                    <div
                      className="ibm-region-group-header"
                      style={{ color: CATEGORY_COLORS[cat] }}
                    >
                      {CATEGORY_LABELS[cat]}
                      <span className="ibm-region-count">{regions.length}</span>
                    </div>
                    <div className="ibm-region-group-btns">
                      {regions.map((region) => {
                        const catColor = CATEGORY_COLORS[region.category];
                        const isActive = selected?.label === region.label;
                        return (
                          <button
                            key={region.label}
                            className={`ibm-quick-btn${isActive ? " active" : ""}`}
                            style={isActive && catColor
                              ? { background: catColor + "22", borderColor: catColor, color: catColor }
                              : {}}
                            onClick={() => handleRegionSelect(region)}
                          >
                            {region.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Keyboard hint */}
            <p className="ibm-kb-hint">Keys 1–4 to switch views · Esc to close</p>

            {/* Action buttons */}
            <div className="ibm-actions">
              <button className="ibm-btn-cancel" onClick={onClose}>Cancel</button>
              <button
                className="ibm-btn-consult"
                onClick={handleConsult}
                disabled={!canConsult}
              >
                Start Consultation →
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
