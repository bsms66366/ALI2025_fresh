import React from 'react';
import { StyleSheet, View } from 'react-native';
import ARSelector from './(resources)/ARSelector';

export default function ARScreen() {
  return (
    <View style={styles.container}>
      <ARSelector />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
});
