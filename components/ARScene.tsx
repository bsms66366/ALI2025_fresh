import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Camera as ExpoCamera, CameraType as ExpoCameraType, useCameraPermissions } from 'expo-camera';
import { GLView } from 'expo-gl';
import { Renderer, TextureLoader, THREE } from 'expo-three';
import { Asset } from 'expo-asset';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { ExpoWebGLRenderingContext } from 'expo-gl';

export default function ARViewComponent() {
  const [permission, requestPermission] = useCameraPermissions();
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  useEffect(() => {
    requestPermission();
  }, []);

  // This function handles the 3D rendering
  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    // Create a WebGLRenderer without a DOM element
    const renderer = new Renderer({ gl });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    
    // Add lights to the scene
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 10, 5);
    scene.add(directionalLight);

    // Create a camera
    const camera = new THREE.PerspectiveCamera(
      75,
      gl.drawingBufferWidth / gl.drawingBufferHeight,
      0.1,
      1000
    );
    camera.position.z = 5;

    try {
      // Load the 3D model
      const modelAsset = Asset.fromModule(require('../assets/models/larynx.glb'));
      await modelAsset.downloadAsync();
      
      const loader = new GLTFLoader();
      const modelData = await new Promise<any>((resolve, reject) => {
        loader.load(
          modelAsset.uri,
          resolve,
          (xhr) => {
            console.log(`${(xhr.loaded / xhr.total) * 100}% loaded`);
          },
          reject
        );
      });
      
      const model = modelData.scene;
      
      // Center the model
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      
      // Scale the model if needed
      model.scale.set(1, 1, 1); // Adjust scale as needed
      
      // Add the model to the scene
      scene.add(model);
      setModelLoaded(true);
    } catch (error: any) {
      console.error('Error loading model:', error);
      setLoadingError(error.message || 'Failed to load 3D model');
    }

    // Animation loop
    const render = () => {
      requestAnimationFrame(render);
      
      // Rotate the model if it exists
      if (scene.children.length > 2) { // > 2 because we have 2 lights
        const model = scene.children[2];
        model.rotation.y += 0.01;
      }
      
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    
    render();
  };

  if (!permission?.granted) {
    return (
      <View style={styles.container}>
        <Text>No access to camera</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ExpoCamera style={styles.camera} type={ExpoCameraType.back}>
        <GLView style={styles.glView} onContextCreate={onContextCreate} />
        <View style={styles.overlay}>
          {loadingError ? (
            <Text style={styles.errorText}>Error: {loadingError}</Text>
          ) : !modelLoaded ? (
            <Text style={styles.text}>Loading 3D model...</Text>
          ) : (
            <Text style={styles.text}>AR View</Text>
          )}
        </View>
      </ExpoCamera>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
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