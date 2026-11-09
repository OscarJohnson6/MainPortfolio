"use client";

/**
 * The default avatar: a floating robot orb with a dark face screen and
 * glowing eyes. It bobs gently, blinks, looks up and pulses its antenna while
 * thinking, and flickers its eyes while talking.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, Mesh, type Group, type MeshStandardMaterial } from "three";

import { ORB_COLORS, hexOf, type OrbLook } from "../../_lib/look";
import { blinkAmount, nextBlinkIn, type ModelProps } from "./shared";

const R = 0.42;
const CENTER_Y = 0.78;

function Glow({ color }: { color: string }) {
  return <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} toneMapped={false} />;
}

/** Meshes tagged like this are the antenna tips that pulse. */
const TIP = { tip: true };

function Eyes({ look, glow }: { look: OrbLook; glow: string }) {
  switch (look.eyes) {
    case "visor":
      return (
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.04, 0.24, 6, 16]} />
          <Glow color={glow} />
        </mesh>
      );
    case "happy":
      return (
        <group>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.11, -0.015, 0]}>
              <torusGeometry args={[0.045, 0.014, 8, 20, Math.PI]} />
              <Glow color={glow} />
            </mesh>
          ))}
        </group>
      );
    case "sleepy":
      return (
        <group>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.11, 0, 0]}>
              <boxGeometry args={[0.09, 0.022, 0.02]} />
              <Glow color={glow} />
            </mesh>
          ))}
        </group>
      );
    default:
      return (
        <group>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.11, 0, 0]} scale={[1, 1.15, 0.5]}>
              <sphereGeometry args={[0.055, 18, 14]} />
              <Glow color={glow} />
            </mesh>
          ))}
        </group>
      );
  }
}

export default function Orb({ look, mood, still }: ModelProps & { look: OrbLook }) {
  const shell = hexOf(ORB_COLORS, look.color);
  // Eyes glow in a light tint of the shell color, so every color reads as "lit".
  const glow = useMemo(() => `#${new Color(shell).lerp(new Color("#ffffff"), 0.55).getHexString()}`, [shell]);

  const body = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const blink = useRef({ next: nextBlinkIn(), started: -10 });

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const neutral = still.current;
    if (!body.current || !eyes.current) return;
    const thinking = mood === "thinking" && !neutral;

    body.current.position.y = CENTER_Y + (neutral ? 0 : Math.sin(t * 1.6) * 0.04);
    body.current.rotation.y = neutral ? 0 : Math.sin(t * 0.5) * 0.18 + (thinking ? 0.2 : 0);
    body.current.rotation.x = neutral ? 0 : thinking ? -0.15 : Math.sin(t * 0.7) * 0.04;

    if (t > blink.current.next) {
      blink.current.started = t;
      blink.current.next = t + nextBlinkIn();
    }
    const talking = mood === "talking" && !neutral;
    eyes.current.scale.y = neutral ? 1 : blinkAmount(t - blink.current.started) * (talking ? 0.75 + Math.abs(Math.sin(t * 12)) * 0.4 : 1);
    eyes.current.position.y = thinking ? 0.04 : 0.01;

    // The antenna tip pulses: slowly when idle, quickly while thinking.
    const pulse = neutral ? 1.6 : 1.2 + Math.sin(t * (thinking ? 9 : 2.2)) * 0.8;
    body.current.traverse((object) => {
      if (object instanceof Mesh && object.userData.tip) (object.material as MeshStandardMaterial).emissiveIntensity = pulse;
    });
  });

  return (
    <group ref={body} position={[0, CENTER_Y, 0]}>
      <mesh>
        <sphereGeometry args={[R, 48, 32]} />
        <meshStandardMaterial color={shell} roughness={0.32} metalness={0.25} />
      </mesh>
      {/* Face screen. */}
      <mesh position={[0, 0.02, R * 0.62]} scale={[1.15, 0.78, 0.42]}>
        <sphereGeometry args={[0.27, 36, 24]} />
        <meshStandardMaterial color="#0b1020" roughness={0.15} metalness={0.4} />
      </mesh>
      <group ref={eyes} position={[0, 0.01, R * 0.62 + 0.11]}>
        <Eyes look={look} glow={glow} />
      </group>
      {/* Side "ears". */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (R + 0.01), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.09, 0.09, 0.06, 24]} />
          <meshStandardMaterial color="#2a2f3a" roughness={0.4} metalness={0.5} />
        </mesh>
      ))}

      {look.antenna === "single" && (
        <group position={[0, R, 0]}>
          <mesh position={[0, 0.09, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.18, 8]} />
            <meshStandardMaterial color="#2a2f3a" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.2, 0]} userData={TIP}>
            <sphereGeometry args={[0.042, 16, 12]} />
            <Glow color={glow} />
          </mesh>
        </group>
      )}
      {look.antenna === "double" &&
        [-1, 1].map((side) => (
          <group key={side} position={[side * 0.13, R - 0.03, 0]} rotation={[0, 0, -side * 0.35]}>
            <mesh position={[0, 0.08, 0]}>
              <cylinderGeometry args={[0.01, 0.01, 0.16, 8]} />
              <meshStandardMaterial color="#2a2f3a" metalness={0.5} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.18, 0]} userData={TIP}>
              <sphereGeometry args={[0.034, 14, 10]} />
              <Glow color={glow} />
            </mesh>
          </group>
        ))}
      {look.antenna === "halo" && (
        <mesh position={[0, R + 0.14, 0]} rotation={[Math.PI / 2, 0, 0]} userData={TIP}>
          <torusGeometry args={[0.17, 0.016, 10, 40]} />
          <Glow color={glow} />
        </mesh>
      )}
    </group>
  );
}
