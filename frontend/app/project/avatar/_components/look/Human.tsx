"use client";

/**
 * A torso-up character built entirely from three.js primitives (spheres,
 * capsules, tori, boxes). Every preset in _lib/look.ts maps to a small piece
 * of geometry here, so new hair styles or outfits are just new branches.
 *
 * Coordinates: y is up, the face points toward +z, and the camera frames
 * roughly y = 0.1 (mid-chest) to y = 1.35 (top of the head).
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, DoubleSide, type Group } from "three";

import {
  BODIES,
  CLOTHING_COLORS,
  EYE_COLORS,
  HAIR_COLORS,
  SKIN_TONES,
  hexOf,
  type HumanLook,
} from "../../_lib/look";
import { FRONT_PHI, blinkAmount, nextBlinkIn, type ModelProps } from "./shared";

const HEAD_R = 0.26;

function Mat({ color, rough = 0.7, metal = 0, side }: { color: string; rough?: number; metal?: number; side?: typeof DoubleSide }) {
  return <meshStandardMaterial color={color} roughness={rough} metalness={metal} side={side} />;
}

/** Hair cap: the top of a sphere, tilted back so the hairline sits high at the front and low at the back. */
function Cap({ color, scale = 1.06, cover = 1.3, tilt = -0.45 }: { color: string; scale?: number; cover?: number; tilt?: number }) {
  return (
    <mesh rotation={[tilt, 0, 0]}>
      <sphereGeometry args={[HEAD_R * scale, 40, 20, 0, Math.PI * 2, 0, cover]} />
      <Mat color={color} rough={0.85} side={DoubleSide} />
    </mesh>
  );
}

/** A shell around the sides and back of the head, open at the face (for bobs and long hair). */
function SideShell({ color, top = 0.8, depth = 1.25 }: { color: string; top?: number; depth?: number }) {
  const gap = Math.PI * 0.62; // width of the opening around the face
  return (
    <mesh rotation={[-0.2, 0, 0]}>
      <sphereGeometry args={[HEAD_R * 1.12, 40, 20, FRONT_PHI + gap / 2, Math.PI * 2 - gap, top, depth]} />
      <Mat color={color} rough={0.85} side={DoubleSide} />
    </mesh>
  );
}

function Hair({ look, color }: { look: HumanLook; color: string }) {
  switch (look.hair) {
    case "bald":
      return null;
    case "buzz":
      return <Cap color={color} scale={1.02} cover={1.22} tilt={-0.5} />;
    case "spiky":
      return (
        <group>
          <Cap color={color} />
          {[-0.12, -0.04, 0.04, 0.12, -0.08, 0, 0.08].map((x, i) => (
            <mesh key={i} position={[x, 0.27 - Math.abs(x) * 0.4, i < 4 ? 0.04 : -0.07]} rotation={[i < 4 ? 0.3 : -0.2, 0, -x * 2]}>
              <coneGeometry args={[0.05, 0.14, 8]} />
              <Mat color={color} rough={0.85} />
            </mesh>
          ))}
        </group>
      );
    case "bob":
      return (
        <group>
          <Cap color={color} />
          <SideShell color={color} />
        </group>
      );
    case "long":
      return (
        <group>
          <Cap color={color} />
          <SideShell color={color} depth={1.45} />
          <mesh position={[0, -0.32, -0.14]} scale={[1, 1, 0.45]}>
            <capsuleGeometry args={[0.2, 0.32, 8, 20]} />
            <Mat color={color} rough={0.85} />
          </mesh>
        </group>
      );
    case "ponytail":
      return (
        <group>
          <Cap color={color} />
          <mesh position={[0, 0.06, -0.27]}>
            <sphereGeometry args={[0.07, 16, 12]} />
            <Mat color={color} rough={0.85} />
          </mesh>
          <mesh position={[0, -0.13, -0.31]} rotation={[0.25, 0, 0]}>
            <capsuleGeometry args={[0.055, 0.26, 6, 12]} />
            <Mat color={color} rough={0.85} />
          </mesh>
        </group>
      );
    case "bun":
      return (
        <group>
          <Cap color={color} />
          <mesh position={[0, 0.25, -0.12]}>
            <sphereGeometry args={[0.1, 20, 14]} />
            <Mat color={color} rough={0.85} />
          </mesh>
        </group>
      );
    case "curly":
      return <CurlyHair color={color} />;
    case "mohawk":
      return (
        <group>
          <Cap color={color} scale={1.015} cover={1.2} tilt={-0.5} />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const angle = -0.5 + i * 0.36; // from the forehead over the top to the back
            return (
              <mesh key={i} position={[0, Math.cos(angle) * 0.29, Math.sin(-angle) * 0.29]} rotation={[-angle, 0, 0]}>
                <boxGeometry args={[0.05, 0.12, 0.08]} />
                <Mat color={color} rough={0.85} />
              </mesh>
            );
          })}
        </group>
      );
    default:
      return <Cap color={color} />;
  }
}

function CurlyHair({ color }: { color: string }) {
  // Little spheres scattered over the cap, like curls.
  const curls = useMemo(() => {
    const points: [number, number, number][] = [];
    for (let ring = 0; ring < 5; ring += 1) {
      const theta = 0.15 + ring * 0.27;
      const count = ring === 0 ? 3 : 7 + ring * 2;
      for (let k = 0; k < count; k += 1) {
        const phi = (k / count) * Math.PI * 2 + ring;
        const r = HEAD_R * 1.03;
        points.push([Math.sin(theta) * Math.cos(phi) * r, Math.cos(theta) * r, Math.sin(theta) * Math.sin(phi) * r]);
      }
    }
    return points;
  }, []);
  return (
    <group rotation={[-0.45, 0, 0]}>
      <Cap color={color} scale={1.0} cover={1.3} tilt={0} />
      {curls.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.065, 10, 8]} />
          <Mat color={color} rough={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Eye({ x, look, iris, skin }: { x: number; look: HumanLook; iris: string; skin: string }) {
  if (look.eyes === "happy") {
    // A closed, upturned arc, like a smiling eye.
    return (
      <mesh position={[x, 0.01, 0.235]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.032, 0.008, 6, 16, Math.PI]} />
        <Mat color="#2a1d17" />
      </mesh>
    );
  }
  const size = look.eyes === "wide" ? 1.2 : look.eyes === "focused" ? 0.85 : 1;
  return (
    <group position={[x, 0, 0.215]} scale={size}>
      <mesh scale={[1, 1, 0.5]}>
        <sphereGeometry args={[0.046, 20, 14]} />
        <Mat color="#fbfbfb" rough={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.018]} scale={[1, 1, 0.5]}>
        <sphereGeometry args={[0.028, 16, 12]} />
        <Mat color={iris} rough={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.026]} scale={[1, 1, 0.5]}>
        <sphereGeometry args={[0.014, 12, 10]} />
        <Mat color="#0b0b0b" rough={0.2} />
      </mesh>
      <mesh position={[0.012, 0.012, 0.03]}>
        <sphereGeometry args={[0.006, 8, 6]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {look.eyes === "sleepy" && (
        // Heavy upper lid: the top half of a skin-colored sphere.
        <mesh position={[0, 0.004, 0.004]} rotation={[0.25, 0, 0]}>
          <sphereGeometry args={[0.05, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <Mat color={skin} />
        </mesh>
      )}
    </group>
  );
}

function Brows({ look, color }: { look: HumanLook; color: string }) {
  if (look.brows === "none") return null;
  const thick = look.brows === "thick";
  const lift = look.brows === "raised" ? 0.02 : 0;
  const tilt = look.brows === "soft" ? 0.12 : look.brows === "raised" ? -0.18 : look.eyes === "focused" ? -0.12 : 0;
  return (
    <group position={[0, 0.095 + lift, 0.238]}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.085, 0, 0]} rotation={[0, 0, side * tilt]}>
          <boxGeometry args={[thick ? 0.085 : 0.07, thick ? 0.024 : 0.013, 0.02]} />
          <Mat color={color} rough={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Mouth({ look }: { look: HumanLook }) {
  const lip = "#8a3b3b";
  switch (look.mouth) {
    case "grin":
      return (
        <group>
          <mesh rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[0.062, 0.011, 8, 24, Math.PI]} />
            <Mat color={lip} />
          </mesh>
          <mesh position={[0, -0.022, -0.004]} scale={[1, 0.45, 0.3]}>
            <sphereGeometry args={[0.05, 16, 10]} />
            <Mat color="#fafafa" rough={0.4} />
          </mesh>
        </group>
      );
    case "neutral":
      return (
        <mesh>
          <boxGeometry args={[0.075, 0.012, 0.012]} />
          <Mat color={lip} />
        </mesh>
      );
    case "smirk":
      return (
        <mesh position={[0.015, 0, 0]} rotation={[0, 0, Math.PI + 0.35]}>
          <torusGeometry args={[0.045, 0.009, 8, 20, Math.PI * 0.6]} />
          <Mat color={lip} />
        </mesh>
      );
    case "open":
      return (
        <mesh scale={[1, 1.25, 0.4]}>
          <sphereGeometry args={[0.03, 16, 12]} />
          <Mat color="#4a1c1c" />
        </mesh>
      );
    default:
      return (
        <mesh rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.05, 0.009, 8, 24, Math.PI]} />
          <Mat color={lip} />
        </mesh>
      );
  }
}

function Accessory({ look, color }: { look: HumanLook; color: string }) {
  switch (look.accessory) {
    case "glasses":
    case "roundglasses": {
      const round = look.accessory === "roundglasses";
      const frame = round ? "#b08a3a" : "#1d1d22";
      return (
        <group position={[0, 0, 0.255]}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.088, 0, 0]} scale={round ? [1, 1, 1] : [1.15, 0.85, 1]}>
              <torusGeometry args={[round ? 0.056 : 0.052, round ? 0.006 : 0.009, 8, 28]} />
              <Mat color={frame} rough={0.4} metal={round ? 0.6 : 0} />
            </mesh>
          ))}
          <mesh position={[0, 0.01, 0]}>
            <boxGeometry args={[0.05, 0.008, 0.008]} />
            <Mat color={frame} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.15, 0.01, -0.12]} rotation={[0, side * 0.12, 0]}>
              <boxGeometry args={[0.008, 0.008, 0.24]} />
              <Mat color={frame} />
            </mesh>
          ))}
        </group>
      );
    }
    case "cap":
      return (
        <group>
          <mesh rotation={[-0.2, 0, 0]}>
            <sphereGeometry args={[HEAD_R * 1.1, 40, 20, 0, Math.PI * 2, 0, 1.3]} />
            <Mat color={color} rough={0.8} side={DoubleSide} />
          </mesh>
          <mesh position={[0, 0.115, 0.2]} rotation={[0.25, 0, 0]} scale={[1, 1, 0.75]}>
            <cylinderGeometry args={[0.17, 0.17, 0.018, 32, 1, false, -Math.PI / 2, Math.PI]} />
            <Mat color={color} rough={0.8} />
          </mesh>
        </group>
      );
    case "beanie":
      return (
        <group>
          <mesh rotation={[-0.15, 0, 0]}>
            <sphereGeometry args={[HEAD_R * 1.12, 40, 20, 0, Math.PI * 2, 0, 1.35]} />
            <Mat color={color} rough={0.95} side={DoubleSide} />
          </mesh>
          <mesh position={[0, 0.07, -0.01]} rotation={[Math.PI / 2 - 0.15, 0, 0]}>
            <torusGeometry args={[HEAD_R * 1.07, 0.035, 10, 40]} />
            <Mat color={color} rough={0.95} />
          </mesh>
          <mesh position={[0, 0.31, -0.04]}>
            <sphereGeometry args={[0.055, 14, 10]} />
            <Mat color={color} rough={1} />
          </mesh>
        </group>
      );
    case "headphones":
      return (
        <group>
          <mesh>
            <torusGeometry args={[HEAD_R * 1.14, 0.02, 8, 40, Math.PI]} />
            <Mat color="#26262c" rough={0.4} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.29, -0.01, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.075, 0.075, 0.06, 24]} />
              <Mat color="#26262c" rough={0.4} />
            </mesh>
          ))}
        </group>
      );
    default:
      return null;
  }
}

function Top({ look, color, skin, shoulders }: { look: HumanLook; color: string; skin: string; shoulders: number }) {
  const darker = useMemo(() => `#${new Color(color).multiplyScalar(0.72).getHexString()}`, [color]);
  const shortSleeves = look.top === "tee";
  return (
    <group>
      {/* Arms hang from the shoulders; t-shirts show skin below short sleeves. */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.43 * shoulders, 0, 0]} rotation={[0, 0, side * 0.1]}>
          <mesh position={[0, 0.3, 0]}>
            <capsuleGeometry args={[0.105, shortSleeves ? 0.1 : 0.42, 8, 16]} />
            <Mat color={shortSleeves ? skin : look.top === "jacket" ? darker : color} />
          </mesh>
          {shortSleeves && (
            <mesh position={[0, 0.49, 0]}>
              <capsuleGeometry args={[0.118, 0.12, 8, 16]} />
              <Mat color={color} />
            </mesh>
          )}
          {shortSleeves && (
            <mesh position={[0, 0.2, 0]}>
              <capsuleGeometry args={[0.095, 0.2, 8, 16]} />
              <Mat color={skin} />
            </mesh>
          )}
        </group>
      ))}

      {look.top === "hoodie" && (
        <group>
          <mesh position={[0, 0.66, -0.07]} rotation={[Math.PI / 2 + 0.25, 0, 0]}>
            <torusGeometry args={[0.17, 0.075, 12, 32]} />
            <Mat color={color} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.055, 0.5, 0.25]}>
              <cylinderGeometry args={[0.007, 0.007, 0.16, 6]} />
              <Mat color="#f2f2f2" />
            </mesh>
          ))}
        </group>
      )}

      {look.top === "turtleneck" && (
        <mesh position={[0, 0.69, 0]}>
          <cylinderGeometry args={[0.11, 0.12, 0.13, 24]} />
          <Mat color={color} />
        </mesh>
      )}

      {look.top === "collar" && (
        <group>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.065, 0.63, 0.12]} rotation={[0.5, side * 0.4, side * 0.6]}>
              <boxGeometry args={[0.1, 0.015, 0.07]} />
              <Mat color="#f4f4f4" />
            </mesh>
          ))}
          {[0.52, 0.42, 0.32].map((y) => (
            <mesh key={y} position={[0, y, 0.255]}>
              <sphereGeometry args={[0.012, 8, 6]} />
              <Mat color="#d8d8d8" />
            </mesh>
          ))}
        </group>
      )}

      {look.top === "jacket" && (
        <group>
          <mesh position={[0, 0.42, 0.235]} scale={[1, 1, 0.3]}>
            <boxGeometry args={[0.1, 0.42, 0.05]} />
            <Mat color="#ededed" />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.08, 0.5, 0.235]} rotation={[0, 0, side * -0.35]}>
              <boxGeometry args={[0.05, 0.25, 0.03]} />
              <Mat color={darker} />
            </mesh>
          ))}
        </group>
      )}

      {look.top === "tee" && (
        <mesh position={[0, 0.635, 0.02]} rotation={[Math.PI / 2 - 0.1, 0, 0]}>
          <torusGeometry args={[0.11, 0.016, 8, 28]} />
          <Mat color={darker} />
        </mesh>
      )}
    </group>
  );
}

export default function Human({ look, mood, still }: ModelProps & { look: HumanLook }) {
  const body = BODIES.find((b) => b.id === look.body) ?? BODIES[0];
  const skin = hexOf(SKIN_TONES, look.skin);
  const hair = hexOf(HAIR_COLORS, look.hairColor);
  const iris = hexOf(EYE_COLORS, look.eyeColor);
  const clothes = hexOf(CLOTHING_COLORS, look.topColor);
  const topColor = look.top === "jacket" ? `#${new Color(clothes).multiplyScalar(0.85).getHexString()}` : clothes;

  const root = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const head = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const mouth = useRef<Group>(null);
  const blink = useRef({ next: nextBlinkIn(), started: -10 });

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const neutral = still.current;
    if (!root.current || !torso.current || !head.current || !eyes.current || !mouth.current) return;

    // Breathing: the chest rises a little; the head sways slowly.
    const breath = neutral ? 0 : Math.sin(t * 1.4) * 0.012;
    torso.current.scale.y = 1 + breath;
    torso.current.position.y = breath * 0.5;

    const thinking = mood === "thinking" && !neutral;
    const lookUp = thinking ? -0.16 : 0;
    const turn = neutral ? 0 : thinking ? 0.18 : Math.sin(t * 0.45) * 0.06;
    // Ease toward the target pose; snapshots jump straight to neutral.
    const ease = neutral ? 1 : 0.08;
    head.current.rotation.x += (lookUp - head.current.rotation.x) * ease;
    head.current.rotation.y += (turn - head.current.rotation.y) * ease;
    head.current.rotation.z = neutral ? 0 : thinking ? 0.08 : Math.sin(t * 0.6) * 0.02;

    // Blinking.
    if (t > blink.current.next) {
      blink.current.started = t;
      blink.current.next = t + nextBlinkIn();
    }
    eyes.current.scale.y = neutral ? 1 : blinkAmount(t - blink.current.started);
    eyes.current.position.y = thinking ? 0.006 : 0;

    // Talking: the mouth opens and closes in an uneven rhythm.
    const talk = mood === "talking" && !neutral ? 0.35 + Math.abs(Math.sin(t * 13) * Math.sin(t * 5.3)) * 1.1 : 1;
    mouth.current.scale.y = mood === "talking" && !neutral ? talk : 1;
  });

  const neckLength = 0.2 * body.neck;
  const headY = 0.72 + neckLength * 0.9 + HEAD_R * 0.8;

  return (
    <group ref={root}>
      <group ref={torso}>
        {/* Chest and shoulders. */}
        <mesh position={[0, 0.28, 0]} scale={[1.18 * body.shoulders, 1, 0.72 * body.torso]}>
          <capsuleGeometry args={[0.3 * body.torso, 0.42, 10, 24]} />
          <Mat color={topColor} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.36 * body.shoulders, 0.57, 0]}>
            <sphereGeometry args={[0.16, 20, 14]} />
            <Mat color={topColor} />
          </mesh>
        ))}
        <Top look={look} color={clothes} skin={skin} shoulders={body.shoulders} />
        <mesh position={[0, 0.72 + neckLength / 2, 0]}>
          <cylinderGeometry args={[0.085, 0.095, neckLength + 0.06, 16]} />
          <Mat color={skin} />
        </mesh>
      </group>

      <group ref={head} position={[0, headY, 0]} scale={body.head}>
        <mesh scale={[0.95, 1.06, 0.95]}>
          <sphereGeometry args={[HEAD_R, 40, 28]} />
          <Mat color={skin} rough={0.6} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.245, -0.005, 0]} scale={[0.55, 1, 0.8]}>
            <sphereGeometry args={[0.055, 14, 10]} />
            <Mat color={skin} rough={0.6} />
          </mesh>
        ))}
        <mesh position={[0, -0.035, 0.245]}>
          <sphereGeometry args={[0.034, 14, 10]} />
          <Mat color={skin} rough={0.6} />
        </mesh>

        <group ref={eyes} position={[0, 0.03, 0]}>
          <Eye x={-0.085} look={look} iris={iris} skin={skin} />
          <Eye x={0.085} look={look} iris={iris} skin={skin} />
        </group>
        <Brows look={look} color={look.hair === "bald" ? `#${new Color(skin).multiplyScalar(0.55).getHexString()}` : hair} />
        <group ref={mouth} position={[0, -0.115, 0.232]}>
          <Mouth look={look} />
        </group>

        <Hair look={look} color={hair} />
        <Accessory look={look} color={clothes} />
      </group>
    </group>
  );
}
