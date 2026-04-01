"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { CyberFlight, useAppStore } from "@/store/useAppStore";

const T_MAP: Record<string, THREE.Vector3> = {
  "1": new THREE.Vector3(-3, 1.5, -3),
  "2": new THREE.Vector3(3, 1.5, -3),
  "3": new THREE.Vector3(0, 1.5, 3),
  "4": new THREE.Vector3(-5, 1.5, 4),
};

export function FlightParticle({ flight }: { flight: CyberFlight }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const nodeRef = useRef<THREE.Mesh>(null); // WhatsApp Node
  const [localProgress, setLocalProgress] = useState(flight.progress || 0);
  const [nodeProgress, setNodeProgress] = useState(0);

  // Generate random start point far away in the sky
  const startPos = useMemo(() => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 15 + Math.random() * 5;
    return new THREE.Vector3(
      Math.cos(angle) * radius,
      10 + Math.random() * 5,
      Math.sin(angle) * radius
    );
  }, []);

  const endPos = T_MAP[flight.terminal] || new THREE.Vector3(0, 1.5, 0);

  // Create a curved path using QuadraticBezier
  const curve = useMemo(() => {
    const midPos = startPos.clone().lerp(endPos, 0.5);
    midPos.y += 5; // arc height
    return new THREE.QuadraticBezierCurve3(startPos, midPos, endPos);
  }, [startPos, endPos]);

  useFrame((state, delta) => {
    // Move Flight Particle
    const speed = flight.status === "Delayed" ? 0.05 : 0.1; 
    let nextP = localProgress + delta * speed;
    if (nextP > 1) nextP = 0; // Loop for demo purposes
    setLocalProgress(nextP);

    if (meshRef.current) {
      const pos = curve.getPoint(nextP);
      meshRef.current.position.copy(pos);
      // Face forward
      const tangent = curve.getTangent(nextP);
      meshRef.current.lookAt(pos.clone().add(tangent));
    }

    // Move WhatsApp Node if pulsing
    if (flight.isPulsingNode && nodeRef.current && meshRef.current) {
      let np = nodeProgress + delta * 0.5;
      if (np > 1) {
        // finished sending
        useAppStore.setState(s => ({
          flights: s.flights.map(f => f.id === flight.id ? { ...f, isPulsingNode: false } : f)
        }));
        setNodeProgress(0);
      } else {
        setNodeProgress(np);
        // Node travels from flight up to the sky (comm satellite)
        const commBase = meshRef.current.position.clone();
        const commTarget = new THREE.Vector3(0, 20, 0);
        const nodeCursor = commBase.lerp(commTarget, np);
        nodeRef.current.position.copy(nodeCursor);
      }
    }
  });

  const getStatusColor = () => {
    switch (flight.status) {
      case "On Time": return "#00f3ff";
      case "Delayed": return "#ffaa00";
      case "Cancelled": return "#ff003c";
    }
  };

  const c_hex = getStatusColor();

  return (
    <group>
      {/* Path Line */}
      <mesh>
        <tubeGeometry args={[curve, 64, 0.02, 8, false]} />
        <meshBasicMaterial color={c_hex} transparent opacity={0.15} />
      </mesh>

      {/* Flight Vehicle Representation */}
      <mesh ref={meshRef}>
        <coneGeometry args={[0.2, 0.6, 4]} />
        <meshBasicMaterial color={c_hex} wireframe />
        {/* Glowing core */}
        <mesh rotation={[-Math.PI/2, 0, 0]}>
          <circleGeometry args={[0.15, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        
        {/* Status Overlay */}
        <Html position={[0, 1, 0]} center className="pointer-events-none">
          <div className="flex flex-col items-center bg-[#020b14]/90 border p-1.5 rounded" style={{ borderColor: c_hex }}>
            <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: c_hex }}>{flight.flight_number} • {flight.status}</span>
            <span className="text-[9px] text-zinc-400 font-sans">{flight.pax_name}</span>
          </div>
        </Html>
      </mesh>

      {/* Communication Node (WhatsApp Burst) */}
      {flight.isPulsingNode && (
        <mesh ref={nodeRef}>
          <sphereGeometry args={[0.15, 8, 8]} />
          <meshBasicMaterial color="#39FF14" />
          <Html position={[0.3, 0.3, 0]} center>
            <div className="bg-[#39FF14]/20 border border-[#39FF14] text-[#39FF14] text-[8px] px-1 py-0.5 rounded font-mono animate-pulse">
              MSG_SENT
            </div>
          </Html>
        </mesh>
      )}
    </group>
  );
}
