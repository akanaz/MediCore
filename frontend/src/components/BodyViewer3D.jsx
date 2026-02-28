import React, { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { getBodyRegion, normalizeMesh } from "../utils/bodyRegions";

// ──────────────────────────────────────────────
// PULSING MARKER
// ──────────────────────────────────────────────
function PulsingMarker({ position }) {
  const outerRef = useRef();

  useFrame(({ clock }) => {
    if (outerRef.current) {
      const t = clock.elapsedTime;
      const s = 1 + 0.38 * Math.sin(t * 3.8);
      outerRef.current.scale.setScalar(s);
      outerRef.current.material.opacity = 0.50 + 0.28 * Math.sin(t * 3.8);
    }
  });

  return (
    <group position={position}>
      {/* Outer pulsing halo */}
      <mesh ref={outerRef}>
        <sphereGeometry args={[0.065, 20, 20]} />
        <meshStandardMaterial
          color="#ff2222"
          emissive="#ff0000"
          emissiveIntensity={1.4}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>
      {/* Solid core */}
      <mesh>
        <sphereGeometry args={[0.030, 16, 16]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ff6644"
          emissiveIntensity={2.5}
        />
      </mesh>
      {/* Local glow light */}
      <pointLight color="#ff3333" intensity={0.9} distance={0.5} decay={2} />
    </group>
  );
}

// ──────────────────────────────────────────────
// HUMAN BODY MESH
// ──────────────────────────────────────────────
function BodyMesh({ symptom }) {
  const { scene } = useGLTF("/human.glb");
  const region = getBodyRegion(symptom);

  const normalizedScene = useMemo(() => {
    const cloned = normalizeMesh(scene);

    cloned.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color("#7aaec8"),
          roughness: 0.72,
          metalness: 0.06,
          transparent: true,
          opacity: 0.80,
        });
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });

    return cloned;
  }, [scene]);

  return (
    <group>
      <primitive object={normalizedScene} />
      <PulsingMarker position={region.pos} />
    </group>
  );
}

// Simple spinning fallback shown while GLB loads
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
// ERROR BOUNDARY
// ──────────────────────────────────────────────
class BodyViewerErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="body-viewer-error">
          <span>🔍</span>
          <p>3D body model not available.</p>
          <p>
            Place <code>human.glb</code> inside{" "}
            <code>frontend/public/</code> and refresh.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ──────────────────────────────────────────────
// PUBLIC COMPONENT
// ──────────────────────────────────────────────
export default function BodyViewer3D({ symptom }) {
  const region = getBodyRegion(symptom);

  return (
    <div className="body-viewer-3d">
      <div className="body-viewer-header">
        <span>🫀</span>
        <span>
          3D Body Map —{" "}
          <strong style={{ color: "#ff5555" }}>{region.label}</strong>
        </span>
      </div>

      <div className="body-viewer-canvas">
        <BodyViewerErrorBoundary>
          <Canvas
            camera={{ position: [0, 0, 3.6], fov: 40 }}
            gl={{ antialias: true, alpha: false }}
            shadows={false}
          >
            <color attach="background" args={["#0a0e17"]} />

            <ambientLight intensity={0.55} />
            <directionalLight position={[2, 3, 2.5]} intensity={0.85} />
            <directionalLight
              position={[-2, 1, -1]}
              intensity={0.30}
              color="#4488bb"
            />
            <pointLight
              position={[0, 1.5, 2.5]}
              intensity={0.35}
              color="#00d4ff"
            />

            <Suspense fallback={<LoadingCube />}>
              <BodyMesh symptom={symptom} />
            </Suspense>

            <OrbitControls
              enablePan={false}
              minDistance={1.8}
              maxDistance={5.5}
              enableDamping
              dampingFactor={0.08}
            />
          </Canvas>
        </BodyViewerErrorBoundary>
      </div>

      <p className="body-viewer-hint">
        🖱 Drag to rotate · Scroll to zoom
      </p>
    </div>
  );
}
