"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, type ComponentRef, type RefObject } from "react";

import type { Look } from "../../_lib/look";
import Human from "./Human";
import Orb from "./Orb";
import type { Mood } from "./shared";

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;

/** Takes a snapshot of the avatar for its icon (a square PNG data URL). */
export type CaptureFn = () => Promise<string>;

type Props = {
  look: Look;
  mood?: Mood;
  /** Lets the viewer drag to turn the avatar (the editor preview). */
  interactive?: boolean;
  captureRef?: RefObject<CaptureFn | null>;
  className?: string;
};

// Framing: both models span roughly y = 0.1 (chest) to 1.4 (top of the head),
// so the camera looks at the middle of that from far enough back to fit it.
// Change these two to reframe; snapshots and the drag controls use them too.
const CAMERA_POSITION: [number, number, number] = [0, 0.9, 2.5];
const TARGET: [number, number, number] = [0, 0.78, 0];
const ICON_SIZE = 160;

/** Point the camera at TARGET from CAMERA_POSITION, undoing any dragging. */
function aimCamera(camera: { position: { set: (x: number, y: number, z: number) => void }; lookAt: (x: number, y: number, z: number) => void }, controls: OrbitControlsImpl | null) {
  camera.position.set(...CAMERA_POSITION);
  if (controls) {
    // Not controls.reset(): that restores the state saved when the controls were
    // created, which still looked at (0, 0, 0) and tipped the view toward the floor.
    controls.target.set(...TARGET);
    controls.update();
  } else {
    camera.lookAt(...TARGET);
  }
}

/** Without drag controls, keep the camera aimed (also after the canvas resizes). */
function CameraAim() {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  useLayoutEffect(() => aimCamera(camera, null), [camera, size]);
  return null;
}

const nextFrames = (count: number) =>
  new Promise<void>((resolve) => {
    const step = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
    step(count);
  });

function Capturer({ captureRef, still, controls }: { captureRef: RefObject<CaptureFn | null>; still: RefObject<boolean>; controls: RefObject<OrbitControlsImpl | null> }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    captureRef.current = async () => {
      // Face the camera, hold a neutral pose (eyes open, mouth closed), let it render.
      aimCamera(camera, controls.current);
      still.current = true;
      await nextFrames(3);

      const source = gl.domElement;
      const side = Math.min(source.width, source.height);
      const out = document.createElement("canvas");
      out.width = out.height = ICON_SIZE;
      out
        .getContext("2d")
        ?.drawImage(source, (source.width - side) / 2, (source.height - side) / 2, side, side, 0, 0, ICON_SIZE, ICON_SIZE);
      still.current = false;
      return out.toDataURL("image/png");
    };
    return () => {
      captureRef.current = null;
    };
  }, [camera, captureRef, controls, gl, still]);

  return null;
}

export default function AvatarStage({ look, mood = "idle", interactive = false, captureRef, className = "" }: Props) {
  const still = useRef(false);
  const controls = useRef<OrbitControlsImpl | null>(null);

  if (look.kind === "none") return null;

  return (
    <div className={className}>
      <Canvas
        camera={{ position: CAMERA_POSITION, fov: 30 }}
        dpr={[1, 2]}
        // Needed to read pixels back for the icon snapshot.
        gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.75} />
        <directionalLight position={[2, 3, 4]} intensity={1.5} />
        <directionalLight position={[-3, 1.5, -2]} intensity={0.7} color="#a5b4fc" />
        {look.kind === "orb" ? <Orb look={look} mood={mood} still={still} /> : <Human look={look} mood={mood} still={still} />}
        {!interactive && <CameraAim />}
        {interactive && (
          <OrbitControls
            ref={controls}
            target={TARGET}
            enablePan={false}
            enableZoom={false}
            minPolarAngle={Math.PI * 0.32}
            maxPolarAngle={Math.PI * 0.6}
            minAzimuthAngle={-Math.PI * 0.45}
            maxAzimuthAngle={Math.PI * 0.45}
          />
        )}
        {captureRef && <Capturer captureRef={captureRef} still={still} controls={controls} />}
      </Canvas>
    </div>
  );
}
