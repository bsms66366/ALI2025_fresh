import { StyleSheet, View, Platform, PanResponder, GestureResponderEvent, PanResponderGestureState, TouchableOpacity, Text, Animated, Dimensions } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import { Asset } from 'expo-asset';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import * as THREE from 'three';
import React, { useRef, useState, useEffect, useMemo } from 'react';
import axios from 'axios';

// URL to the model - replace with your actual URL
const MODEL_URL = 'https://placements.bsms.ac.uk/storage/larynx_with_muscles_and_ligaments.glb';

// Type definition for our label data - simplified
interface Label {
  id: string;
  name: string;
  color: string;
  worldPosition: THREE.Vector3; // Original position in 3D space
  meshName?: string; // Name of the mesh this label is associated with
  indicatorPosition?: THREE.Vector3; // Position for the indicator dot
}

// Type for visual indicators
interface VisualIndicator {
  dot: THREE.Mesh;
  line: THREE.Line;
}

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

  // Add loading state
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading 3D model, please wait...');

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
      // Option 1: Load from URL using axios
      const response = await axios.get(MODEL_URL, {
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
          zoomRef.current.scale = Math.max(0.2, Math.min(3.0, newScale)); // Allow range from 0.2x to 3.0x
          
          console.log('Zoom updated to:', zoomRef.current.scale);
          
          // Apply scale to model
          if (model && model.scene) {
            model.scene.scale.set(
              zoomRef.current.scale,
              zoomRef.current.scale,
              zoomRef.current.scale
            );
            
            // Update the model's matrix to ensure proper transformation
            model.scene.updateMatrix();
            model.scene.updateMatrixWorld(true);
            
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
          if (model && model.scene) {
            model.scene.rotation.y = rotationRef.current.y;
            model.scene.rotation.x = rotationRef.current.x;
            
            // Update the model's matrix
            model.scene.updateMatrix();
            model.scene.updateMatrixWorld(true);
            
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
          if (model && model.scene) {
            model.scene.position.x = positionRef.current.x;
            model.scene.position.y = positionRef.current.y;
            
            // Update the model's matrix
            model.scene.updateMatrix();
            model.scene.updateMatrixWorld(true);
            
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

  // State to manage labels
  const [labels, setLabels] = useState<Label[]>([]);
  // State to track if labels are visible
  const [showLabels, setShowLabels] = useState(true);
  // Animation value for label opacity
  const labelOpacity = useRef(new Animated.Value(1)).current;
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  
  // Ref to store visual indicators (dots and lines)
  const indicatorsRef = useRef<Record<string, VisualIndicator>>({});
  
  // Window dimensions for positioning
  const windowWidth = Dimensions.get('window').width;
  const windowHeight = Dimensions.get('window').height;

  // Function to create a visual indicator (dot and line)
  const createVisualIndicator = (label: Label): VisualIndicator | null => {
    if (!sceneRef.current || !label.indicatorPosition) {
      console.log(`Cannot create indicator for ${label.name}: missing scene or position`);
      return null;
    }
    
    console.log(`Creating indicator for ${label.name} at position:`, label.indicatorPosition);
    
    // Create a sphere for the dot indicator with a larger size for better visibility
    const dotGeometry = new THREE.SphereGeometry(0.08, 16, 16);
    const dotMaterial = new THREE.MeshBasicMaterial({ 
      color: label.color,
      transparent: false,
      opacity: 1.0
    });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    
    // Position the dot at a fixed offset from the center for better visibility
    dot.position.copy(label.indicatorPosition);
    dot.visible = false; // Initially hidden
    
    // Create a line from the indicator to the part
    const lineGeometry = new THREE.BufferGeometry();
    // Use a fixed offset for the target position to ensure it's visible
    const targetPosition = new THREE.Vector3(
      label.indicatorPosition.x - 0.2,
      label.indicatorPosition.y - 0.2,
      label.indicatorPosition.z - 0.2
    );
    
    const points = [
      label.indicatorPosition,
      targetPosition
    ];
    
    lineGeometry.setFromPoints(points);
    const lineMaterial = new THREE.LineBasicMaterial({ 
      color: label.color,
      linewidth: 3 // Note: linewidth only works in WebGL 2
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.visible = false; // Initially hidden
    
    // Add to scene
    sceneRef.current.add(dot);
    sceneRef.current.add(line);
    
    console.log(`Created indicator for ${label.name}`);
    
    return { dot, line };
  };

  // Function to show/hide all indicators
  const toggleAllIndicators = (visible: boolean): void => {
    console.log(`${visible ? 'Showing' : 'Hiding'} all indicators`);
    
    Object.entries(indicatorsRef.current).forEach(([labelId, indicator]) => {
      if (indicator.dot) indicator.dot.visible = visible;
      if (indicator.line) indicator.line.visible = visible;
      console.log(`Indicator for ${labelId} visibility set to ${visible}`);
    });
    
    // Request render update
    requestRender();
  };

  // Simplified function to extract labels from model and create indicators
  const extractLabelsFromModel = (modelScene: THREE.Object3D): void => {
    // Create a label for each anatomical part with indicator positions
    const extractedLabels = anatomicalParts.map((part, index) => {
      // Find the mesh in the model if possible
      let targetMesh: THREE.Object3D | null = null;
      let worldPosition: THREE.Vector3 = new THREE.Vector3();
      
      modelScene.traverse((child: THREE.Object3D) => {
        // Try to find a mesh with a name containing our part name (case insensitive)
        if (child instanceof THREE.Mesh && 
            child.name.toLowerCase().includes(part.meshName?.toLowerCase() || '')) {
          targetMesh = child;
          
          // Get the world position of the mesh (center)
          const boundingBox = new THREE.Box3().setFromObject(child);
          boundingBox.getCenter(worldPosition);
        }
      });
      
      // If we couldn't find a specific mesh, use a default position
      if (!worldPosition.x && !worldPosition.y && !worldPosition.z) {
        worldPosition = new THREE.Vector3(0, index * 0.5 - 1, 0);
      }
      
      return {
        id: `label-${index}`,
        name: part.name,
        color: part.color,
        worldPosition: worldPosition,
        meshName: part.meshName,
        indicatorPosition: part.position
      };
    });
    
    setLabels(extractedLabels);
    
    // Create visual indicators for each label
    extractedLabels.forEach(label => {
      const indicator = createVisualIndicator(label);
      if (indicator) {
        indicatorsRef.current[label.id] = indicator;
      }
    });
  };

  // Function to toggle labels visibility
  const toggleLabels = (): void => {
    const newState = !showLabels;
    setShowLabels(newState);
    
    // Animate opacity change
    Animated.timing(labelOpacity, {
      toValue: newState ? 1 : 0,
      duration: 300,
      useNativeDriver: true
    }).start();
    
    // Hide all indicators when labels are hidden
    if (!newState) {
      toggleAllIndicators(false);
      setSelectedLabel(null);
    }
  };

  // Function to request a render update
  const requestRender = (): void => {
    if (glRef.current && sceneRef.current && cameraRef.current && rendererRef.current) {
      // Update the model's matrices to ensure proper transformation
      if (model && model.scene) {
        model.scene.updateMatrixWorld(true);
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
      
      // Fix: Assign to the model variable declared at component scope
      model = await new Promise<GLTF>((resolve, reject) => {
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
      model.scene.traverse((child: THREE.Object3D) => {
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
      model.scene.position.set(0, 0, 0);
      
      // Calculate bounding box
      const box = new THREE.Box3().setFromObject(model.scene);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      
      // Scale model to a reasonable size
      const scale = 2 / maxDim;
      model.scene.scale.set(scale, scale, scale);
      
      // Update zoom reference
      zoomRef.current.scale = scale;
      
      // Center the model by calculating its center and moving it to origin
      box.setFromObject(model.scene); // Recalculate after scaling
      const center = box.getCenter(new THREE.Vector3());
      model.scene.position.set(-center.x, -center.y, -center.z);
      
      // Update matrices
      model.scene.updateMatrix();
      model.scene.updateMatrixWorld(true);
      
      console.log('Model normalized with scale:', scale);
      console.log('Model centered at position:', model.scene.position);
      
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
        scale: model.scene.scale.x,
        lastDistance: 0
      };
      
      // Add the model to the scene
      scene.add(model.scene);
      console.log('Model added to scene with scale:', model.scene.scale.x);
      console.log('Model position in scene:', model.scene.position);

      // Extract labels from the model
      extractLabelsFromModel(model.scene);
      
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
    scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);
    
    // Add a secondary light from another angle for better depth
    const pointLight2 = new THREE.PointLight(0xffffff, 0.8);
    pointLight2.position.set(-5, -2, 2);
    scene.add(pointLight2);

    // Position camera to view the model from the front center
    camera.position.z = 5;
    camera.position.x = 0;
    camera.position.y = 0;
    camera.lookAt(0, 0, 0);

    // Initial render
    renderer.render(scene, camera);
    gl.endFrameEXP();
  };

  // Function to reset model position, rotation and zoom
  const resetModel = (): void => {
    console.log("Resetting model...");
    
    if (model && model.scene) {
      try {
        // First reset position to origin
        model.scene.position.set(0, 0, 0);
        console.log("Reset position to origin");
        
        // Calculate bounding box
        const box = new THREE.Box3().setFromObject(model.scene);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        console.log("Model size:", size, "maxDim:", maxDim);
        
        // Scale model to the original normalized size
        const scale = 2 / maxDim;
        model.scene.scale.set(scale, scale, scale);
        console.log("Set scale to:", scale);
        
        // Update zoom reference
        zoomRef.current.scale = scale;
        
        // Center the model by calculating its center and moving it to origin
        box.setFromObject(model.scene); // Recalculate after scaling
        const center = box.getCenter(new THREE.Vector3());
        model.scene.position.set(-center.x, -center.y, -center.z);
        console.log("Centered model at:", -center.x, -center.y, -center.z);
        
        // Reset rotation
        model.scene.rotation.x = 0;
        model.scene.rotation.y = 0;
        console.log("Reset rotation");
        
        // Reset refs
        positionRef.current = { x: 0, y: 0 };
        rotationRef.current = { x: 0, y: 0 };
        
        // Update matrices
        model.scene.updateMatrix();
        model.scene.updateMatrixWorld(true);
        
        console.log('Model reset to initial position and scale');
      } catch (error) {
        console.error("Error resetting model:", error);
      }
    } else {
      console.error("Cannot reset model: model or model.scene is null");
    }
    
    // Clear selected label
    setSelectedLabel(null);
    
    // Reset all material opacities
    if (model && model.scene) {
      model.scene.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && child.material) {
          const material = child.material as THREE.MeshPhongMaterial;
          material.opacity = 0.95;
        }
      });
    }
    
    // Hide all indicators
    toggleAllIndicators(false);
    
    // Request render update
    requestRender();
    
    console.log("Reset complete");
  };

  // Select a label to highlight its corresponding part
  const selectLabel = (labelId: string): void => {
    console.log(`Selecting label: ${labelId}, previous selection: ${selectedLabel}`);
    
    // If the same label is clicked again, deselect it
    const newSelectedLabel = labelId === selectedLabel ? null : labelId;
    setSelectedLabel(newSelectedLabel);
    
    // Hide all indicators first
    toggleAllIndicators(false);
    
    // Highlight the corresponding model part and show its indicator
    if (model && model.scene) {
      const selectedPart = labels.find(l => l.id === labelId);
      
      if (selectedPart) {
        console.log(`Found selected part: ${selectedPart.name}, meshName: ${selectedPart.meshName}`);
        
        let foundMatchingMesh = false;
        
        model.scene.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh && child.material) {
            const material = child.material as THREE.MeshPhongMaterial;
            
            // Reset all materials to original appearance
            material.opacity = 0.95;
            
            // If this part matches the selected label, highlight it
            if (selectedPart && 
                child.name.toLowerCase().includes(selectedPart.meshName?.toLowerCase() || '')) {
              console.log(`Highlighting mesh: ${child.name}`);
              material.opacity = 1.0; // Full opacity for selected parts
              foundMatchingMesh = true;
            } else if (selectedPart) {
              material.opacity = 0.5; // Dim other parts
            }
          }
        });
        
        if (!foundMatchingMesh) {
          console.log(`Warning: No matching mesh found for ${selectedPart.name}`);
        }
      }
      
      // Show indicator for the selected label
      if (newSelectedLabel && indicatorsRef.current[newSelectedLabel]) {
        const indicator = indicatorsRef.current[newSelectedLabel];
        console.log(`Showing indicator for ${newSelectedLabel}`);
        indicator.dot.visible = true;
        indicator.line.visible = true;
      } else if (newSelectedLabel) {
        console.log(`Warning: No indicator found for ${newSelectedLabel}`);
      }
      
      requestRender();
    } else {
      console.error("Cannot select label: model or model.scene is null");
    }
  };

  return (
    <View style={styles.container}>
      <GLView
        style={styles.glView}
        onContextCreate={onContextCreate}
      />
      
      <View style={styles.touchHandler} {...panResponder.panHandlers} />
      
      {/* Loading overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>{loadingMessage}</Text>
        </View>
      )}
      
      {/* Simplified labels panel instead of floating labels */}
      {showLabels && (
        <Animated.View style={[styles.labelsPanel, { opacity: labelOpacity }]}>
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
        </Animated.View>
      )}
      
      {/* Control buttons */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity 
          style={styles.controlButton} 
          onPress={toggleLabels}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>
            {showLabels ? 'Hide Labels' : 'Show Labels'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.controlButton} 
          onPress={resetModel}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>Reset View</Text>
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
  touchHandler: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    padding: 20,
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
    top: 10,
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
