"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { TerminalGeometry } from "./TerminalGeometry";
import { FlightParticle } from "./FlightParticle";
import { useAppStore } from "@/store/useAppStore";

export function CyberMap() {
  const flights = useAppStore((state) => state.flights);

  return (
    <div className="absolute inset-0 w-full h-full bg-[#020b14] z-0">
      <Canvas camera={{ position: [0, 15, 20], fov: 45 }}>
        <color attach="background" args={["#020b14"]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[10, 20, 10]} intensity={1.5} color="#00f3ff" />
        
        {/* Schematic Grid */}
        <Grid
          infiniteGrid
          fadeDistance={50}
          sectionColor="#004a7c"
          cellColor="#001833"
          sectionSize={3}
          cellSize={1}
          position={[0, -0.01, 0]}
        />

        {/* The Base Cartography Mesh */}
        <TerminalGeometry />

        {/* Dynamic Data Entities */}
        {flights.map((flight) => (
          <FlightParticle key={flight.id} flight={flight} />
        ))}
        
        {/* Control Limits */}
        <OrbitControls
          enablePan={true}
          enableRotate={true}
          enableZoom={true}
          autoRotate={true}
          autoRotateSpeed={0.3}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={5}
          maxDistance={40}
        />
      </Canvas>
    </div>
  );
}
