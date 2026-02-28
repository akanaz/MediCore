import React, { useState, useMemo, useRef, useCallback, Suspense, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { BODY_REGIONS, CATEGORY_COLORS, GUIDE_DOTS, getNearestRegion, normalizeMesh } from "../utils/bodyRegions";

// ─── Quick-select labels ───
const QUICK_REGIONS = [
  { label: "Head",         emoji: "🧠" },
  { label: "Neck",         emoji: "🦴" },
  { label: "Chest",        emoji: "🫁" },
  { label: "Heart",        emoji: "❤️" },
  { label: "Stomach",      emoji: "🫃" },
  { label: "Lower Back",   emoji: "🦴" },
  { label: "Back / Spine", emoji: "🦴" },
  { label: "Arm",          emoji: "💪" },
  { label: "Knee",         emoji: "🦵" },
  { label: "Leg",          emoji: "🦵" },
  { label: "Foot",         emoji: "🦶" },
  { label: "Pelvis",       emoji: "🩻" },
];

// Camera positions: model front is at -Z (after normalizeMesh -90° X rotation)
// Camera at -Z looks toward +Z and sees the front (chest/face) of the model
const VIEW_PRESETS = {
  front: [0, 0, -3.8],  // see front: face, chest, abdomen
  back:  [0, 0,  3.8],  // see back: spine, shoulder blades
  left:  [ 3.8, 0, 0],
  right: [-3.8, 0, 0],
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
// HOVER INDICATOR — colored sphere only, NO Html label
// (label shown in the 2D side panel, not blocking the 3D model)
// ──────────────────────────────────────────────
function HoverMarker({ position, category }) {
  const color = CATEGORY_COLORS[category] || "#00d4ff";
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
// GUIDE DOTS — non-interactive visual cues showing major regions
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
// CAMERA CONTROLLER — handles view presets
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

      {/* Hover marker — colored sphere only, no floating text label */}
      {hovered && !isHoverSameAsSelected && (
        <HoverMarker
          position={hovered.pos}
          category={hovered.category}
        />
      )}

      {/* Selected region — pulsing red marker only, no floating HTML */}
      {selectedRegion && (
        <PulsingMarker position={selectedRegion.pos} />
      )}
    </group>
  );
}

// Spinning wireframe cube shown while GLB loads
function LoadingCube() {
  const ref = useRef();
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 1.2;
  });
  return (
    <mesh ref={ref}>
      <boxGeometry args={[0.18, 0.18, 0.18]} />
      <meshStandardMaterial color="#00d4ff" wireframe />
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

  const canClick = useRef(true);
  const controlsRef = useRef();

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

  const handleQuickSelect = (label) => {
    const region = BODY_REGIONS.find((r) => r.label === label);
    if (region) setSelected(region);
  };

  // Category color for selected region
  const selectedColor = selected
    ? CATEGORY_COLORS[selected.category] || "#00d4ff"
    : null;

  // Category color for hovered region
  const hoverColor = hoveredRegion
    ? CATEGORY_COLORS[hoveredRegion.category] || "#00d4ff"
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
              <pointLight position={[0, 1.5, -2.5]} intensity={0.40} color="#00d4ff" />
              <pointLight position={[0, -1, -1.5]} intensity={0.18} color="#7755ff" />

              <CameraController view={viewPreset} controlsRef={controlsRef} />

              <Suspense fallback={<LoadingCube />}>
                <GuideDots selectedLabel={selected?.label} />
                <ClickableBodyMesh
                  onSelect={setSelected}
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
              {Object.keys(VIEW_PRESETS).map((v) => (
                <button
                  key={v}
                  className={`ibm-view-btn${viewPreset === v ? " active" : ""}`}
                  onClick={() => setViewPreset(v)}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>

            <p className="ibm-canvas-hint">
              🖱 Drag to rotate · Scroll to zoom · <strong>Click to select</strong>
            </p>
          </div>

          {/* ── Side controls ── */}
          <div className="ibm-controls">

            {/* Hover status — shows what the cursor is pointing at */}
            <div className="ibm-hover-status">
              {hoveredRegion ? (
                <div className="ibm-hover-active">
                  <span
                    className="ibm-category-dot"
                    style={{ background: hoverColor }}
                  />
                  <span className="ibm-hover-region-name">{hoveredRegion.label}</span>
                </div>
              ) : (
                <span className="ibm-hover-idle">Hover over the body to preview regions</span>
              )}
            </div>

            {/* Selected region display */}
            <div
              className="ibm-selection-box"
              style={selectedColor ? { borderColor: selectedColor + "55" } : {}}
            >
              {selected ? (
                <>
                  <div className="ibm-selected-row">
                    <span
                      className="ibm-category-dot"
                      style={{ background: selectedColor }}
                    />
                    <span className="ibm-selected-name">{selected.label}</span>
                    <button
                      className="ibm-deselect"
                      onClick={() => setSelected(null)}
                      title="Clear selection"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="ibm-selected-hint">
                    Add details below or start consultation
                  </p>
                </>
              ) : (
                <p className="ibm-no-selection">
                  No region selected yet.<br />
                  <span>Click the 3D body or use quick-select below</span>
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
                rows={3}
                placeholder={
                  selected
                    ? `e.g., sharp pain in my ${selected.label} for 2 days, worse at night…`
                    : "e.g., sharp, throbbing pain that started 2 days ago…"
                }
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>

            {/* Quick-select buttons */}
            <div className="ibm-quick-section">
              <p className="ibm-quick-label">Quick-select a region:</p>
              <div className="ibm-quick-grid">
                {QUICK_REGIONS.map(({ label, emoji }) => {
                  const region = BODY_REGIONS.find((r) => r.label === label);
                  const catColor = region ? CATEGORY_COLORS[region.category] : null;
                  return (
                    <button
                      key={label}
                      className={`ibm-quick-btn${selected?.label === label ? " active" : ""}`}
                      style={selected?.label === label && catColor
                        ? { background: catColor + "22", borderColor: catColor, color: catColor }
                        : {}}
                      onClick={() => handleQuickSelect(label)}
                    >
                      <span className="ibm-quick-emoji">{emoji}</span>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action buttons */}
            <div className="ibm-actions">
              <button className="ibm-btn-cancel" onClick={onClose}>
                Cancel
              </button>
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
