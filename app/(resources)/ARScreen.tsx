import { StyleSheet, View, Platform, PanResponder, GestureResponderEvent, PanResponderGestureState, TouchableOpacity, Text } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import { Asset } from 'expo-asset';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import * as THREE from 'three';
import React, { useRef, useState } from 'react';

// Update path to use assets inside the app directory
const MODEL = Asset.fromModule(require('../assets/pharynx_and_floor_of_mouth.glb'));

export default function ARScreen() {
  let timeout: number;
  // Declare model variable at component scope
  let model: GLTF | null = null;
  
  // Add zoom reference for pinch-to-zoom
  const zoomRef = useRef({ scale: 0.05, lastDistance: 0 });
  // Ref for position with limits to prevent going off screen
  const positionRef = useRef({ x: 0, y: 0 });
  // Ref for rotation values
  const rotationRef = useRef({ x: 0, y: 0 });
  // Track whether we're rotating or panning in single-finger mode
  const gestureRef = useRef({ mode: 'none', initialTouchTime: 0 });
  
  // State for storing the GL instance
  const glRef = useRef<any>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<Renderer | null>(null);

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

  // Function to calculate distance between two touches for pinch-to-zoom
  const getDistance = (touches: any[]): number => {
    if (touches.length < 2) return 0;
    
    const [touch1, touch2] = touches;
    const dx = touch1.pageX - touch2.pageX;
    const dy = touch1.pageY - touch2.pageY;
    
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Function to normalize model size
  const normalizeModel = (modelScene: THREE.Object3D) => {
    // Calculate bounding box to determine model size
    const box = new THREE.Box3().setFromObject(modelScene);
    
    // Get model dimensions
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // Target size (standard size we want all models to fit within)
    const targetSize = 2.0;
    
    // Calculate scale to fit the model in our standard size
    const normalizedScale = targetSize / maxDim;
    
    console.log(`Model normalized: original max dimension ${maxDim}, scale factor ${normalizedScale}`);
    
    // Update zoom reference scale
    zoomRef.current.scale = normalizedScale;
    
    // Apply normalized scale
    modelScene.scale.set(normalizedScale, normalizedScale, normalizedScale);
    
    // Center the model
    const center = box.getCenter(new THREE.Vector3());
    modelScene.position.sub(center);
    
    return normalizedScale;
  };

  // Create pan responder for handling touch gestures
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    
    // Handle gesture start
    onPanResponderGrant: (evt) => {
      const touches = evt.nativeEvent.touches;
      
      // Initialize last distance for pinch zoom
      if (touches.length === 2) {
        zoomRef.current.lastDistance = getDistance(touches);
      } 
      // For single touch, track the start time to differentiate between short/long moves
      else if (touches.length === 1) {
        gestureRef.current = {
          mode: 'none', // Will be determined on first move
          initialTouchTime: Date.now()
        };
      }
    },
    
    onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
      const touches = evt.nativeEvent.touches;
      
      // Handle pinch to zoom with two fingers
      if (touches.length === 2) {
        const currentDistance = getDistance(touches);
        
        // Calculate zoom change factor
        if (zoomRef.current.lastDistance > 0) {
          const distanceChange = currentDistance - zoomRef.current.lastDistance;
          const scaleFactor = 1 + distanceChange * 0.001; // Subtle zoom sensitivity
          
          // Update scale with constraints appropriate for normalized models
          const newScale = zoomRef.current.scale * scaleFactor;
          zoomRef.current.scale = Math.max(0.2, Math.min(3.0, newScale)); // Updated constraints for normalized models
          
          // Apply scale to model
          if (model && model.scene) {
            model.scene.scale.set(
              zoomRef.current.scale,
              zoomRef.current.scale,
              zoomRef.current.scale
            );
            
            // Request render update
            requestRender();
          }
        }
        
        // Store current distance for next move
        zoomRef.current.lastDistance = currentDistance;
      }
      // Handle single finger for both rotation and limited panning
      else if (touches.length === 1) {
        const moveTime = Date.now() - gestureRef.current.initialTouchTime;
        const moveMagnitude = Math.sqrt(
          gestureState.dx * gestureState.dx + gestureState.dy * gestureState.dy
        );
        
        // If we haven't decided on a mode yet, determine based on movement
        if (gestureRef.current.mode === 'none') {
          // If movement is fast or diagonal, use rotation mode
          if (moveTime < 150 || (Math.abs(gestureState.dx) > 5 && Math.abs(gestureState.dy) > 5)) {
            gestureRef.current.mode = 'rotate';
          } else {
            // Otherwise use pan mode
            gestureRef.current.mode = 'pan';
          }
        }
        
        // Apply the appropriate transformation based on mode
        if (gestureRef.current.mode === 'rotate') {
          // Update rotation based on finger movement with reduced sensitivity
          rotationRef.current = {
            y: rotationRef.current.y + gestureState.dx * 0.003,
            x: rotationRef.current.x + gestureState.dy * 0.003,
          };
          
          // Apply rotation to the model if it exists
          if (model && model.scene) {
            model.scene.rotation.y = rotationRef.current.y;
            model.scene.rotation.x = rotationRef.current.x;
            
            // Request render update
            requestRender();
          }
        } else {
          // Handle pan with limits to prevent going off screen
          // Calculate new position with a reduced movement multiplier
          const newPosX = positionRef.current.x + gestureState.dx * 0.001;
          const newPosY = positionRef.current.y - gestureState.dy * 0.001; // Invert Y for natural movement
          
          // Apply position limits to keep model visible
          const positionLimit = 1.5; // Limit based on normalized model size
          positionRef.current = {
            x: Math.max(-positionLimit, Math.min(positionLimit, newPosX)),
            y: Math.max(-positionLimit, Math.min(positionLimit, newPosY)),
          };
          
          // Apply position to the model if it exists
          if (model && model.scene) {
            // Get the current center position 
            const box = new THREE.Box3().setFromObject(model.scene);
            const center = box.getCenter(new THREE.Vector3());
            
            // Apply panning offset to the model
            model.scene.position.x = positionRef.current.x - center.x;
            model.scene.position.y = positionRef.current.y - center.y;
            
            // Request render update
            requestRender();
          }
        }
      }
    },
    
    // Handle gesture end
    onPanResponderRelease: () => {
      zoomRef.current.lastDistance = 0;
      gestureRef.current.mode = 'none';
    },
  });

  // Function to request a render update
  const requestRender = () => {
    if (glRef.current && sceneRef.current && cameraRef.current && rendererRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      glRef.current.endFrameEXP();
    }
  };

  const onContextCreate = async (gl: any) => {
    // Store GL instance in ref
    glRef.current = gl;
    
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    
    const camera = new THREE.PerspectiveCamera(
      75, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 1000
    );
    cameraRef.current = camera;
    
    const renderer = new Renderer({ gl });
    rendererRef.current = renderer;
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

      // Apply normalization to ensure consistent size across models
      // This replaces the manual scaling code
      normalizeModel(model.scene);
      
      // Initialize position reference with the model's centered position
      positionRef.current = {
        x: model.scene.position.x,
        y: model.scene.position.y
      };
      
      scene.add(model.scene);
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

    // Initial render
    renderer.render(scene, camera);
    gl.endFrameEXP();
  };

  // Function to reset model position, rotation and zoom
  const resetModel = () => {
    if (model && model.scene) {
      // Calculate bounding box to determine model size
      const box = new THREE.Box3().setFromObject(model.scene);
      
      // Reset position
      const center = box.getCenter(new THREE.Vector3());
      model.scene.position.sub(center);
      positionRef.current = { x: 0, y: 0 };
      
      // Reset rotation
      model.scene.rotation.x = 0;
      model.scene.rotation.y = 0;
      rotationRef.current = { x: 0, y: 0 };
      
      // Reset zoom - using the original normalized scale
      const normalizedScale = zoomRef.current.scale;
      model.scene.scale.set(normalizedScale, normalizedScale, normalizedScale);
      
      // Request render update
      requestRender();
    }
  };

  return (
    <View style={styles.container}>
      <GLView
        style={styles.glView}
        onContextCreate={onContextCreate}
      />
      
      <View style={styles.touchHandler} {...panResponder.panHandlers} />
      
      {/* Reset button */}
      <TouchableOpacity 
        style={styles.resetButton} 
        onPress={resetModel}
        activeOpacity={0.7}
      >
        <Text style={styles.resetButtonText}>Reset View</Text>
      </TouchableOpacity>
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  touchHandler: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  resetButton: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  resetButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
