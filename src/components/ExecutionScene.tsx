import { Canvas, useThree } from '@react-three/fiber';
import { Grid, OrbitControls, RoundedBox, Text } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import type { RuntimeState } from '../../shared/schema';
import { formatValue } from '../../shared/reconstruct';
import { planScene, type ArrayPointer } from '../visualizers/registry';

type Props = { state?: RuntimeState; selected?: string; onSelect: (name?: string) => void; resetCameraKey?: number; reducedMotion?: boolean };

function ArrayObjects({ name, values, pointers, selected, onSelect }: { name: string; values: unknown[]; pointers: ArrayPointer[]; selected?: string; onSelect: (name: string) => void }) {
  return <group position={[-Math.min(values.length, 7) * 0.78, 0.3, 0]}>
    <Text position={[0, 1.28, 0]} fontSize={0.32} color="#a6f3e1" anchorX="left">{name} · {values.length} values</Text>
    {values.slice(0, 14).map((value, index) => {
      const id = `${name}[${index}]`;
      const active = selected === id;
      return <group key={id} position={[index * 1.55, 0, 0]} onClick={(event) => { event.stopPropagation(); onSelect(id); }}>
        <RoundedBox args={[1.18, 1.18, 0.8]} radius={0.12} smoothness={4}>
          <meshStandardMaterial color={active ? '#d8a74a' : '#1c7490'} emissive={active ? '#704816' : '#063b4c'} emissiveIntensity={active ? 0.8 : 0.25} />
        </RoundedBox>
        <Text position={[0, 0.04, 0.42]} fontSize={0.25} color="white" maxWidth={1}>{formatValue(value)}</Text>
        <Text position={[0, -0.92, 0]} fontSize={0.18} color="#88aab8">[{index}]</Text>
      </group>;
    })}
    {pointers.map((pointer, pointerIndex) => <group key={pointer.name} position={[pointer.index * 1.55, 1.72 + pointerIndex * 0.38, 0]}>
      <mesh rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.14, 0.36, 14]} /><meshStandardMaterial color={pointer.color} emissive={pointer.color} emissiveIntensity={0.42} /></mesh>
      <Text position={[0, 0.28, 0]} fontSize={0.16} color={pointer.color}>{pointer.name}</Text>
    </group>)}
  </group>;
}

function VariableObjects({ state, selected, onSelect }: { state: RuntimeState; selected?: string; onSelect: (name: string) => void }) {
  const scope = state.frames.at(-1)?.locals ?? state.globals;
  const values = Object.entries(scope).filter(([, value]) => !Array.isArray(value)).slice(0, 8);
  return <group position={[5.6, 1.3, -1.3]}>
    <Text position={[-1.4, 1, 0]} fontSize={0.28} color="#b8c7ff" anchorX="left">Live variables</Text>
    {values.map(([name, value], index) => {
      const active = selected === name;
      return <group key={name} position={[0, -index * 0.74, 0]} onClick={(event) => { event.stopPropagation(); onSelect(name); }}>
        <RoundedBox args={[3.2, 0.56, 0.38]} radius={0.09} smoothness={4}><meshStandardMaterial color={active ? '#875cce' : '#26334d'} emissive={active ? '#3b176f' : '#101929'} emissiveIntensity={0.45} /></RoundedBox>
        <Text position={[-1.38, 0, 0.22]} fontSize={0.19} color="#dbe5ff" anchorX="left">{name}</Text>
        <Text position={[1.36, 0, 0.22]} fontSize={0.17} color="#7fe6c7" anchorX="right" maxWidth={1.5}>{formatValue(value)}</Text>
      </group>;
    })}
  </group>;
}

function StackObjects({ state }: { state: RuntimeState }) {
  return <group position={[-5.3, 1.3, -1.2]}>
    <Text position={[-1.3, 1, 0]} fontSize={0.28} color="#ffd889" anchorX="left">Call stack</Text>
    {state.frames.length === 0 ? <Text position={[0, 0, 0]} fontSize={0.22} color="#7e919b">global scope</Text> : state.frames.map((frame, index) => <group key={frame.id} position={[0, -index * 0.78, 0]}>
      <RoundedBox args={[2.9, 0.58, 0.42]} radius={0.1} smoothness={4}><meshStandardMaterial color={index === state.frames.length - 1 ? '#895d18' : '#4e3b2a'} /></RoundedBox>
      <Text position={[-1.14, 0, 0.24]} fontSize={0.2} color="#fff0c5" anchorX="left">{frame.functionName}</Text>
    </group>)}
  </group>;
}

function Classroom({ state, selected, onSelect }: Props) {
  const plan = useMemo(() => planScene(state), [state]);
  if (!state) return <>
    <Text position={[0, 0.6, 0]} fontSize={0.48} color="#dbeaf2" anchorX="center">Run a program to enter the classroom</Text>
    <Text position={[0, -0.1, 0]} fontSize={0.24} color="#7fa0ad" anchorX="center">Recorded variables, arrays, and call frames appear here.</Text>
  </>;
  return <>
    {plan.array && <ArrayObjects name={plan.array.name} values={plan.array.values} pointers={plan.array.pointers} selected={selected} onSelect={onSelect} />}
    <VariableObjects state={state} selected={selected} onSelect={onSelect} />
    <StackObjects state={state} />
  </>;
}

function CameraControls({ plan, selected, resetCameraKey }: { plan: ReturnType<typeof planScene>; selected?: string; resetCameraKey?: number }) {
  const controls = useRef<any>(null);
  const { camera } = useThree();
  const arrayName = plan.array?.name;
  const arrayLength = plan.array?.values.length;
  useEffect(() => {
    if (resetCameraKey === undefined) return;
    camera.position.set(0, 4.8, 13);
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
  }, [camera, resetCameraKey]);
  useEffect(() => {
    if (!selected) return;
    const arrayMatch = plan.array && new RegExp(`^${plan.array.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[(\\d+)\\]$`).exec(selected);
    if (arrayMatch) {
      const index = Number(arrayMatch[1]);
      const offset = -Math.min(plan.array!.values.length, 7) * 0.78;
      controls.current?.target.set(offset + index * 1.55, 0.25, 0);
      camera.position.set(offset + index * 1.55, 3.8, 9.5);
    } else {
      controls.current?.target.set(5.2, 0, -1);
      camera.position.set(5.2, 3.2, 9);
    }
    controls.current?.update();
  }, [arrayLength, arrayName, camera, selected]);
  return <OrbitControls ref={controls} enablePan enableZoom minDistance={6} maxDistance={24} target={[0, 0, 0]} />;
}

export function ExecutionScene(props: Props) {
  const plan = planScene(props.state);
  return <div className="scene-canvas" aria-label="Interactive 3D runtime scene">
    <Canvas camera={{ position: [0, 4.8, 13], fov: 47 }} dpr={[1, 1.5]} gl={{ antialias: true }} onPointerMissed={() => props.onSelect(undefined)}>
      <color attach="background" args={['#071620']} />
      <ambientLight intensity={0.78} />
      <pointLight position={[3, 8, 5]} intensity={65} color="#7bd7ff" />
      <pointLight position={[-7, 2, 4]} intensity={35} color="#c9a2ff" />
      <Grid args={[22, 22]} position={[0, -1.5, 0]} cellSize={0.7} cellThickness={0.45} sectionSize={3.5} sectionColor="#196179" cellColor="#113545" fadeDistance={24} fadeStrength={1.2} />
      <Classroom {...props} />
      <CameraControls plan={plan} selected={props.selected} resetCameraKey={props.resetCameraKey} />
    </Canvas>
    <div className="scene-hint"><span className="pulse-dot" /> drag to orbit · scroll to zoom · select an object</div>
  </div>;
}

export default ExecutionScene;
