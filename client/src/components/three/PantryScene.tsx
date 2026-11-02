import { ContactShadows, Float, RoundedBox, Sparkles } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";

/**
 * The 3D pantry shelf. On the dashboard each jar is a real pantry item:
 * the fill level is how much shelf life is left, the colour is its status. Clicking opens the item.
 * On the welcome page the same scene is decorative, with floating produce.
 * Loaded lazily (three.js is large) and only when the browser supports WebGL.
 */

export interface Jar3D {
  id: string;
  label: string;
  sublabel?: string;
  /** 0..1 — how full the jar looks */
  fill: number;
  color: string;
}

interface Palette {
  glass: string;
  lid: string;
  wood: string;
  woodDark: string;
  bg: string;
  ink: string;
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const dark = document.documentElement.classList.contains("dark");
  return {
    glass: dark ? "#cfe8dc" : "#e9f3ee",
    lid: v("--bay", "#1e4d33"),
    wood: dark ? "#8a5d36" : "#c8935a",
    woodDark: dark ? "#5e3e22" : "#9b6a3d",
    bg: v("--oat", "#f6f3ea"),
    ink: v("--ink", "#1f2a24"),
  };
}

/**
 * Camera drifts gently towards the pointer — a parallax that makes the shelf feel physical —
 * and steps back on narrow screens so the whole shelf always fits.
 */
function Parallax({ strength = 0.6, still, fitWidth, baseZ }: { strength?: number; still: boolean; fitWidth: number; baseZ: number }) {
  const { camera, pointer, size, invalidate } = useThree();
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const halfFov = THREE.MathUtils.degToRad(cam.fov / 2);
    const aspect = size.width / Math.max(1, size.height);
    const z = Math.max(baseZ, fitWidth / (2 * Math.tan(halfFov) * aspect));
    if (still) {
      if (Math.abs(cam.position.z - z) > 0.01) {
        cam.position.set(0, 1.6, z);
        cam.lookAt(0, 0.6, 0);
        invalidate();
      }
      return;
    }
    cam.position.x += (pointer.x * strength - cam.position.x) * 0.05;
    cam.position.y += (1.6 + pointer.y * strength * 0.5 - cam.position.y) * 0.05;
    cam.position.z += (z - cam.position.z) * 0.1;
    cam.lookAt(0, 0.6, 0);
  });
  return null;
}

function Jar({ jar, x, palette, onSelect, still }: { jar: Jar3D; x: number; palette: Palette; onSelect?: (id: string) => void; still: boolean }) {
  const group = useRef<THREE.Group>(null);
  const contents = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const target = Math.max(0.06, Math.min(1, jar.fill));
  const level = useRef(still ? target : 0.02);

  useFrame((_, dt) => {
    // Contents "pour in" when the scene appears, then follow data changes smoothly
    level.current += (target - level.current) * Math.min(1, dt * 2.5);
    if (contents.current) {
      contents.current.scale.y = level.current;
      contents.current.position.y = -0.55 + (1.0 * level.current) / 2;
    }
    if (group.current) {
      const s = hover ? 1.08 : 1;
      group.current.scale.lerp(new THREE.Vector3(s, s, s), 0.15);
    }
  });

  return (
    <group
      ref={group}
      position={[x, 0.66, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        if (onSelect) document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        // Run after the 3D renderer finishes handling the event; navigating inside it was sometimes ignored
        if (onSelect) setTimeout(() => onSelect(jar.id), 0);
      }}
    >
      {/* contents (scaled to the fill level) */}
      <mesh ref={contents} castShadow>
        <cylinderGeometry args={[0.4, 0.4, 1.0, 40]} />
        <meshStandardMaterial color={jar.color} roughness={0.55} />
      </mesh>
      {/* glass */}
      <mesh>
        <cylinderGeometry args={[0.46, 0.46, 1.2, 48, 1, true]} />
        <meshPhysicalMaterial color={palette.glass} transparent opacity={0.28} roughness={0.05} clearcoat={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.46, 40]} />
        <meshStandardMaterial color={palette.glass} transparent opacity={0.35} />
      </mesh>
      {/* lid */}
      <mesh position={[0, 0.68, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.18, 40]} />
        <meshStandardMaterial color={hover ? jar.color : palette.lid} roughness={0.4} metalness={0.1} />
      </mesh>
      {/* label band */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.465, 0.465, 0.32, 40, 1, true, -0.9, 1.8]} />
        <meshStandardMaterial color="#fffdf6" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/**
 * Jar labels are ordinary page elements laid over the canvas. Each frame we project the point
 * under every jar to screen coordinates and move its label there, sized to the gap between jars.
 */
function LabelProjector({ xs, y, labels }: { xs: number[]; y: number; labels: RefObject<(HTMLDivElement | null)[]> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const toScreen = (x: number) => {
      v.set(x, y, 0.75).project(camera);
      return { x: (v.x * 0.5 + 0.5) * size.width, y: (-v.y * 0.5 + 0.5) * size.height };
    };
    const gap = xs.length > 1 ? Math.abs(toScreen(xs[1]).x - toScreen(xs[0]).x) : 140;
    xs.forEach((x, i) => {
      const el = labels.current?.[i];
      if (!el) return;
      const p = toScreen(x);
      el.style.width = `${Math.max(56, Math.min(150, gap - 6))}px`;
      el.style.transform = `translate(${p.x}px, ${p.y}px) translateX(-50%)`;
      el.style.opacity = "1";
    });
  });
  return null;
}

function Shelf({ width, palette }: { width: number; palette: Palette }) {
  return (
    <group>
      <RoundedBox args={[width, 0.12, 1.4]} radius={0.04} position={[0, 0, 0]} receiveShadow castShadow>
        <meshStandardMaterial color={palette.wood} roughness={0.8} />
      </RoundedBox>
      <mesh position={[-width / 2 + 0.25, -0.5, 0]} castShadow>
        <boxGeometry args={[0.12, 1, 0.12]} />
        <meshStandardMaterial color={palette.woodDark} />
      </mesh>
      <mesh position={[width / 2 - 0.25, -0.5, 0]} castShadow>
        <boxGeometry args={[0.12, 1, 0.12]} />
        <meshStandardMaterial color={palette.woodDark} />
      </mesh>
    </group>
  );
}

/** Simple low-poly produce for the welcome scene. */
function Produce({ still }: { still: boolean }) {
  const items: { pos: [number, number, number]; node: React.ReactNode; speed: number }[] = [
    {
      pos: [-3.1, 2.3, -0.6],
      speed: 1.4,
      node: (
        <group>
          <mesh castShadow>
            <sphereGeometry args={[0.32, 24, 24]} />
            <meshStandardMaterial color="#d6402b" roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.33, 0]} rotation={[0.3, 0, 0.4]}>
            <coneGeometry args={[0.1, 0.18, 6]} />
            <meshStandardMaterial color="#2f7d4f" />
          </mesh>
        </group>
      ),
    },
    {
      pos: [3.2, 2.5, -0.4],
      speed: 1.1,
      node: (
        <mesh rotation={[0, 0, -0.9]} castShadow>
          <coneGeometry args={[0.17, 0.95, 16]} />
          <meshStandardMaterial color="#ee8a2a" roughness={0.6} />
        </mesh>
      ),
    },
    {
      pos: [2.4, 3.3, -1.4],
      speed: 1.7,
      node: (
        <mesh scale={[1, 0.82, 0.82]} castShadow>
          <sphereGeometry args={[0.26, 24, 24]} />
          <meshStandardMaterial color="#f2cf3c" roughness={0.45} />
        </mesh>
      ),
    },
    {
      pos: [-2.3, 3.4, -1.2],
      speed: 1.2,
      node: (
        <mesh scale={[0.8, 1, 0.8]} castShadow>
          <sphereGeometry args={[0.24, 24, 24]} />
          <meshStandardMaterial color="#fbf4e6" roughness={0.3} />
        </mesh>
      ),
    },
    {
      pos: [0.2, 3.7, -1.8],
      speed: 1.5,
      node: (
        <mesh rotation={[0.5, 0.4, 0.2]}>
          <torusKnotGeometry args={[0.12, 0.05, 64, 8]} />
          <meshStandardMaterial color="#55b07a" roughness={0.5} />
        </mesh>
      ),
    },
  ];
  return (
    <>
      {items.map((it, i) =>
        still ? (
          <group key={i} position={it.pos}>
            {it.node}
          </group>
        ) : (
          <Float key={i} position={it.pos} speed={it.speed} rotationIntensity={0.8} floatIntensity={1.2}>
            {it.node}
          </Float>
        ),
      )}
    </>
  );
}

export default function PantryScene({
  jars,
  variant = "shelf",
  onSelect,
  reducedMotion = false,
}: {
  jars: Jar3D[];
  variant?: "shelf" | "hero";
  onSelect?: (id: string) => void;
  reducedMotion?: boolean;
}) {
  const palette = useMemo(readPalette, []);
  const spacing = 1.25;
  const width = Math.max(4, jars.length * spacing + 0.6);
  const hero = variant === "hero";
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const xs = jars.map((_, i) => (i - (jars.length - 1) / 2) * spacing);
  const groupY = hero ? -0.2 : -0.1;

  return (
    <div className="relative h-full w-full">
    <Canvas
      shadows="percentage"
      dpr={[1, 1.75]}
      frameloop={reducedMotion ? "demand" : "always"}
      camera={{ position: [0, 1.6, hero ? 7.2 : 6.2], fov: hero ? 42 : 38 }}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ camera }) => camera.lookAt(0, 0.6, 0)}
      aria-hidden
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[3, 6, 4]} intensity={1.4} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4, 3, -2]} intensity={0.35} />
      <Parallax still={reducedMotion} strength={hero ? 0.9 : 0.45} fitWidth={width + 0.8} baseZ={hero ? 7.2 : 6.2} />
      <group position={[0, groupY, 0]}>
        <Shelf width={width} palette={palette} />
        {jars.map((j, i) => (
          <Jar key={j.id} jar={j} x={xs[i]} palette={palette} onSelect={onSelect} still={reducedMotion} />
        ))}
      </group>
      {hero && <Produce still={reducedMotion} />}
      {hero && !reducedMotion && <Sparkles count={40} scale={[9, 4, 3]} position={[0, 2, -1]} size={2.5} speed={0.35} color="#d99a1e" />}
      <ContactShadows position={[0, -1.12, 0]} opacity={0.35} scale={14} blur={2.4} far={3} />
      {!hero && <LabelProjector xs={xs} y={groupY - 0.22} labels={labels} />}
    </Canvas>
    {!hero && (
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {jars.map((j, i) => (
          <div
            key={j.id}
            ref={(el) => {
              labels.current[i] = el;
            }}
            className="absolute top-0 left-0 rounded-lg px-1.5 py-0.5 text-center leading-tight opacity-0 shadow-sm transition-opacity"
            style={{ color: palette.ink, background: `color-mix(in srgb, ${palette.bg} 88%, transparent)` }}
          >
            <div className="truncate text-[12px] font-semibold sm:text-[13px]">{j.label}</div>
            {j.sublabel && <div className="truncate text-[10px] opacity-75 sm:text-[11px]">{j.sublabel}</div>}
          </div>
        ))}
      </div>
    )}
    </div>
  );
}
