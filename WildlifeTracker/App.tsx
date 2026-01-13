import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { View, Text, Alert } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

// Import screens (we'll create these)
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import SurveyFormScreen from './src/screens/SurveyFormScreen';
import MapScreen from './src/screens/MapScreen';

// Firebase
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase config - you'll need to add your own
const firebaseConfig = {
  // Add your Firebase config here
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const Stack = createStackNavigator();

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });

    // Check for updates on app start
    checkForUpdates();

    return unsubscribe;
  }, []);

  const checkForUpdates = async () => {
    try {
      const response = await fetch('https://yourdomain.com/latest.json');
      const latestInfo = await response.json();

      const currentVersion = Constants.expoConfig?.version;
      if (latestInfo.version !== currentVersion) {
        setUpdateInfo(latestInfo);
        setUpdateAvailable(true);

        if (latestInfo.mandatory) {
          Alert.alert(
            'Update Required',
            latestInfo.notes,
            [{ text: 'Update', onPress: () => downloadAndInstallUpdate(latestInfo) }]
          );
        } else {
          Alert.alert(
            'Update Available',
            latestInfo.notes,
            [
              { text: 'Later', style: 'cancel' },
              { text: 'Update', onPress: () => downloadAndInstallUpdate(latestInfo) }
            ]
          );
        }
      }
    } catch (error) {
      console.log('Update check failed:', error);
    }
  };

  const downloadAndInstallUpdate = async (updateInfo: any) => {
    try {
      // For APK updates, we'll need to implement download and install
      // This is platform-specific and would require additional setup
      Alert.alert('Update', 'Update functionality will be implemented with APK download');
    } catch (error) {
      Alert.alert('Error', 'Failed to download update');
    }
  };

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'Wildlife Tracker' }}
        />
        <Stack.Screen
          name="SurveyForm"
          component={SurveyFormScreen}
          options={{ title: 'New Observation' }}
        />
        <Stack.Screen
          name="Map"
          component={MapScreen}
          options={{ title: 'Map View' }}
        />
      </Stack.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}