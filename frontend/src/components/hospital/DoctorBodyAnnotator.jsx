import React, { useState, useRef, useCallback, useEffect, useMemo, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { CATEGORY_COLORS, getNearestRegion, normalizeMesh } from "../../utils/bodyRegions";

const VIEW_PRESETS = {
  front: [0, 0, -3.8],
  back:  [0, 0,  3.8],
  left:  [ 3.8, 0, 0],
  right: [-3.8, 0, 0],
};
const VIEW_KEYS = ["front", "back", "left", "right"];

// ── Camera controller ──
function CameraController({ view, controlsRef }) {
  const { camera } = useThree();
  const prev = useRef(null);
  useEffect(() => {
    if (view === prev.current) return;
    prev.current = view;
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

// ── Pulsing marker (one per annotation, different colors) ──
function AnnotationMarker({ position, color }) {
  const outerRef = useRef();
  useFrame(({ clock }) => {
    if (outerRef.current) {
      const s = 1 + 0.35 * Math.sin(clock.elapsedTime * 3.5);
      outerRef.current.scale.setScalar(s);
      outerRef.current.material.opacity = 0.4 + 0.3 * Math.sin(clock.elapsedTime * 3.5);
    }
  });
  return (
    <group position={position}>
      <mesh ref={outerRef}>
        <sphereGeometry args={[0.07, 18, 18]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} transparent opacity={0.45} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.028, 14, 14]} />
        <meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={2.5} />
      </mesh>
      <pointLight color={color} intensity={0.8} distance={0.5} decay={2} />
    </group>
  );
}

// ── Pending (unconfirmed) marker — blinking yellow ──
function PendingMarker({ position }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (ref.current) ref.current.material.opacity = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 6);
  });
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.055, 14, 14]} />
      <meshStandardMaterial color="#ffcc44" emissive="#ffaa00" emissiveIntensity={2} transparent opacity={0.8} depthWrite={false} />
    </mesh>
  );
}

// ── Clickable body mesh ──
function AnnotatorMesh({ onSelect, canClick }) {
  const { scene } = useGLTF("/human.glb");
  const normalizedScene = useMemo(() => {
    const cloned = normalizeMesh(scene);
    cloned.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color("#6fa8c8"),
          roughness: 0.65, metalness: 0.04, transparent: true, opacity: 0.90,
        });
      }
    });
    return cloned;
  }, [scene]);

  const handleClick = useCallback((e) => {
    e.stopPropagation();
    if (!canClick.current) return;
    const region = getNearestRegion(e.point);
    onSelect(region);
  }, [canClick, onSelect]);

  return (
    <primitive
      object={normalizedScene}
      onPointerMove={(e) => { if (e.buttons > 0) canClick.current = false; }}
      onPointerDown={() => { canClick.current = true; }}
      onClick={handleClick}
    />
  );
}

useGLTF.preload("/human.glb");

// ── Spinning cube while GLB loads ──
function SpinCube() {
  const ref = useRef();
  useFrame((_, d) => { if (ref.current) ref.current.rotation.y += d * 1.2; });
  return (
    <mesh ref={ref}>
      <boxGeometry args={[0.18, 0.18, 0.18]} />
      <meshStandardMaterial color="#58a6ff" wireframe />
    </mesh>
  );
}

// ══════════════════════════════════════════════
// Main export
// ══════════════════════════════════════════════
export default function DoctorBodyAnnotator({ annotations, onChange }) {
  const [view, setView] = useState("front");
  const [pendingRegion, setPendingRegion] = useState(null);
  const [pendingText, setPendingText] = useState("");
  const canClick = useRef(true);
  const controlsRef = useRef();

  const handleModelClick = (region) => {
    if (!region) return;
    setPendingRegion(region);
    setPendingText("");
  };

  const handleAddAnnotation = () => {
    if (!pendingRegion) return;
    const annotation = {
      region_label: pendingRegion.label,
      region_pos: pendingRegion.pos,
      region_category: pendingRegion.category,
      description: pendingText.trim(),
    };
    onChange([...annotations, annotation]);
    setPendingRegion(null);
    setPendingText("");
  };

  const handleRemove = (idx) => {
    onChange(annotations.filter((_, i) => i !== idx));
  };

  return (
    <div>
      {/* 3D Canvas */}
      <div
        className="hosp-annotator-wrap"
        onPointerDown={() => { canClick.current = true; }}
        onPointerMove={(e) => { if (e.buttons > 0) canClick.current = false; }}
      >
        <Canvas camera={{ position: VIEW_PRESETS.front, fov: 38 }} gl={{ antialias: true, alpha: false }}>
          <color attach="background" args={["#070c14"]} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[2, 4, -3]} intensity={0.9} />
          <directionalLight position={[-2, 1, 1]} intensity={0.28} color="#4488bb" />
          <pointLight position={[0, 1.5, -2.5]} intensity={0.4} color="#58a6ff" />

          <CameraController view={view} controlsRef={controlsRef} />

          <Suspense fallback={<SpinCube />}>
            <AnnotatorMesh onSelect={handleModelClick} canClick={canClick} />
            {annotations.map((a, i) => (
              <AnnotationMarker key={i} position={a.region_pos} color={CATEGORY_COLORS[a.region_category] || "#58a6ff"} />
            ))}
            {pendingRegion && <PendingMarker position={pendingRegion.pos} />}
          </Suspense>

          <OrbitControls ref={controlsRef} enablePan={false} minDistance={1.8} maxDistance={6.0} enableDamping dampingFactor={0.08} />
        </Canvas>

        {/* View buttons */}
        <div className="hosp-annotator-view-btns">
          {VIEW_KEYS.map((v) => (
            <button
              key={v}
              className={`hosp-annotator-view-btn${view === v ? " active" : ""}`}
              onClick={() => setView(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Pending region input */}
      {pendingRegion && (
        <div className="hosp-pending-row">
          <span className="hosp-pending-label">📍 {pendingRegion.label}</span>
          <input
            className="hosp-pending-input"
            placeholder="Describe finding for this region…"
            value={pendingText}
            onChange={e => setPendingText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAddAnnotation(); if (e.key === "Escape") { setPendingRegion(null); } }}
            autoFocus
          />
          <button className="hosp-btn hosp-btn-primary hosp-btn-sm" onClick={handleAddAnnotation}>Add</button>
          <button className="hosp-btn hosp-btn-sm" onClick={() => setPendingRegion(null)}>✕</button>
        </div>
      )}

      {!pendingRegion && (
        <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 6, textAlign: "center" }}>
          Click the 3D model to annotate a region
        </p>
      )}

      {/* Annotation list */}
      {annotations.length > 0 && (
        <div className="hosp-annotation-list" style={{ marginTop: 10 }}>
          {annotations.map((a, i) => (
            <div key={i} className="hosp-annotation-item">
              <div className="hosp-annotation-dot" style={{ background: CATEGORY_COLORS[a.region_category] || "#58a6ff" }} />
              <div className="hosp-annotation-text">
                <div className="hosp-annotation-label">{a.region_label}</div>
                {a.description && <div className="hosp-annotation-desc">{a.description}</div>}
              </div>
              <button className="hosp-annotation-remove" onClick={() => handleRemove(i)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
