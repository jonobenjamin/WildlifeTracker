import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { signOut } from 'firebase/auth';
import { auth } from '../../App';

export default function HomeScreen() {
  const navigation = useNavigation();

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Wildlife Tracker</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.optionsContainer}>
        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => navigation.navigate('SurveyForm')}
        >
          <Text style={styles.optionTitle}>📝 Survey Form</Text>
          <Text style={styles.optionDescription}>
            Record wildlife observations with detailed forms, photos, and location data
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => navigation.navigate('Map')}
        >
          <Text style={styles.optionTitle}>🗺️ GPS Tracking</Text>
          <Text style={styles.optionDescription}>
            View maps, track locations, and manage GPS-based wildlife monitoring
          </Text>
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Choose Your Approach:</Text>
          <Text style={styles.infoText}>
            • <Text style={styles.bold}>Form-based:</Text> Best for discrete observations (sightings, behavioral notes, measurements)
          </Text>
          <Text style={styles.infoText}>
            • <Text style={styles.bold}>GPS Tracking:</Text> Best for monitoring animal movements, migration patterns, or continuous location data
          </Text>
          <Text style={styles.infoText}>
            • <Text style={styles.bold}>Hybrid:</Text> Combine both for comprehensive wildlife monitoring
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  logoutButton: {
    padding: 8,
  },
  logoutText: {
    color: '#e74c3c',
    fontWeight: '600',
  },
  optionsContainer: {
    padding: 20,
  },
  optionCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
  },
  optionDescription: {
    fontSize: 14,
    color: '#6c757d',
    lineHeight: 20,
  },
  infoCard: {
    backgroundColor: '#e3f2fd',
    padding: 20,
    borderRadius: 12,
    marginTop: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#2196f3',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1565c0',
    marginBottom: 15,
  },
  infoText: {
    fontSize: 14,
    color: '#424242',
    lineHeight: 22,
    marginBottom: 8,
  },
  bold: {
    fontWeight: 'bold',
    color: '#1565c0',
  },
});