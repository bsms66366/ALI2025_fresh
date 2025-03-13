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
  // Declare model variable at component scope
  let model: GLTF | null = null;

  // Anatomical colors and labels mapping
  const anatomicalParts = [
    { name: 'Vocalis Muscle', color: '#8B0000' },
    { name: 'Lateral Cricoarytenoid Muscle', color: '#A52A2A' },
    { name: 'Posterior Cricoarytenoid Muscle', color: '#CD5C5C' },
    { name: 'Thyroid Cartilage', color: '#E8E8E8' },
    { name: 'Cricoid Cartilage', color: '#DCDCDC' },
    { name: 'Arytenoid Cartilages', color: '#D3D3D3' },
    { name: 'Cricothyroid Ligament', color: '#FFE4B5' },
    { name: 'Vocal Ligament', color: '#DEB887' },
    { name: 'Mucosa', color: '#FFB6C1' },
  ];

  const getAnatomicalColor = (meshName: string, index: number): string => {
    console.log('[Debug] Getting color for mesh:', meshName, 'index:', index);
    // Try to extract Object_X pattern from the name if it exists
    const objectMatch = meshName.match(/Object_(\d+)/);
    let colorIndex = index % anatomicalParts.length; // Default fallback
    
    if (objectMatch) {
      // Convert Object_X to index by extracting the number and using integer division
      const objectNum = parseInt(objectMatch[1]);
      colorIndex = Math.floor(objectNum / 2) % anatomicalParts.length;
    }
    
    const part = anatomicalParts[colorIndex] || { name: 'Unknown', color: '#F0F0F0' };
    console.log('[Debug] Using color index', colorIndex, ':', part.name, part.color);
    return part.color;
  };

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
      
      // Fix: Assign to the model variable declared at component scope
      model = await new Promise<GLTF>((resolve, reject) => {
        loader.parse(
          arrayBuffer as ArrayBuffer,
          '',
          resolve,
          reject
        );
      });

      // Replace all materials with anatomically colored materials based on mesh index
      let meshIndex = 0;
      model.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Get appropriate color for this anatomical part
          const colorHex = getAnatomicalColor(child.name, meshIndex);
          const color = new THREE.Color(colorHex);
          
          // Create a simple phong material for better lighting
          const material = new THREE.MeshPhongMaterial({
            color: color,
            specular: 0x333333,
            shininess: 30,
            flatShading: false,
            transparent: true,
            opacity: 0.95,
          });
          
          // Apply the material to the mesh
          child.material = material;
          
          // Log for debugging
          console.log(`Applied ${colorHex} to mesh: ${child.name}`);
          
          // Increment mesh counter
          meshIndex++;
        }
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
      
      // Log the total number of meshes found
      console.log(`Total meshes with applied materials: ${meshIndex}`);
    } catch (error) {
      console.error('Error loading model:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
      }
    }

    // Enhance lighting for better material visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Increased intensity
    scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);
    
    // Add a secondary light from another angle for better depth
    const pointLight2 = new THREE.PointLight(0xffffff, 0.8);
    pointLight2.position.set(-5, -2, 2);
    scene.add(pointLight2);

    // Increased camera distance to see the properly scaled model
    camera.position.z = 5;

    // Add rotation to the rendered scene to see the model better
    const render = () => {
      timeout = requestAnimationFrame(render);
      
      // Slowly rotate the model for better viewing
      if (model && model.scene) {
        model.scene.rotation.y += 0.005;
      }
      
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
