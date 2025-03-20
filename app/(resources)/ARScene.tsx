import React, { useState, useRef } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer, THREE } from 'expo-three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { ExpoWebGLRenderingContext } from 'expo-gl';
import axios from 'axios';

export default function ARViewComponent() {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('Loading 3D model...');

  // Remote model URL
  const MODEL_URL = 'https://placements.bsms.ac.uk/storage/pharynx_and_floor_of_mouth.glb';

  // Refs for storing GL objects
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const modelRef = useRef<GLTF | null>(null);

  // Function to load model data from remote URL
  const loadModelFromUrl = async (): Promise<ArrayBuffer | null> => {
    try {
      setLoadingMessage('Downloading model...');
      console.log(`Loading model from ${MODEL_URL}`);
      
      // Load from URL using axios
      const response = await axios.get(MODEL_URL, {
        responseType: 'arraybuffer'
      });
      
      console.log('Model loaded from URL successfully');
      return response.data;
    } catch (error: any) {
      console.error('Error loading model:', error);
      setLoadingError(error.message || 'Failed to download 3D model');
      return null;
    }
  };

  // Function to request a render update
  const requestRender = (): void => {
    if (glRef.current && sceneRef.current && cameraRef.current && rendererRef.current) {
      // Update the model's matrices to ensure proper transformation
      if (modelRef.current && modelRef.current.scene) {
        modelRef.current.scene.updateMatrixWorld(true);
      }
      
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      glRef.current.endFrameEXP();
    }
  };

  // This function handles the 3D rendering
  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    // Store GL instance in ref
    glRef.current = gl;
    
    // Create scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    
    // Create camera
    const camera = new THREE.PerspectiveCamera(
      75,
      gl.drawingBufferWidth / gl.drawingBufferHeight,
      0.1,
      1000
    );
    camera.position.z = 5;
    cameraRef.current = camera;
    
    // Create renderer with a gradient background
    const renderer = new Renderer({ gl });
    rendererRef.current = renderer;
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    
    // Set a nice gradient background
    renderer.setClearColor(0x2c3e50, 1);
    
    // Add lights to the scene
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 10, 5);
    scene.add(directionalLight);

    try {
      // Load the 3D model from remote URL
      setLoadingMessage('Downloading model...');
      const modelData = await loadModelFromUrl();
      
      if (!modelData) {
        throw new Error('Could not load model data');
      }
      
      setLoadingMessage('Processing model...');
      const loader = new GLTFLoader();
      
      // Parse the model data
      modelRef.current = await new Promise<GLTF>((resolve, reject) => {
        loader.parse(
          modelData,
          '',
          resolve,
          reject
        );
      });
      
      setLoadingMessage('Applying materials...');
      
      // Apply vertex colors if available and ensure materials are properly set up
      if (modelRef.current && modelRef.current.scene) {
        modelRef.current.scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            
            // Make sure materials are properly applied
            if (mesh.material) {
              // If it's an array of materials
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach(material => {
                  // Enable vertex colors if they exist
                  if (mesh.geometry.attributes.color) {
                    material.vertexColors = true;
                  }
                  
                  // Ensure material settings are optimized for display
                  material.needsUpdate = true;
                  material.side = THREE.DoubleSide; // Render both sides
                });
              } else {
                // Single material
                // Enable vertex colors if they exist
                if (mesh.geometry.attributes.color) {
                  mesh.material.vertexColors = true;
                }
                
                // Ensure material settings are optimized for display
                mesh.material.needsUpdate = true;
                mesh.material.side = THREE.DoubleSide; // Render both sides
              }
            }
          }
        });
      }
      
      // A simpler approach to center the model
      // First reset position
      modelRef.current.scene.position.set(0, 0, 0);
      
      // Calculate bounding box
      const box = new THREE.Box3().setFromObject(modelRef.current.scene);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      
      // Scale model to a reasonable size
      const scale = 2 / maxDim;
      modelRef.current.scene.scale.set(scale, scale, scale);
      
      // Center the model by calculating its center and moving it to origin
      box.setFromObject(modelRef.current.scene); // Recalculate after scaling
      const center = box.getCenter(new THREE.Vector3());
      modelRef.current.scene.position.set(-center.x, -center.y, -center.z);
      
      // Update matrices
      modelRef.current.scene.updateMatrix();
      modelRef.current.scene.updateMatrixWorld(true);
      
      console.log('Model normalized with scale:', scale);
      console.log('Model centered at position:', modelRef.current.scene.position);
      
      // Add the model to the scene
      scene.add(modelRef.current.scene);
      setModelLoaded(true);
      
      // Animation loop
      const animate = () => {
        requestAnimationFrame(animate);
        
        // Rotate the model
        if (modelRef.current && modelRef.current.scene) {
          modelRef.current.scene.rotation.y += 0.01;
        }
        
        requestRender();
      };
      
      animate();
      
    } catch (error: any) {
      console.error('Error processing model:', error);
      setLoadingError(error.message || 'Failed to process 3D model');
    }
  };

  return (
    <View style={styles.container}>
      {/* 3D model view */}
      <GLView 
        style={styles.glView} 
        onContextCreate={onContextCreate}
      />
      
      {/* Overlay for messages */}
      <View style={styles.overlay}>
        {loadingError ? (
          <Text style={styles.errorText}>Error: {loadingError}</Text>
        ) : !modelLoaded ? (
          <Text style={styles.text}>{loadingMessage}</Text>
        ) : (
          <Text style={styles.text}>3D Model Viewer</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2c3e50',
  },
  glView: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
    alignItems: 'center',
  },
  text: {
    color: 'white',
    fontSize: 24,
  },
  errorText: {
    color: 'red',
    fontSize: 18,
  },
});