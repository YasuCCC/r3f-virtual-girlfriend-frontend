import { Grid, Stars } from "@react-three/drei";

const ROOM_SIZE = 30;
const WALL_HEIGHT = 4;

type ExhibitProps = {
  position: [number, number, number];
  color: string;
  shape: "torusKnot" | "icosahedron" | "octahedron";
};

const Exhibit = ({ position, color, shape }: ExhibitProps) => (
  <group position={position}>
    {/* 台座 */}
    <mesh position={[0, 0.5, 0]}>
      <cylinderGeometry args={[0.5, 0.6, 1, 32]} />
      <meshStandardMaterial color="#2a2d3e" roughness={0.4} />
    </mesh>
    {/* 展示オブジェクト */}
    <mesh position={[0, 1.5, 0]}>
      {shape === "torusKnot" && <torusKnotGeometry args={[0.28, 0.09, 128, 16]} />}
      {shape === "icosahedron" && <icosahedronGeometry args={[0.35, 0]} />}
      {shape === "octahedron" && <octahedronGeometry args={[0.38, 0]} />}
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.35}
        roughness={0.25}
        metalness={0.6}
      />
    </mesh>
    <pointLight position={[0, 2.2, 0]} color={color} intensity={4} distance={6} />
  </group>
);

export const GalleryRoom = () => {
  const half = ROOM_SIZE / 2;
  return (
    <>
      <color attach="background" args={["#0b0d17"]} />
      <fog attach="fog" args={["#0b0d17", 12, 45]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 10, 4]} intensity={0.8} />
      <Stars radius={60} depth={40} count={2500} factor={4} fade speed={0.5} />

      {/* 床 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM_SIZE, ROOM_SIZE]} />
        <meshStandardMaterial color="#12141f" roughness={0.9} />
      </mesh>
      <Grid
        position={[0, 0.01, 0]}
        args={[ROOM_SIZE, ROOM_SIZE]}
        cellColor="#2a2d3e"
        sectionColor="#4a4f6a"
        cellSize={1}
        sectionSize={5}
        fadeDistance={35}
      />

      {/* 壁(低めのパーテーション) */}
      {(
        [
          { position: [0, WALL_HEIGHT / 2, -half], rotation: 0 },
          { position: [0, WALL_HEIGHT / 2, half], rotation: 0 },
          { position: [-half, WALL_HEIGHT / 2, 0], rotation: Math.PI / 2 },
          { position: [half, WALL_HEIGHT / 2, 0], rotation: Math.PI / 2 },
        ] as const
      ).map((wall, i) => (
        <mesh
          key={i}
          position={wall.position as unknown as [number, number, number]}
          rotation={[0, wall.rotation, 0]}
        >
          <boxGeometry args={[ROOM_SIZE, WALL_HEIGHT, 0.3]} />
          <meshStandardMaterial color="#1a1d2e" roughness={0.8} />
        </mesh>
      ))}

      {/* 展示物 */}
      <Exhibit position={[-5, 0, -5]} color="#7c6cff" shape="torusKnot" />
      <Exhibit position={[5, 0, -5]} color="#3ecfb2" shape="icosahedron" />
      <Exhibit position={[0, 0, -9]} color="#ff7a9e" shape="octahedron" />
    </>
  );
};
