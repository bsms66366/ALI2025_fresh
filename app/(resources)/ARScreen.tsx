import { StyleSheet, View, Platform } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import { Asset } from 'expo-asset';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import * as THREE from 'three';

// Update path to use assets inside the app directory
const MODEL = Asset.fromModule(require('../assets/larynx_with_muscles_and_ligaments.glb'));

export default function ARScreen() {
  let timeout: number;

  const loadModel = async () => {
    try {
      console.log('Starting model load...');
      
      // Ensure the model is downloaded and ready
      await MODEL.downloadAsync();
      console.log('Model downloaded successfully');
      
      if (!MODEL.localUri) {
        console.error('Model state:', MODEL);
        throw new Error('Model localUri is undefined after download');
      }
      
      // Make sure we have the right format for iOS in Expo managed workflow
      const uri = Platform.OS === 'ios' 
        ? MODEL.localUri.startsWith('file://') 
          ? MODEL.localUri 
          : `file://${MODEL.localUri}` 
        : MODEL.localUri;
      
      console.log('Using model URI:', uri);
      return uri;
    } catch (error) {
      console.error('Error in loadModel:', error);
      throw error;
    }
  };

  const onContextCreate = async (gl: any) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 1000
    );
    
    const renderer = new Renderer({ gl });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);

    try {
      const modelURI = await loadModel();
      console.log('Model URI received:', modelURI);
      
      if (!modelURI) {
        throw new Error('Could not resolve model URI');
      }

      const loader = new GLTFLoader();
      
      // For debugging
      loader.setPath('');
      
      // For Expo managed workflows, this approach works well
      const response = await fetch(modelURI);
      const blob = await response.blob();
      const arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
      });
      
      const model = await new Promise<GLTF>((resolve, reject) => {
        loader.parse(
          arrayBuffer as ArrayBuffer,
          '',
          resolve,
          reject
        );
      });

      // Reduced scale significantly to make the model appear smaller
      model.scene.scale.set(0.05, 0.05, 0.05);
      
      // Center the model
      model.scene.position.set(0, 0, 0);
      
      // Optional: you can add this to fit the model to the view
      const box = new THREE.Box3().setFromObject(model.scene);
      const center = box.getCenter(new THREE.Vector3());
      model.scene.position.sub(center); // Center the model
      
      scene.add(model.scene);
    } catch (error) {
      console.error('Error loading model:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
      }
    }

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    // Increased camera distance to see the properly scaled model
    camera.position.z = 5;

    const render = () => {
      timeout = requestAnimationFrame(render);
      // Update animation if your model has animations
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    render();
  };

  return (
    <View style={styles.container}>
      <GLView
        style={styles.glView}
        onContextCreate={onContextCreate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  glView: {
    flex: 1,
  },
});
