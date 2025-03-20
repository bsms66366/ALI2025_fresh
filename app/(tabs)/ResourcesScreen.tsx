import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Image, Pressable, ViewStyle, TextStyle, ImageStyle, useWindowDimensions } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';

export default function ResourcesScreen() {
  const { width, height } = useWindowDimensions();
  
  const itemWidth = (width / 3) - 45;
  const imageSize = itemWidth * 0.55;

  const boxBorderStyle: ViewStyle = {
    width: itemWidth,
    aspectRatio: 1,
    borderColor: '#bcba40',
    borderStyle: 'dotted' as const,
    borderRadius: 8,
    borderWidth: 1,
    margin: 10,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 6,
  };

  return (
    <View style={styles.container}>
      {/* First Row */}
      <View style={styles.row}>
        <View style={[boxBorderStyle]}>
          <Pressable onPress={() => WebBrowser.openBrowserAsync('https://placements.bsms.ac.uk/nova/login')}>
            <Image 
              source={require('@/assets/images/interfaceIcons_Artboard18.png')} 
              style={[styles.IconStyle, { width: imageSize, height: imageSize }]} 
            />
            <Text style={styles.titleText}>Admin Area</Text>
          </Pressable>
        </View>
  
        <View style={[boxBorderStyle]}>
          <Pressable onPress={() => router.push("/(resources)/PathPotsScreen")}>
            <Image 
              source={require('../../assets/images/interfaceIcons_Artboard9.png')} 
              style={[styles.IconStyle, { width: imageSize, height: imageSize }]} 
            />
            <Text style={styles.titleText}>Pathology Pots</Text>
          </Pressable>
        </View>
  
        <View style={[boxBorderStyle]}>
          <Pressable onPress={() => router.push("/(resources)/PathPotsScreen")}>
            <Image 
              source={require('../../assets/images/interfaceIcons_Artboard29.png')} 
              style={[styles.IconStyle, { width: imageSize, height: imageSize }]} 
            />
            <Text style={styles.titleText}>Clinical Key</Text>
          </Pressable>
        </View>
      </View>

      {/* Second Row */}
      <View style={styles.row}>
        <View style={[boxBorderStyle]}>
          <Pressable onPress={() => router.push("/ar")}>
            <Image 
              source={require('../../assets/images/interfaceIcons_Artboard39.png')} 
              style={[styles.IconStyle, { width: imageSize, height: imageSize }]} 
            />
            <Text style={styles.titleText}>AR Models</Text>
          </Pressable>
        </View>
  
        <View style={[boxBorderStyle]}>
          <Pressable onPress={() => WebBrowser.openBrowserAsync('https://ali.brighton.domains/360Tour/index.html')}>
            <Image 
              source={require('../../assets/images/interfaceIcons_Artboard28.png')} 
              style={[styles.IconStyle, { width: imageSize, height: imageSize }]} 
            />
            <Text style={styles.titleText}>360 Lab Tour</Text>
          </Pressable>
        </View>
  
        <View style={[boxBorderStyle]}>
          <Pressable onPress={() => WebBrowser.openBrowserAsync('https://universityofsussex.eu.qualtrics.com/jfe/form/SV_egtaH07LwYrxuvP')}>
            <Image 
              source={require('../../assets/images/interfaceIcons_Artboard19.png')} 
              style={[styles.IconStyle, { width: imageSize, height: imageSize }]} 
            />
            <Text style={styles.titleText}>Feedback form</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

type Styles = {
  container: ViewStyle;
  row: ViewStyle;
  IconStyle: ImageStyle;
  titleText: TextStyle;
};

const styles = StyleSheet.create<Styles>({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
  },
  
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 8,
  },
  
  IconStyle: {
    resizeMode: 'contain',
    alignSelf: 'center',
  },

  titleText: {
    fontFamily: 'Helvetica',
    fontSize: 14,
    fontWeight: 'bold',
    color: '#bcba40',
    textAlign: 'center',
    marginTop: 8,
  },
});