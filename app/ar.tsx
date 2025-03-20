import React from 'react';
import { StyleSheet, View } from 'react-native';
import ARViewComponent from './(resources)/ARScene';

export default function ARScreen() {
  return (
    <View style={styles.container}>
      <ARViewComponent />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
});
