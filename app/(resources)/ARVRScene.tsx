import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer, THREE } from 'expo-three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { ExpoWebGLRenderingContext } from 'expo-gl';
import axios from 'axios';
import { DeviceMotion, DeviceMotionMeasurement } from 'expo-sensors';
import { useModelCache } from './ModelCacheContext';
import { useSharedModel, Model } from './SharedModelContext';
import ARModelSelector from './ARModelSelector';

// Device motion interface
interface DeviceMotionData {
  rotation?: {
    alpha: number;
    beta: number;
    gamma: number;
  };
}

export default function ARVRScene() {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>('Loading...');
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isDeviceMotionActive, setIsDeviceMotionActive] = useState(false);
  const [deviceMotion, setDeviceMotion] = useState<DeviceMotionData | null>(null);

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
          '', // Ensure this is an empty string, not undefined
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

    // Setup animation if available
    if (gltf.animations && gltf.animations.length > 0) {
      animationMixerRef.current = new THREE.AnimationMixer(gltf.scene);
      const action = animationMixerRef.current.clipAction(gltf.animations[0]);
      action.play();

      if (!animationClockRef.current) {
        animationClockRef.current = new THREE.Clock();
      } else {
        animationClockRef.current.start();
      }
    }

    setModelLoaded(true);
    setLoadingMessage(null);
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

    // Start render loop
    const render = () => {
      if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

      // Update animation if active
      if (animationMixerRef.current && animationClockRef.current) {
        const delta = animationClockRef.current.getDelta();
        animationMixerRef.current.update(delta);
      }

      // Apply device motion to camera if active
      if (isDeviceMotionActive && deviceMotion && cameraRef.current) {
        const { rotation } = deviceMotion;
        if (rotation) {
          // Apply rotation to camera
          cameraRef.current.rotation.x = rotation.beta * (Math.PI / 180);
          cameraRef.current.rotation.y = rotation.gamma * (Math.PI / 180);
          cameraRef.current.rotation.z = rotation.alpha * (Math.PI / 180);
        }
      }

      rendererRef.current.render(sceneRef.current, cameraRef.current);

      // Request next frame using the global window object
      frameId.current = window.requestAnimationFrame(render);
    };

    // Start rendering
    render();
  };

  // Toggle device motion tracking
  const toggleDeviceMotion = () => {
    if (isDeviceMotionActive) {
      DeviceMotion.removeAllListeners();
      setIsDeviceMotionActive(false);
    } else {
      DeviceMotion.addListener(motion => {
        setDeviceMotion(motion);
      });
      DeviceMotion.setUpdateInterval(16); // ~60fps
      setIsDeviceMotionActive(true);
    }
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (frameId.current) {
        window.cancelAnimationFrame(frameId.current);
      }

      if (animationMixerRef.current) {
        animationMixerRef.current = null;
      }

      if (animationClockRef.current) {
        animationClockRef.current.stop();
        animationClockRef.current = null;
      }

      DeviceMotion.removeAllListeners();
    };
  }, []);

  return (
    <View style={styles.container}>
      <GLView
        style={styles.glView}
        onContextCreate={onContextCreate}
      />

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

      {/* Device motion toggle button */}
      <TouchableOpacity
        style={[
          styles.motionButton,
          isDeviceMotionActive && styles.motionButtonActive
        ]}
        onPress={toggleDeviceMotion}
      >
        <Text style={styles.motionButtonText}>
          {isDeviceMotionActive ? 'Disable Motion' : 'Enable Motion'}
        </Text>
      </TouchableOpacity>
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
  motionButton: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  motionButtonActive: {
    backgroundColor: 'rgba(0, 120, 255, 0.8)',
    borderColor: 'white',
  },
  motionButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});
