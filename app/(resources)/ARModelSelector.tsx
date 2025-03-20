import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { useModelCache } from './ModelCacheContext';

// Define model interface
interface Model {
  id: string;
  name: string;
  url: string;
  description?: string;
}

// Props for the component
interface ARModelSelectorProps {
  onModelSelected: (model: Model) => void;
  initialModelId?: string;
}

export default function ARModelSelector({ onModelSelected, initialModelId }: ARModelSelectorProps) {
  // State for models and active model
  const [models, setModels] = useState<Model[]>([]);
  const [activeModelId, setActiveModelId] = useState<string | null>(initialModelId || null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Get model cache
  const modelCache = useModelCache();

  // Fetch available models
  useEffect(() => {
    const fetchModels = async () => {
      setIsLoading(true);
      try {
        // Example hardcoded models - in a real app, you would fetch these from an API
        const availableModels: Model[] = [
          {
            id: 'pharynx',
            name: 'Pharynx and Floor of Mouth',
            url: 'https://placements.bsms.ac.uk/storage/pharynx_and_floor_of_mouth.glb',
            description: 'Detailed model of the pharynx and floor of mouth'
          },
          {
            id: 'larynx',
            name: 'Larynx',
            url: 'https://placements.bsms.ac.uk/storage/larynx.glb',
            description: 'Detailed model of the larynx'
          },
          /* {
            id: 'heart',
            name: 'Heart',
            url: 'https://placements.bsms.ac.uk/storage/heart.glb',
            description: 'Detailed model of the heart'
          } */
        ];
        
        setModels(availableModels);
        
        // Set initial active model if not already set
        if (!activeModelId && availableModels.length > 0) {
          setActiveModelId(availableModels[0].id);
          onModelSelected(availableModels[0]);
        } else if (activeModelId) {
          const selectedModel = availableModels.find(model => model.id === activeModelId);
          if (selectedModel) {
            onModelSelected(selectedModel);
          }
        }
      } catch (error) {
        console.error('Error fetching models:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchModels();
  }, [initialModelId]);

  // Handle model selection
  const handleModelSelect = useCallback((model: Model) => {
    setActiveModelId(model.id);
    onModelSelected(model);
    
    // Preload the model data in cache
    modelCache.getModelData(model.url).catch(error => {
      console.error('Error preloading model:', error);
    });
  }, [onModelSelected, modelCache]);

  return (
    <View style={styles.container}>
      <ScrollView 
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {models.map((model) => (
          <TouchableOpacity
            key={model.id}
            style={[
              styles.modelButton,
              activeModelId === model.id && styles.activeModelButton
            ]}
            onPress={() => handleModelSelect(model)}
          >
            <Text 
              style={[
                styles.modelButtonText,
                activeModelId === model.id && styles.activeModelButtonText
              ]}
            >
              {model.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      
      {isLoading && (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading models...</Text>
        </View>
      )}
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  scrollContent: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  modelButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  activeModelButton: {
    backgroundColor: 'rgba(0, 120, 255, 0.8)',
    borderColor: 'white',
  },
  modelButtonText: {
    color: 'white',
    fontWeight: '500',
    fontSize: 14,
  },
  activeModelButtonText: {
    fontWeight: 'bold',
  },
  loadingContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  loadingText: {
    color: 'white',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
  }
});
