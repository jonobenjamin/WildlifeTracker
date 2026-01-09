import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    id: string;
    timestamp: string;
    accuracy?: number;
    altitude?: number;
  };
}

export default function App() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [githubRepo, setGithubRepo] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const token = await AsyncStorage.getItem('github_token');
      const repo = await AsyncStorage.getItem('github_repo');
      if (token) setGithubToken(token);
      if (repo) setGithubRepo(repo);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveSettings = async () => {
    try {
      await AsyncStorage.setItem('github_token', githubToken);
      await AsyncStorage.setItem('github_repo', githubRepo);
      Alert.alert('Success', 'Settings saved!');
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      return false;
    }
  };

  const captureLocation = async () => {
    setIsLoading(true);
    try {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        Alert.alert('Permission Denied', 'Location permission is required');
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLocation(currentLocation);
      Alert.alert('Success', 'GPS location captured!');
    } catch (error) {
      Alert.alert('Error', 'Failed to get location');
    } finally {
      setIsLoading(false);
    }
  };

  const createGeoJSON = async () => {
    if (!location) {
      Alert.alert('No Location', 'Please capture a GPS location first');
      return;
    }

    if (!githubToken || !githubRepo) {
      Alert.alert('Settings Required', 'Please set GitHub token and repository first');
      return;
    }

    try {
      const feature: GeoJSONFeature = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [location.coords.longitude, location.coords.latitude],
        },
        properties: {
          id: `point_${Date.now()}`,
          timestamp: new Date().toISOString(),
          accuracy: location.coords.accuracy || undefined,
          altitude: location.coords.altitude || undefined,
        },
      };

      const geojson = {
        type: 'FeatureCollection',
        features: [feature],
      };

      const filename = `observation_${Date.now()}.geojson`;
      await uploadToGitHub(filename, JSON.stringify(geojson, null, 2));
      Alert.alert('Success', 'GeoJSON file uploaded to GitHub!');
    } catch (error) {
      Alert.alert('Error', 'Failed to create GeoJSON file');
      console.error(error);
    }
  };

  const uploadToGitHub = async (filename: string, content: string) => {
    const url = `https://api.github.com/repos/${githubRepo}/contents/data/${filename}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Add wildlife observation: ${filename}`,
        content: btoa(content),
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to upload to GitHub');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <StatusBar style="auto" />
      <View style={styles.content}>
        <Text style={styles.title}>Wildlife Tracker</Text>
        <Text style={styles.subtitle}>Capture GPS points as GeoJSON</Text>

        {/* Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>GitHub Settings</Text>
          <Text style={styles.label}>Token:</Text>
          <Text style={styles.input} onPress={() => Alert.prompt('GitHub Token', 'Enter your GitHub personal access token', (text) => setGithubToken(text || ''))}>
            {githubToken ? '••••••••••••••••' : 'Not set'}
          </Text>
          <Text style={styles.label}>Repository:</Text>
          <Text style={styles.input} onPress={() => Alert.prompt('GitHub Repository', 'Enter repository (owner/repo)', (text) => setGithubRepo(text || ''))}>
            {githubRepo || 'Not set'}
          </Text>
          <TouchableOpacity style={styles.button} onPress={saveSettings}>
            <Text style={styles.buttonText}>Save Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Location Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>GPS Location</Text>
          {location ? (
            <View style={styles.locationInfo}>
              <Text>Lat: {location.coords.latitude.toFixed(6)}</Text>
              <Text>Lon: {location.coords.longitude.toFixed(6)}</Text>
              <Text>Accuracy: ±{location.coords.accuracy?.toFixed(1) || 'N/A'}m</Text>
            </View>
          ) : (
            <Text style={styles.noLocation}>No location captured</Text>
          )}
          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={captureLocation}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? 'Getting Location...' : 'Capture GPS'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Upload Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.button, styles.uploadButton]}
            onPress={createGeoJSON}
            disabled={!location || !githubToken || !githubRepo}
          >
            <Text style={styles.buttonText}>Create GeoJSON & Upload</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 30,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  uploadButton: {
    backgroundColor: '#34C759',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  locationInfo: {
    backgroundColor: '#f0f8ff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  noLocation: {
    textAlign: 'center',
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 15,
  },
});
