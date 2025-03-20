import React, { createContext, useState, useContext, ReactNode } from 'react';

// Define model interface
export interface Model {
  id: string;
  name: string;
  url: string;
  description?: string;
}

// Define the context type
interface SharedModelContextType {
  selectedModel: Model | null;
  setSelectedModel: (model: Model | null) => void;
}

// Create the context
const SharedModelContext = createContext<SharedModelContextType | null>(null);

// Provider component
export function SharedModelProvider({ children }: { children: ReactNode }) {
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);

  return (
    <SharedModelContext.Provider 
      value={{ 
        selectedModel, 
        setSelectedModel
      }}
    >
      {children}
    </SharedModelContext.Provider>
  );
}

// Custom hook to use the shared model context
export const useSharedModel = (): SharedModelContextType => {
  const context = useContext(SharedModelContext);
  if (!context) {
    throw new Error('useSharedModel must be used within a SharedModelProvider');
  }
  return context;
};

// Default export for Expo Router
export default function SharedModelContextRoute() {
  return (
    <SharedModelProvider>
      <NoDisplay />
    </SharedModelProvider>
  );
}

// Simple component that doesn't render anything
function NoDisplay() {
  return null;
}
