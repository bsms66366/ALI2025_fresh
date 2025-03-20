import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, Image, Platform, TouchableOpacity } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer, THREE } from 'expo-three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { ExpoWebGLRenderingContext } from 'expo-gl';
import axios from 'axios';
import { useModelCache } from './ModelCacheContext';
import { useSharedModel, Model } from './SharedModelContext';
import ARModelSelector from './ARModelSelector';

export default function ARCameraScene() {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>('Loading...');
  const [loadingError, setLoadingError] = useState<string | null>(null);
  
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
  const animationFrameRef = useRef<number | null>(null);

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

  // Load the model
  const loadModel = async (url: string) => {
    if (!url) {
      console.error('No model URL provided');
      setLoadingError('No model URL provided');
      return;
    }

    try {
      setLoadingMessage('Downloading model...');
      
      // Use model cache to get the model data
      const modelData = await modelCache.getModelData(url);
      
      if (!modelData) {
        throw new Error('Failed to load model data');
      }
      
      setLoadingMessage('Processing model...');
      
      // Create a loader
      const loader = new GLTFLoader();
      
      // Parse the model data
      loader.parse(
        modelData,
        '',
        (gltf) => {
          console.log('Model loaded from cache or URL successfully');
          modelRef.current = gltf;
          setupModel(gltf);
        },
        (error) => {
          console.error('Error parsing model:', error);
          setLoadingError(`Error parsing model: ${error.message}`);
          setLoadingMessage(null);
        }
      );
    } catch (error: any) {
      console.error('Error loading model:', error);
      setLoadingError(`Error loading model: ${error.message}`);
      setLoadingMessage(null);
    }
  };

  // Setup the model in the scene
  const setupModel = (gltf: GLTF) => {
    if (!sceneRef.current) return;
    
    setLoadingMessage('Applying materials...');
    
    // Add the model to the scene
    sceneRef.current.add(gltf.scene);
    
    // Apply custom materials to each mesh to avoid texture loading issues
    let meshIndex = 0;
    gltf.scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        
        // Create a simple phong material with a default color
        // This avoids texture loading issues
        const colorHex = getMeshColor(mesh.name, meshIndex);
        const material = new THREE.MeshPhongMaterial({
          color: new THREE.Color(colorHex),
          specular: 0x333333,
          shininess: 30,
          flatShading: false,
          transparent: true,
          opacity: 0.95,
        });
        
        // Apply the material to the mesh
        mesh.material = material;
        
        // Enable vertex colors if they exist
        if (mesh.geometry.attributes.color) {
          mesh.material.vertexColors = true;
        }
        
        console.log(`Applied ${colorHex} to mesh: ${mesh.name}`);
        meshIndex++;
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
      console.log(`Model has ${gltf.animations.length} animations`);
      
      // Create a new animation mixer
      const mixer = new THREE.AnimationMixer(gltf.scene);
      animationMixerRef.current = mixer;
      
      // Initialize the clock if needed
      if (!animationClockRef.current) {
        animationClockRef.current = new THREE.Clock();
      }
      animationClockRef.current.start();
      
      // Play all animations
      gltf.animations.forEach((clip, index) => {
        console.log(`Playing animation: ${clip.name || `Animation ${index}`}, duration: ${clip.duration}s`);
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity); // Loop the animation infinitely
        action.clampWhenFinished = false; // Don't clamp at the end
        action.play();
      });
      
      // Start the animation loop
      startAnimationLoop();
    } else {
      console.log('Model has no animations');
    }
    
    setModelLoaded(true);
    setLoadingMessage(null);
  };

  // Function to start the animation loop
  const startAnimationLoop = () => {
    if (!animationFrameRef.current) {
      const animate = () => {
        if (animationMixerRef.current && animationClockRef.current) {
          const delta = animationClockRef.current.getDelta();
          animationMixerRef.current.update(delta);
        }
        
        // Render the scene
        requestRender();
        
        // Continue the animation loop
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      
      // Start the animation loop
      animationFrameRef.current = requestAnimationFrame(animate);
      console.log('Animation loop started');
    }
  };

  // Helper function to get mesh colors
  const getMeshColor = (meshName: string, index: number): string => {
    // Define some anatomical colors
    const anatomicalColors = [
      '#8B0000', // Dark red
      '#A52A2A', // Brown
      '#CD5C5C', // Indian red
      '#E8E8E8', // Light gray
      '#DCDCDC', // Gainsboro
      '#D3D3D3', // Light gray
      '#FFE4B5', // Moccasin
      '#DEB887', // Burlywood
      '#FFB6C1', // Light pink
    ];
    
    // Return a color based on the index, cycling through the array
    return anatomicalColors[index % anatomicalColors.length];
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
      // Update animation if active
      if (animationMixerRef.current && animationClockRef.current) {
        const delta = animationClockRef.current.getDelta();
        animationMixerRef.current.update(delta);
      }
      
      // Render the scene
      renderer.render(scene, camera);
      gl.endFrameEXP();
      
      // Request next frame
      frameId.current = requestAnimationFrame(render);
    };
    
    render();
  };

  const requestRender = () => {
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
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

  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      // Stop animation loop
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Clean up animation mixer
      if (animationMixerRef.current) {
        animationMixerRef.current = null;
      }
      
      // Clean up animation clock
      if (animationClockRef.current) {
        animationClockRef.current = null;
      }
      
      if (frameId.current) {
        cancelAnimationFrame(frameId.current);
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
