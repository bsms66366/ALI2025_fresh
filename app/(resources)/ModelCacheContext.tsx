import React, { createContext, useState, useContext, ReactNode } from 'react';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import axios from 'axios';

// Define the model cache entry type
interface ModelCacheEntry {
  data: ArrayBuffer;
  parsed?: GLTF;
  lastAccessed: number;
}

// Define the context type
interface ModelCacheContextType {
  getModelData: (url: string) => Promise<ArrayBuffer>;
  getParsedModel: (url: string) => GLTF | undefined;
  setParsedModel: (url: string, model: GLTF) => void;
  clearCache: () => void;
}

// Create the context
const ModelCacheContext = createContext<ModelCacheContextType | null>(null);

// Maximum cache size (in number of models)
const MAX_CACHE_SIZE = 10;

// Provider component
export const ModelCacheProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Cache state
  const [modelCache, setModelCache] = useState<Record<string, ModelCacheEntry>>({});

  // Function to get model data from cache or download it
  const getModelData = async (url: string): Promise<ArrayBuffer> => {
    // Check if the model is already in cache
    if (modelCache[url]) {
      console.log(`Using cached model data for ${url}`);
      
      // Update last accessed time
      setModelCache(prev => ({
        ...prev,
        [url]: {
          ...prev[url],
          lastAccessed: Date.now()
        }
      }));
      
      return modelCache[url].data;
    }

    // If not in cache, download it
    console.log(`Downloading model from ${url}`);
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer'
      });

      // Manage cache size before adding new entry
      manageCacheSize();

      // Add to cache
      setModelCache(prev => ({
        ...prev,
        [url]: {
          data: response.data,
          lastAccessed: Date.now()
        }
      }));

      return response.data;
    } catch (error) {
      console.error('Error downloading model:', error);
      throw error;
    }
  };

  // Function to get a parsed model from cache
  const getParsedModel = (url: string): GLTF | undefined => {
    if (modelCache[url] && modelCache[url].parsed) {
      console.log(`Using cached parsed model for ${url}`);
      
      // Update last accessed time
      setModelCache(prev => ({
        ...prev,
        [url]: {
          ...prev[url],
          lastAccessed: Date.now()
        }
      }));
      
      return modelCache[url].parsed;
    }
    
    return undefined;
  };

  // Function to store a parsed model in cache
  const setParsedModel = (url: string, model: GLTF): void => {
    if (modelCache[url]) {
      setModelCache(prev => ({
        ...prev,
        [url]: {
          ...prev[url],
          parsed: model,
          lastAccessed: Date.now()
        }
      }));
      console.log(`Stored parsed model for ${url} in cache`);
    }
  };

  // Function to manage cache size
  const manageCacheSize = (): void => {
    const cacheEntries = Object.entries(modelCache);
    
    // If cache is not full yet, do nothing
    if (cacheEntries.length < MAX_CACHE_SIZE) {
      return;
    }
    
    // Sort by last accessed time (oldest first)
    cacheEntries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    // Create new cache without the oldest entry
    const newCache = { ...modelCache };
    delete newCache[cacheEntries[0][0]];
    
    console.log(`Removed oldest model from cache: ${cacheEntries[0][0]}`);
    setModelCache(newCache);
  };

  // Function to clear the entire cache
  const clearCache = (): void => {
    setModelCache({});
    console.log('Model cache cleared');
  };

  return (
    <ModelCacheContext.Provider 
      value={{ 
        getModelData, 
        getParsedModel, 
        setParsedModel, 
        clearCache 
      }}
    >
      {children}
    </ModelCacheContext.Provider>
  );
};

// Custom hook to use the model cache
export const useModelCache = (): ModelCacheContextType => {
  const context = useContext(ModelCacheContext);
  if (!context) {
    throw new Error('useModelCache must be used within a ModelCacheProvider');
  }
  return context;
};
