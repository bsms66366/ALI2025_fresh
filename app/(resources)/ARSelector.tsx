import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import ARViewComponent from './ARScene';
import ARCameraScene from './ARCameraScene';
import ARVRScene from './ARVRScene';

export default function ARSelector() {
  const [viewMode, setViewMode] = useState<'standard' | 'ar' | 'vr'>('vr');

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with mode selection buttons */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.modeButton, viewMode === 'standard' && styles.activeButton]}
          onPress={() => setViewMode('standard')}
        >
          <Text style={styles.buttonText}>3D Model</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.modeButton, viewMode === 'ar' && styles.activeButton]}
          onPress={() => setViewMode('ar')}
        >
          <Text style={styles.buttonText}>AR Style</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeButton, viewMode === 'vr' && styles.activeButton]}
          onPress={() => setViewMode('vr')}
        >
          <Text style={styles.buttonText}>VR Style</Text>
        </TouchableOpacity>
      </View>
      
      {/* Content area - shows the selected view */}
      <View style={styles.contentContainer}>
        {viewMode === 'standard' ? (
          <ARViewComponent />
        ) : viewMode === 'ar' ? (
          <ARCameraScene />
        ) : (
          <ARVRScene />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2c3e50',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#34495e',
  },
  modeButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    backgroundColor: '#3498db',
  },
  activeButton: {
    backgroundColor: '#2980b9',
    borderWidth: 2,
    borderColor: '#fff',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  contentContainer: {
    flex: 1,
  },
});
