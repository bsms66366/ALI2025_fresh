import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import { Asset } from 'expo-asset';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { PanResponder, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';

export default function Pharynx3DModel() {
    const modelRef = useRef<THREE.Object3D | null>(null);
    const zoomRef = useRef({ scale: 1.0 });
    const rotationRef = useRef({ x: 0, y: 0 });
    const [highlightedPart, setHighlightedPart] = useState<string | null>(null);
    
    const onContextCreate = async (gl: WebGLRenderingContext) => {
        const { drawingBufferWidth: width, drawingBufferHeight: height } = gl;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        const renderer = new Renderer({ gl });
        renderer.setSize(width, height);
        camera.position.z = 5;
        
        const light = new THREE.AmbientLight(0xffffff, 1);
        scene.add(light);
        
        const pointLight = new THREE.PointLight(0xffffff, 1, 100);
        pointLight.position.set(10, 10, 10);
        scene.add(pointLight);
        
        const model = await loadModel() as THREE.Object3D;
        scene.add(model as THREE.Object3D);
        modelRef.current = model as THREE.Object3D;
        
        const render = () => {
            requestAnimationFrame(render);
            model.rotation.y = rotationRef.current.y;
            model.rotation.x = rotationRef.current.x;
            model.scale.set(zoomRef.current.scale, zoomRef.current.scale, zoomRef.current.scale);
            renderer.render(scene, camera);
            (gl as any).endFrameEXP();
        };
        render();
    };
    
    const loadModel = async () => {
        const asset = Asset.fromModule(require('../assets/pharynx_and_floor_of_mouth.glb'));
        await asset.downloadAsync();
        const loader = new GLTFLoader();
        if (asset.localUri) {
            const arrayBuffer = await fetch(asset.localUri).then((res) => res.arrayBuffer());
            return new Promise<THREE.Object3D>((resolve) => {
                loader.parse(arrayBuffer, '', (gltf) => {
                    const model = gltf.scene;
                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.material = new THREE.MeshPhongMaterial({ color: 0x0077ff });
                        }
                    });
                    resolve(model);
                });
            });
        } else {
            // Handle the case where asset.localUri is null
            // For example, you could throw an error or return a default value
            throw new Error('asset.localUri is null');
        }
    };
    
    const panResponder = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_, gestureState) => {
            if (gestureState.numberActiveTouches === 1) {
                rotationRef.current.y += gestureState.dx * 0.01;
                rotationRef.current.x += gestureState.dy * 0.01;
            } else if (gestureState.numberActiveTouches === 2) {
                const newScale = zoomRef.current.scale + gestureState.dy * -0.005;
                zoomRef.current.scale = Math.min(Math.max(0.2, newScale), 3);
            }
        },
        onPanResponderGrant: (_, gestureState) => {
            if (gestureState.numberActiveTouches === 1) {
                checkObjectSelection(gestureState.x0, gestureState.y0);
            }
        },
        onPanResponderEnd: (_, gestureState) => {
            if (gestureState.numberActiveTouches === 1 && gestureState.dx === 0 && gestureState.dy === 0) {
                setHighlightedPart(null);
            }
        }
    });
    
    const checkObjectSelection = (x: number, y: number) => {
        if (!modelRef.current) return;
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(
            (x / window.innerWidth) * 2 - 1,
            -(y / window.innerHeight) * 2 + 1
        );
        raycaster.setFromCamera(mouse, new THREE.PerspectiveCamera(75, 1, 0.1, 1000));
        const intersects = raycaster.intersectObject(modelRef.current, true);
        if (intersects.length > 0) {
            setHighlightedPart(intersects[0].object.name);
            if (intersects[0].object instanceof THREE.Mesh) {
                const material = (intersects[0].object as THREE.Mesh).material;
                if (Array.isArray(material)) {
                    material.forEach((mat) => {
                        if (mat instanceof THREE.MeshPhongMaterial) {
                            mat.color.setHex(0xff0000);
                        }
                    });
                } else if (material instanceof THREE.MeshPhongMaterial) {
                    material.color.setHex(0xff0000);
                }
            }
        }
    };
    
    return (
        <View {...panResponder.panHandlers} style={{ flex: 1 }}>
            <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
        </View>
    );
}
