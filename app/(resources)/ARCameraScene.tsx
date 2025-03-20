import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, Image, Platform, TouchableOpacity } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer, THREE } from 'expo-three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { ExpoWebGLRenderingContext } from 'expo-gl';
import axios from 'axios';
import { useModelCache } from './ModelCacheContext';
import ARModelSelector from './ARModelSelector';

// Define model interface
interface Model {
  id: string;
  name: string;
  url: string;
  description?: string;
}

export default function ARCameraScene() {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>('Loading...');
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<Model | null>(null);

  // Get model cache
  const modelCache = useModelCache();

  // Refs for storing GL objects
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const modelRef = useRef<GLTF | null>(null);
  const frameId = useRef<number | null>(null);

  // Function to handle model selection
  const handleModelSelected = (model: Model) => {
    setCurrentModel(model);
    setModelLoaded(false);
    setLoadingMessage('Loading new model...');
    setLoadingError(null);
    
    // If GL context is already initialized, load the new model
    if (glRef.current && sceneRef.current) {
      loadModel(model.url);
    }
  };

  // Function to load model data from remote URL
  const loadModelFromUrl = async (url: string): Promise<ArrayBuffer | null> => {
    try {
      setLoadingMessage('Downloading model...');
      console.log(`Loading model from ${url}`);
      
      // Use model cache instead of direct axios call
      try {
        const modelData = await modelCache.getModelData(url);
        console.log('Model loaded from cache or URL successfully');
        return modelData;
      } catch (error: any) {
        console.error('Error loading model from cache:', error);
        setLoadingError(error.message || 'Failed to download 3D model');
        return null;
      }
    } catch (error: any) {
      console.error('Error loading model:', error);
      setLoadingError(error.message || 'Failed to download 3D model');
      return null;
    }
  };

  // Function to load a model
  const loadModel = async (url: string) => {
    if (!glRef.current || !sceneRef.current) {
      console.error('GL context or scene not initialized');
      return;
    }

    // Clear existing model from scene
    if (modelRef.current && sceneRef.current) {
      sceneRef.current.remove(modelRef.current.scene);
      modelRef.current = null;
    }

    // Check if we have a cached parsed model first
    const cachedModel = modelCache.getParsedModel(url);
    
    if (cachedModel) {
      console.log('Using cached parsed model');
      modelRef.current = cachedModel;
      setupModel(cachedModel);
    } else {
      // Load the 3D model from remote URL
      const modelData = await loadModelFromUrl(url);
      
      if (!modelData) {
        throw new Error('Could not load model data');
      }
      
      setLoadingMessage('Processing model...');
      const loader = new GLTFLoader();
      
      // Parse the model data
      modelRef.current = await new Promise<GLTF>((resolve, reject) => {
        loader.parse(
          modelData,
          '', // Ensure this is an empty string, not undefined, to fix the GLTFLoader path issue
          resolve,
          reject
        );
      });
      
      // Store the parsed model in cache
      modelCache.setParsedModel(url, modelRef.current);
      
      setupModel(modelRef.current);
    }
  };

  // Setup the model in the scene
  const setupModel = (gltf: GLTF) => {
    if (!sceneRef.current) return;
    
    setLoadingMessage('Applying materials...');
    
    // Add the model to the scene
    sceneRef.current.add(gltf.scene);
    
    // Center and scale the model
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // Calculate scale to fit model in view
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 1.5 / maxDim;
    gltf.scene.scale.set(scale, scale, scale);
    
    // Center the model
    gltf.scene.position.x = -center.x * scale;
    gltf.scene.position.y = -center.y * scale;
    gltf.scene.position.z = -center.z * scale;
    
    console.log(`Model normalized with scale: ${scale}`);
    console.log(`Model centered at position: ${JSON.stringify({
      x: gltf.scene.position.x,
      y: gltf.scene.position.y,
      z: gltf.scene.position.z
    })}`);
    
    setModelLoaded(true);
    setLoadingMessage(null);
    
    // Request a render
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  };

  // This function handles the 3D rendering
  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    // Store GL context
    glRef.current = gl;
    
    // Create THREE.js scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x000000);
    
    // Create camera
    const camera = new THREE.PerspectiveCamera(
      75, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 1000
    );
    cameraRef.current = camera;
    camera.position.z = 3;
    
    // Create renderer
    const renderer = new Renderer({ gl });
    rendererRef.current = renderer;
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.setClearColor(0x000000, 1);
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Load initial model if available
    if (currentModel) {
      await loadModel(currentModel.url);
    }
    
    // Set up render loop
    const render = () => {
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      
      // Request next frame
      frameId.current = window.requestAnimationFrame(render);
    };
    
    // Start rendering
    render();
  };

  // Effect to handle initial model loading when currentModel changes
  useEffect(() => {
    if (currentModel && glRef.current && sceneRef.current) {
      loadModel(currentModel.url);
    }
  }, [currentModel?.id]); // Only re-run if the model ID changes

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (frameId.current) {
        window.cancelAnimationFrame(frameId.current);
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      <GLView
        style={styles.glView}
        onContextCreate={onContextCreate}
      />
      
      {/* Camera preview placeholder */}
      <View style={styles.cameraPreview}>
        <Image 
          source={require('@/assets/images/camera-placeholder.png')} 
          style={styles.cameraImage}
          resizeMode="cover"
        />
      </View>
      
      {/* Model selector */}
      <ARModelSelector 
        onModelSelected={handleModelSelected}
      />
      
      {/* Loading indicator */}
      {loadingMessage && (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{loadingMessage}</Text>
        </View>
      )}
      
      {/* Error message */}
      {loadingError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{loadingError}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  glView: {
    flex: 1,
  },
  cameraPreview: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 120,
    height: 160,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'white',
  },
  cameraImage: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  loadingText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 20,
    borderRadius: 10,
  },
  errorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 20,
    borderRadius: 10,
  },
});
