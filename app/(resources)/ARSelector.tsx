import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import ARViewComponent from './ARScene';
import ARCameraScene from './ARCameraScene';

export default function ARSelector() {
  const [viewMode, setViewMode] = useState<'standard' | 'ar'>('standard');

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
      </View>
      
      {/* Content area - shows the selected view */}
      <View style={styles.contentContainer}>
        {viewMode === 'standard' ? (
          <ARViewComponent />
        ) : (
          <ARCameraScene />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#2F2F2F',
  },
  modeButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    backgroundColor: '#bcba40',
  },
  activeButton: {
    backgroundColor: '#bcba40',
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
