import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer, THREE } from 'expo-three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { ExpoWebGLRenderingContext } from 'expo-gl';
import axios from 'axios';
import { useModelCache } from './ModelCacheContext';
import { useSharedModel, Model } from './SharedModelContext';
import ARModelSelector from './ARModelSelector';

export default function ARViewComponent() {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string | null>('Loading 3D model...');

  // Get shared model context
  const { selectedModel, setSelectedModel } = useSharedModel();
  const [currentModel, setCurrentModel] = useState<Model | null>(selectedModel);

  // Get model cache
  const modelCache = useModelCache();

  // Refs for storing GL objects
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const modelRef = useRef<GLTF | null>(null);
  const frameId = useRef<number | null>(null);
  const animationMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const animationClockRef = useRef<THREE.Clock | null>(null);

  // Function to handle model selection
  const handleModelSelected = (model: Model) => {
    setCurrentModel(model);
    setSelectedModel(model); // Update the shared context
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
        if (error.response && error.response.status === 404) {
          setLoadingError(`Model not found (404 error). Please try another model.`);
        } else {
          setLoadingError(`Network error: ${error.message || 'Unknown error'}`);
        }
        return null;
      }
    } catch (error: any) {
      console.error('Error loading model:', error);
      setLoadingError(error.message || 'Failed to download 3D model');
      return null;
    }
  };

  // Function to load and setup the 3D model
  const loadModel = async (url: string) => {
    if (!glRef.current || !sceneRef.current) {
      console.error('GL context not initialized');
      return;
    }

    // Clear previous model if exists
    if (modelRef.current && modelRef.current.scene) {
      sceneRef.current.remove(modelRef.current.scene);
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
          '',
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
    
    // Apply vertex colors if available and ensure materials are properly set up
    gltf.scene.traverse((child) => {
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
    
    // Center and scale the model
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // Calculate scale to fit model in view
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 1.5 / maxDim;
    
    // Center the model
    gltf.scene.position.x = -center.x * scale;
    gltf.scene.position.y = -center.y * scale;
    gltf.scene.position.z = -center.z * scale;
    
    // Scale the model
    gltf.scene.scale.set(scale, scale, scale);
    
    console.log(`Model normalized with scale: ${scale}`);
    console.log(`Model centered at position: ${JSON.stringify({
      x: gltf.scene.position.x,
      y: gltf.scene.position.y,
      z: gltf.scene.position.z
    })}`);
    
    // Setup animation if available
    if (gltf.animations && gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const action = mixer.clipAction(gltf.animations[0]);
      action.play();
      
      // Store the mixer in a ref for animation updates
      animationMixerRef.current = mixer;
      
      if (!animationClockRef.current) {
        animationClockRef.current = new THREE.Clock();
      } else {
        animationClockRef.current.start();
      }
    }
    
    setModelLoaded(true);
    setLoadingMessage(null);
  };

  // Function to request a render update
  const requestRender = (): void => {
    if (glRef.current && sceneRef.current && cameraRef.current && rendererRef.current) {
      // Update animation if active
      if (animationMixerRef.current && animationClockRef.current) {
        const delta = animationClockRef.current.getDelta();
        animationMixerRef.current.update(delta);
      }
      
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

    // Load the model if we have one
    if (currentModel) {
      await loadModel(currentModel.url);
    }
    
    // Start animation loop
    const render = () => {
      requestRender();
      frameId.current = requestAnimationFrame(render);
    };
    render();
  };

  // Effect to initialize with the shared model if available
  useEffect(() => {
    if (selectedModel && !currentModel) {
      setCurrentModel(selectedModel);
      if (glRef.current && sceneRef.current) {
        loadModel(selectedModel.url);
      }
    }
  }, [selectedModel]);

  // Effect to handle initial model loading when currentModel changes
  useEffect(() => {
    if (currentModel && glRef.current && sceneRef.current) {
      loadModel(currentModel.url);
    }
  }, [currentModel?.id]); // Only re-run if the model ID changes

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (frameId.current) {
        cancelAnimationFrame(frameId.current);
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      {/* 3D View */}
      <GLView
        style={styles.glView}
        onContextCreate={onContextCreate}
      />
      
      {/* Model selector */}
      <ARModelSelector 
        onModelSelected={handleModelSelected}
      />
      
      {/* Loading indicator */}
      {loadingMessage && !modelLoaded && (
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
    backgroundColor: '#2c3e50',
  },
  glView: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    fontSize: 24,
  },
  errorContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
    alignItems: 'center',
  },
  errorText: {
    color: 'red',
    fontSize: 18,
  },
});