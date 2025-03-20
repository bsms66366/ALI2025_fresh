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
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout
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
    } catch (error: any) {
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        if (error.response.status === 404) {
          console.error(`Model not found at URL: ${url} (404 error)`);
          throw new Error(`Model not found at specified URL (404 error). Please check if the model exists at: ${url}`);
        } else {
          console.error(`Server error when downloading model: ${error.response.status}`);
          throw new Error(`Server error when downloading model: ${error.response.status}`);
        }
      } else if (error.request) {
        // The request was made but no response was received
        console.error('Network error when downloading model. Please check your internet connection.');
        throw new Error('Network error when downloading model. Please check your internet connection.');
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error(`Error downloading model: ${error.message}`);
        throw new Error(`Error downloading model: ${error.message}`);
      }
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

// Add a default export component to satisfy Expo Router requirements
export default function ModelCacheContextRoute() {
  return (
    <ModelCacheProvider>
      <NoDisplay />
    </ModelCacheProvider>
  );
}

// Simple component that doesn't render anything
function NoDisplay() {
  return null;
}
