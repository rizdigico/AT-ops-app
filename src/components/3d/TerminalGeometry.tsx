"use client";

import { Html } from "@react-three/drei";
import * as THREE from "three";

const TerminalBlock = ({
  position,
  args,
  label,
}: {
  position: [number, number, number];
  args: [number, number, number];
  label: string;
}) => {
  return (
    <group position={position}>
      {/* Box */}
      <mesh>
        <boxGeometry args={args} />
        <meshBasicMaterial color="#001833" transparent opacity={0.6} depthWrite={false} />
      </mesh>
      {/* Wireframe edges for cyber aesthetic */}
      <mesh>
        <boxGeometry args={args} />
        <meshBasicMaterial color="#00f3ff" wireframe opacity={0.3} transparent />
      </mesh>
      
      {/* Label Overlay */}
      <Html
        position={[0, args[1] / 2 + 0.5, 0]}
        center
        className="pointer-events-none"
        style={{ color: "#00f3ff", fontFamily: "monospace", textShadow: "0px 0px 5px #00f3ff", fontWeight: "bold" }}
      >
        <div className="bg-[#020b14]/80 px-2 py-0.5 border border-[#00f3ff]/50 rounded text-xs select-none">
          {label}
        </div>
      </Html>
    </group>
  );
};

export function TerminalGeometry() {
  // Rough spatial map of terminals (mock positions)
  return (
    <group position={[0, 0.5, 0]}>
      {/* Central Terminal / Control Hub */}
      <TerminalBlock position={[-3, 0, -3]} args={[4, 1, 4]} label="Terminal 1" />
      <TerminalBlock position={[3, 0, -3]} args={[4, 1, 4]} label="Terminal 2" />
      <TerminalBlock position={[0, 0, 3]} args={[6, 1, 3]} label="Terminal 3" />
      <TerminalBlock position={[-5, 0, 4]} args={[3, 1, 2]} label="Terminal 4" />
      
      {/* Connecting runways/paths */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.49, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshBasicMaterial color="#020b14" />
      </mesh>

      {/* Decorative circles representing radar bounds */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.48, 0]}>
        <ringGeometry args={[14.8, 15, 64]} />
        <meshBasicMaterial color="#00f3ff" transparent opacity={0.15} />
      </mesh>
    </group>
  );
}
