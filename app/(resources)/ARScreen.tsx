import { StyleSheet, View, Platform, PanResponder, GestureResponderEvent, PanResponderGestureState, TouchableOpacity, Text, Animated, Dimensions, ScrollView } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import { Asset } from 'expo-asset';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import * as THREE from 'three';
import React, { useRef, useState, useEffect, useMemo } from 'react';
import axios from 'axios';

// Type definition for our label data - simplified
interface Label {
  id: string;
  name: string;
  color: string;
  meshName: string; // Name of the mesh this label is associated with
  position: THREE.Vector3; // Position for the indicator dot
}

// Type for visual indicators
interface VisualIndicator {
  sphere: THREE.Mesh;
  line: THREE.Line;
}

// Type for 3D model data
interface Model3D {
  id: number;
  name: string;
  url: string;
  category: string;
}

export default function ARScreen() {
  let timeout: number;
  // Declare model variable at component scope
  const modelRef = useRef<GLTF | null>(null);
  
  // Add zoom reference for pinch-to-zoom
  const zoomRef = useRef({ scale: 0.05, lastDistance: 0, initialScale: 0.05 });
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

  // Add loading state
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading 3D model, please wait...');
  
  // State for models and active model
  const [models, setModels] = useState<Model3D[]>([]);
  const [activeModelIndex, setActiveModelIndex] = useState(0);
  const [fetchingModels, setFetchingModels] = useState(true);

  // State to track if labels are visible
  const [showLabels, setShowLabels] = useState(true);
  // State to track selected label
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  // State for storing labels
  const [labels, setLabels] = useState<Label[]>([]);
  
  // Ref to store visual indicators (dots and lines)
  const indicatorsRef = useRef<Record<string, VisualIndicator>>({});

  // Anatomical colors and labels mapping
  const anatomicalParts = [
    { name: 'Vocalis Muscle', color: '#8B0000', meshName: 'vocalis_muscle', position: new THREE.Vector3(0.5, 0.2, 0.8) },
    { name: 'Lateral Cricoarytenoid Muscle', color: '#A52A2A', meshName: 'lateral_cricoarytenoid', position: new THREE.Vector3(-0.5, 0.3, 0.7) },
    { name: 'Posterior Cricoarytenoid Muscle', color: '#CD5C5C', meshName: 'posterior_cricoarytenoid', position: new THREE.Vector3(0, -0.4, 0.6) },
    { name: 'Thyroid Cartilage', color: '#E8E8E8', meshName: 'thyroid_cartilage', position: new THREE.Vector3(0.7, 0, 0.5) },
    { name: 'Cricoid Cartilage', color: '#DCDCDC', meshName: 'cricoid_cartilage', position: new THREE.Vector3(-0.7, -0.2, 0.4) },
    { name: 'Arytenoid Cartilages', color: '#D3D3D3', meshName: 'arytenoid_cartilage', position: new THREE.Vector3(0.3, 0.5, 0.3) },
    { name: 'Cricothyroid Ligament', color: '#FFE4B5', meshName: 'cricothyroid_ligament', position: new THREE.Vector3(-0.3, 0.4, 0.2) },
    { name: 'Vocal Ligament', color: '#DEB887', meshName: 'vocal_ligament', position: new THREE.Vector3(0.4, -0.3, 0.1) },
    { name: 'Mucosa', color: '#FFB6C1', meshName: 'mucosa', position: new THREE.Vector3(-0.4, -0.5, 0) },
  ];

  const getAnatomicalColor = (meshName: string, index: number): string => {
    // If we have a specific part in our mapping, use its color
    const part = anatomicalParts[index % anatomicalParts.length];
    return part ? part.color : '#CCCCCC'; // Default gray if no mapping
  };

  const loadModel = async (): Promise<ArrayBuffer | null> => {
    try {
      if (models.length === 0) {
        console.error('No models available to load');
        return null;
      }
      
      const activeModel = models[activeModelIndex];
      console.log(`Loading model: ${activeModel.name} from ${activeModel.url}`);
      
      // Load from URL using axios
      const response = await axios.get(activeModel.url, {
        responseType: 'arraybuffer'
      });
      console.log('Model loaded from URL successfully');
      return response.data;
    } catch (error) {
      console.error('Error loading model:', error);
      return null;
    }
  };

  // Function to calculate distance between two touches for pinch-to-zoom
  const getDistance = (touches: any[]): number => {
    if (touches.length < 2) return 0;
    
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Function to normalize model size
  const normalizeModel = (modelScene: THREE.Object3D): THREE.Group => {
    // First reset position to ensure we're working from a clean state
    modelScene.position.set(0, 0, 0);
    
    // Calculate bounding box to determine model size
    const box = new THREE.Box3().setFromObject(modelScene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // Scale model to a reasonable size (assuming normalized size is 2 units)
    const scale = 2 / maxDim;
    modelScene.scale.set(scale, scale, scale);
    
    // Update zoom reference to match the normalized scale
    zoomRef.current.scale = scale;
    zoomRef.current.initialScale = scale; // Store the initial scale for reset
    
    // Recalculate bounding box after scaling
    box.setFromObject(modelScene);
    
    // Get center after scaling
    const center = box.getCenter(new THREE.Vector3());
    
    // Create a group to hold the model
    const group = new THREE.Group();
    
    // Add the model to the group with an offset to center it
    group.add(modelScene);
    modelScene.position.set(-center.x, -center.y, -center.z);
    
    // Update the model's matrix
    modelScene.updateMatrix();
    modelScene.updateMatrixWorld(true);
    
    console.log('Model normalized with scale:', scale);
    console.log('Model centered at position:', modelScene.position);
    
    return group;
  };

  // Create pan responder for handling touch gestures
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    
    // Handle gesture start
    onPanResponderGrant: (evt) => {
      const touches = evt.nativeEvent.touches;
      console.log('Touch started with', touches.length, 'fingers');
      
      // Initialize last distance for pinch zoom
      if (touches.length === 2) {
        zoomRef.current.lastDistance = getDistance(touches);
        console.log('Initial pinch distance:', zoomRef.current.lastDistance);
      } 
      // For single touch, track the start time to differentiate between short/long moves
      else if (touches.length === 1) {
        gestureRef.current = {
          mode: 'none', // Will be determined on first move
          initialTouchTime: Date.now()
        };
        console.log('Single touch started, waiting for movement');
      }
    },
    
    onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
      const touches = evt.nativeEvent.touches;
      
      // Handle pinch to zoom with two fingers
      if (touches.length === 2) {
        const currentDistance = getDistance(touches);
        console.log('Pinch gesture - current distance:', currentDistance);
        
        // Calculate zoom change factor
        if (zoomRef.current.lastDistance > 0) {
          const distanceChange = currentDistance - zoomRef.current.lastDistance;
          const scaleFactor = 1 + distanceChange * 0.003; // Reduced sensitivity from 0.01
          
          // Update scale with constraints appropriate for normalized models
          const newScale = zoomRef.current.scale * scaleFactor;
          // Set minimum scale to 20% of initial scale to prevent shrinking too much
          const minScale = zoomRef.current.initialScale * 0.2;
          zoomRef.current.scale = Math.max(minScale, Math.min(3.0, newScale)); // Allow range from minScale to 3.0x
          
          console.log('Zoom updated to:', zoomRef.current.scale);
          
          // Apply scale to model
          if (modelRef.current && modelRef.current.scene) {
            modelRef.current.scene.scale.set(
              zoomRef.current.scale,
              zoomRef.current.scale,
              zoomRef.current.scale
            );
            
            // Update the model's matrix to ensure proper transformation
            modelRef.current.scene.updateMatrix();
            modelRef.current.scene.updateMatrixWorld(true);
            
            // Request render update immediately
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
            console.log('Starting rotation mode');
          } else {
            // Otherwise use pan mode
            gestureRef.current.mode = 'pan';
            console.log('Starting pan mode');
          }
        }
        
        // Apply the appropriate transformation based on mode
        if (gestureRef.current.mode === 'rotate') {
          // Update rotation based on finger movement with reduced sensitivity
          rotationRef.current = {
            y: rotationRef.current.y + gestureState.dx * 0.003, // Reduced sensitivity from 0.01
            x: rotationRef.current.x + gestureState.dy * 0.003, // Reduced sensitivity from 0.01
          };
          
          console.log('Rotation updated to:', rotationRef.current);
          
          // Apply rotation to the model if it exists
          if (modelRef.current && modelRef.current.scene) {
            modelRef.current.scene.rotation.y = rotationRef.current.y;
            modelRef.current.scene.rotation.x = rotationRef.current.x;
            
            // Update the model's matrix
            modelRef.current.scene.updateMatrix();
            modelRef.current.scene.updateMatrixWorld(true);
            
            // Update render without delay for smooth interaction
            requestRender();
          }
        } else if (gestureRef.current.mode === 'pan') {
          // Handle pan with limits to prevent going off screen
          // Calculate new position with an increased movement multiplier
          const newPosX = positionRef.current.x + gestureState.dx * 0.002; // Reduced sensitivity from 0.005
          const newPosY = positionRef.current.y - gestureState.dy * 0.002; // Reduced sensitivity from 0.005, Invert Y for natural movement
          
          console.log('Pan updated to:', newPosX, newPosY);
          
          // Apply position limits to keep model visible
          const positionLimit = 2.0; // Increased limit for more movement range
          positionRef.current = {
            x: Math.max(-positionLimit, Math.min(positionLimit, newPosX)),
            y: Math.max(-positionLimit, Math.min(positionLimit, newPosY)),
          };
          
          // Apply position to the model if it exists
          if (modelRef.current && modelRef.current.scene) {
            modelRef.current.scene.position.x = positionRef.current.x;
            modelRef.current.scene.position.y = positionRef.current.y;
            
            // Update the model's matrix
            modelRef.current.scene.updateMatrix();
            modelRef.current.scene.updateMatrixWorld(true);
            
            // Update render without delay for smooth interaction
            requestRender();
          }
        }
      }
    },
    
    // Handle gesture end
    onPanResponderRelease: () => {
      console.log('Touch gesture ended');
      zoomRef.current.lastDistance = 0;
      gestureRef.current.mode = 'none';
    },
  }), []);  // Added dependency array to useMemo

  // Function to create a visual indicator for a label
  const createVisualIndicator = (label: Label): VisualIndicator => {
    // Create a sphere for the indicator
    const geometry = new THREE.SphereGeometry(0.05, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: label.color,
      transparent: true,
      opacity: 0.8
    });
    
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(label.position);
    sphere.visible = false; // Initially hidden
    
    // Create a line from the model to the indicator
    const lineGeometry = new THREE.BufferGeometry();
    const lineMaterial = new THREE.LineBasicMaterial({
      color: label.color,
      linewidth: 2,
    });
    
    // Create points for the line
    const points = [
      new THREE.Vector3(0, 0, 0), // Will be updated to mesh position
      label.position.clone()
    ];
    
    lineGeometry.setFromPoints(points);
    
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.visible = false; // Initially hidden
    
    // Add to scene
    if (sceneRef.current) {
      sceneRef.current.add(sphere);
      sceneRef.current.add(line);
    }
    
    return { sphere, line };
  };

  // Function to update line positions
  const updateLinePositions = () => {
    if (!modelRef.current || !modelRef.current.scene) return;
    
    // Only update the selected label's line
    if (selectedLabel && indicatorsRef.current[selectedLabel]) {
      const indicator = indicatorsRef.current[selectedLabel];
      const label = labels.find(l => l.id === selectedLabel);
      
      if (!label || !indicator.line) return;
      
      // Find the corresponding mesh in the model
      let targetPosition = new THREE.Vector3();
      let foundMesh = false;
      
      modelRef.current.scene.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && 
            child.name.toLowerCase().includes(label.meshName.toLowerCase())) {
          // Get the world position of the mesh
          child.getWorldPosition(targetPosition);
          foundMesh = true;
        }
      });
      
      // If mesh not found, use model center
      if (!foundMesh) {
        modelRef.current.scene.getWorldPosition(targetPosition);
      }
      
      // Update line geometry
      const points = [
        targetPosition,
        indicator.sphere.position.clone()
      ];
      
      // Update the line geometry
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      indicator.line.geometry.dispose();
      indicator.line.geometry = lineGeometry;
    }
  };

  // Initialize labels from anatomical parts
  const initializeLabels = () => {
    // Create labels from anatomical parts
    const newLabels = anatomicalParts.map((part, index) => ({
      id: `label-${index}`,
      name: part.name,
      color: part.color,
      meshName: part.meshName,
      position: part.position
    }));
    
    setLabels(newLabels);
    
    // Create indicators for all labels
    newLabels.forEach(label => {
      indicatorsRef.current[label.id] = createVisualIndicator(label);
    });
  };

  // Function to toggle labels visibility
  const toggleLabels = (): void => {
    setShowLabels(!showLabels);
    
    // Hide all indicators when labels are hidden
    if (!showLabels) {
      hideAllIndicators();
      setSelectedLabel(null);
    }
  };
  
  // Hide all indicators
  const hideAllIndicators = () => {
    Object.values(indicatorsRef.current).forEach(indicator => {
      if (indicator.sphere) indicator.sphere.visible = false;
      if (indicator.line) indicator.line.visible = false;
    });
    
    // Request render update
    requestRender();
  };

  // Select a label to show its indicator
  const selectLabel = (labelId: string): void => {
    // If the same label is clicked again, deselect it
    if (labelId === selectedLabel) {
      // Hide the current indicator
      const currentIndicator = indicatorsRef.current[labelId];
      if (currentIndicator) {
        currentIndicator.sphere.visible = false;
        currentIndicator.line.visible = false;
      }
      setSelectedLabel(null);
    } else {
      // Hide previous indicator if any
      if (selectedLabel && indicatorsRef.current[selectedLabel]) {
        const prevIndicator = indicatorsRef.current[selectedLabel];
        prevIndicator.sphere.visible = false;
        prevIndicator.line.visible = false;
      }
      
      // Show new indicator
      const newIndicator = indicatorsRef.current[labelId];
      if (newIndicator) {
        newIndicator.sphere.visible = true;
        newIndicator.line.visible = true;
        
        // Update line position
        updateLinePositions();
      }
      
      setSelectedLabel(labelId);
    }
    
    // Request render update
    requestRender();
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
      
      console.log('Render requested and completed');
    } else {
      console.log('Cannot render: missing GL context or scene/camera/renderer');
    }
  };

  const onContextCreate = async (gl: any): Promise<void> => {
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

    console.log('GL context created, renderer initialized');

    try {
      setLoadingMessage('Downloading model...');
      const modelData = await loadModel();
      console.log('Model data received:', modelData ? 'Data available' : 'No data');
      
      if (!modelData) {
        throw new Error('Could not load model data');
      }

      setLoadingMessage('Processing model...');
      const loader = new GLTFLoader();
      
      // For debugging
      loader.setPath('');
      
      // Fix: Assign to the model ref instead of the component-level variable
      modelRef.current = await new Promise<GLTF>((resolve, reject) => {
        loader.parse(
          modelData,
          '',
          resolve,
          reject
        );
      });

      setLoadingMessage('Applying materials...');
      // Replace all materials with anatomically colored materials based on mesh index
      let meshIndex = 0;
      modelRef.current.scene.traverse((child: THREE.Object3D) => {
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
      
      // Update zoom reference
      zoomRef.current.scale = scale;
      zoomRef.current.initialScale = scale; // Store the initial scale for reset
      
      // Center the model by calculating its center and moving it to origin
      box.setFromObject(modelRef.current.scene); // Recalculate after scaling
      const center = box.getCenter(new THREE.Vector3());
      modelRef.current.scene.position.set(-center.x, -center.y, -center.z);
      
      // Update matrices
      modelRef.current.scene.updateMatrix();
      modelRef.current.scene.updateMatrixWorld(true);
      
      console.log('Model normalized with scale:', scale);
      console.log('Model centered at position:', modelRef.current.scene.position);
      
      // Initialize position reference
      positionRef.current = {
        x: 0,
        y: 0
      };
      
      // Initialize rotation reference
      rotationRef.current = {
        x: 0,
        y: 0
      };
      
      // Set initial zoom reference
      zoomRef.current = {
        scale: modelRef.current.scene.scale.x,
        lastDistance: 0,
        initialScale: modelRef.current.scene.scale.x // Preserve the initial scale
      };
      
      // Add the model to the scene
      if (sceneRef.current && modelRef.current) {
        sceneRef.current.add(modelRef.current.scene);
        console.log('Model added to scene with scale:', modelRef.current.scene.scale.x);
        console.log('Model position in scene:', modelRef.current.scene.position);
      }

      // Extract labels from the model
      initializeLabels();
      
      // Model is loaded and ready
      setIsLoading(false);
      
    } catch (error) {
      console.error('Error loading model:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
        setLoadingMessage(`Error loading model: ${error.message}`);
      }
    }

    // Enhance lighting for better material visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Increased intensity
    sceneRef.current.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(5, 5, 5);
    sceneRef.current.add(pointLight);
    
    // Add a secondary light from another angle for better depth
    const pointLight2 = new THREE.PointLight(0xffffff, 0.8);
    pointLight2.position.set(-5, -2, 2);
    sceneRef.current.add(pointLight2);

    // Position camera to view the model from the front center
    cameraRef.current.position.z = 5;
    cameraRef.current.position.x = 0;
    cameraRef.current.position.y = 0;
    cameraRef.current.lookAt(0, 0, 0);

    // Initial render
    rendererRef.current.render(sceneRef.current, cameraRef.current);
    gl.endFrameEXP();
  };

  // Function to apply colors to model parts
  const applyColorsToModel = (modelScene: THREE.Object3D): void => {
    let meshIndex = 0;
    modelScene.traverse((child: THREE.Object3D) => {
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
  };

  // Fetch models from API
  useEffect(() => {
    const fetchModels = async () => {
      try {
        setFetchingModels(true);
        console.log('Fetching models from API...');
        
        // Define hardcoded models as fallback
        const hardcodedModels = [
          {
            id: 1,
            name: 'Larynx',
            url: 'https://placements.bsms.ac.uk/storage/larynx_with_muscles_and_ligaments.glb',
            category: '3D Model'
          },
          {
            id: 2,
            name: 'Pharynx',
            url: 'https://placements.bsms.ac.uk/storage/pharynx_and_floor_of_mouth.glb',
            category: '3D Model'
          }
        ];
        
        try {
          // Try to fetch from API first
          const response = await axios.get('https://placements.bsms.ac.uk/api/physquizzes');
          console.log('API response:', response.data);
          
          // Filter for 3D model category
          const modelData = response.data.filter((item: any) => 
            item.category === '3D Model'
          ).map((item: any) => ({
            id: item.id,
            name: item.name,
            url: item.url || `https://placements.bsms.ac.uk/storage/${item.filename}`,
            category: item.category
          }));
          
          console.log('Filtered models from API:', modelData.length);
          
          if (modelData.length > 0) {
            setModels(modelData);
          } else {
            console.log('No models found in API, using hardcoded models');
            setModels(hardcodedModels);
          }
        } catch (apiError) {
          console.error('Error fetching from API, using hardcoded models:', apiError);
          setModels(hardcodedModels);
        }
      } catch (error) {
        console.error('Error in fetchModels function:', error);
        // Ensure we always have at least the default models
        setModels([
          {
            id: 1,
            name: 'Larynx',
            url: 'https://placements.bsms.ac.uk/storage/larynx_with_muscles_and_ligaments.glb',
            category: '3D Model'
          },
          {
            id: 2,
            name: 'Pharynx',
            url: 'https://placements.bsms.ac.uk/storage/pharynx_and_floor_of_mouth.glb',
            category: '3D Model'
          }
        ]);
      } finally {
        setFetchingModels(false);
      }
    };
    
    fetchModels();
  }, []);

  // Load the model when models are fetched or active model changes
  useEffect(() => {
    if (!fetchingModels && models.length > 0 && glRef.current) {
      loadAndDisplayModel();
    }
  }, [fetchingModels, activeModelIndex, models]);

  // Function to load and display the model
  const loadAndDisplayModel = async () => {
    setIsLoading(true);
    setLoadingMessage('Loading 3D model, please wait...');
    
    // Clear existing model and scene
    if (sceneRef.current) {
      // First, remove all objects from the scene
      while (sceneRef.current.children.length > 0) {
        const object = sceneRef.current.children[0];
        sceneRef.current.remove(object);
      }
      
      // Re-add lights after clearing the scene
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      sceneRef.current.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(1, 1, 1);
      sceneRef.current.add(directionalLight);
      
      console.log('Scene cleared, lights re-added');
    }
    
    // Reset model reference
    modelRef.current = null;
    
    // Clear existing indicators
    Object.values(indicatorsRef.current).forEach(indicator => {
      if (indicator.sphere) indicator.sphere.geometry.dispose();
      if (indicator.sphere && indicator.sphere.material) {
        if (Array.isArray(indicator.sphere.material)) {
          indicator.sphere.material.forEach(m => m.dispose());
        } else {
          indicator.sphere.material.dispose();
        }
      }
      
      if (indicator.line) indicator.line.geometry.dispose();
      if (indicator.line && indicator.line.material) {
        if (Array.isArray(indicator.line.material)) {
          indicator.line.material.forEach(m => m.dispose());
        } else {
          indicator.line.material.dispose();
        }
      }
    });
    indicatorsRef.current = {};
    
    // Load the model
    const modelData = await loadModel();
    if (!modelData) {
      setLoadingMessage('Failed to load model. Please try again.');
      return;
    }
    
    // Parse the model with GLTFLoader
    const loader = new GLTFLoader();
    loader.parse(
      modelData,
      '',
      (gltf) => {
        console.log('Model parsed successfully');
        
        // Store the model reference
        modelRef.current = gltf;
        
        // Normalize and center the model
        const normalizedModel = normalizeModel(gltf.scene);
        
        // Add the model to the scene
        if (sceneRef.current) {
          sceneRef.current.add(normalizedModel);
          
          // Apply colors to the model parts
          applyColorsToModel(normalizedModel);
          
          // Initialize labels for this model
          initializeLabels();
          
          // Hide loading indicator
          setIsLoading(false);
          
          // Request a render update
          requestRender();
          
          console.log('New model added to scene:', models[activeModelIndex].name);
        }
      },
      (error) => {
        console.error('Error parsing model:', error);
        setLoadingMessage('Error loading model. Please try again.');
      }
    );
  };

  // Function to reset model transform (position, rotation, scale)
  const resetModelTransform = () => {
    // Reset model position and rotation
    if (modelRef.current) {
      // Use the initial scale that was calculated when the model was loaded
      const initialScale = zoomRef.current.initialScale;
      
      // Reset position to center
      modelRef.current.scene.position.set(0, 0, 0);
      // Reset rotation
      modelRef.current.scene.rotation.set(0, 0, 0);
      // Reset zoom reference
      zoomRef.current = {
        scale: initialScale,
        lastDistance: 0,
        initialScale: initialScale // Preserve the initial scale
      };
      // Apply the scale to the model
      modelRef.current.scene.scale.set(initialScale, initialScale, initialScale);
      
      // Update the model's matrix
      modelRef.current.scene.updateMatrix();
      modelRef.current.scene.updateMatrixWorld(true);
    } else {
      console.log('Model not available for reset');
    }
    
    // Reset position and rotation references
    positionRef.current = {
      x: 0,
      y: 0
    };
    rotationRef.current = {
      x: 0,
      y: 0
    };
    
    // Hide all indicators
    hideAllIndicators();
    setSelectedLabel(null);
    
    // Request render update
    requestRender();
    console.log('View reset completed');
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timeout) {
        cancelAnimationFrame(timeout);
      }
    };
  }, []);

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {/* Model selector buttons */}
      <View style={styles.modelSelectorContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {models.map((model, index) => (
            <TouchableOpacity
              key={`model-${model.id}-${index}`}
              style={[
                styles.modelButton,
                activeModelIndex === index && styles.activeModelButton
              ]}
              onPress={() => setActiveModelIndex(index)}
            >
              <Text style={[
                styles.modelButtonText,
                activeModelIndex === index && styles.activeModelButtonText
              ]}>
                {model.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      
      {/* GL View for 3D rendering */}
      <GLView
        style={styles.glView}
        onContextCreate={onContextCreate}
      />
      
      {/* Loading indicator */}
      {(isLoading || fetchingModels) && (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{loadingMessage}</Text>
        </View>
      )}
      
      {/* Labels legend */}
      {showLabels && (
        <View style={styles.labelsPanel}>
          {labels.map(label => (
            <TouchableOpacity
              key={label.id}
              style={[
                styles.labelItem,
                selectedLabel === label.id && { backgroundColor: `${label.color}50` }
              ]}
              onPress={() => selectLabel(label.id)}
            >
              <View style={[styles.colorIndicator, { backgroundColor: label.color }]} />
              <Text style={styles.labelText}>{label.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      
      {/* Control buttons */}
      <View style={styles.controlsContainer}>
        {/* Reset button */}
        <TouchableOpacity
          style={styles.controlButton}
          onPress={resetModelTransform}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>Reset View</Text>
        </TouchableOpacity>
        
        {/* Toggle labels button */}
        <TouchableOpacity 
          style={styles.controlButton} 
          onPress={toggleLabels}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>
            {showLabels ? 'Hide Labels' : 'Show Labels'}
          </Text>
        </TouchableOpacity>
      </View>
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
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 10,
  },
  modelSelectorContainer: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  modelButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: '#444',
  },
  activeModelButton: {
    backgroundColor: '#bcba40',
    borderColor: '#FAD607',
  },
  modelButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  activeModelButtonText: {
    color: '#000000',
    fontWeight: 'bold',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  controlButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  labelsPanel: {
    position: 'absolute',
    top: 90, // Moved down to avoid overlap with model selector
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 10,
    padding: 10,
    maxWidth: 200,
    maxHeight: '60%',
  },
  labelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 5,
    marginVertical: 2,
    borderRadius: 5,
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  labelText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
