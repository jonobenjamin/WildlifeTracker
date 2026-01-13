import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../App';

export default function SurveyFormScreen() {
  const navigation = useNavigation();
  const [formData, setFormData] = useState({
    species: '',
    count: '',
    behavior: '',
    habitat: '',
    notes: '',
  });

  const handleSubmit = async () => {
    try {
      await addDoc(collection(db, 'observations'), {
        ...formData,
        timestamp: serverTimestamp(),
        userId: 'current-user-id', // You'll get this from auth
      });

      Alert.alert('Success', 'Observation saved successfully!');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to save observation');
      console.error('Submit error:', error);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>New Wildlife Observation</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Species"
          value={formData.species}
          onChangeText={(text) => setFormData({...formData, species: text})}
        />

        <TextInput
          style={styles.input}
          placeholder="Count"
          value={formData.count}
          onChangeText={(text) => setFormData({...formData, count: text})}
          keyboardType="numeric"
        />

        <TextInput
          style={styles.input}
          placeholder="Behavior observed"
          value={formData.behavior}
          onChangeText={(text) => setFormData({...formData, behavior: text})}
          multiline
        />

        <TextInput
          style={styles.input}
          placeholder="Habitat description"
          value={formData.habitat}
          onChangeText={(text) => setFormData({...formData, habitat: text})}
          multiline
        />

        <TextInput
          style={styles.input}
          placeholder="Additional notes"
          value={formData.notes}
          onChangeText={(text) => setFormData({...formData, notes: text})}
          multiline
        />

        <TouchableOpacity style={styles.button} onPress={handleSubmit}>
          <Text style={styles.buttonText}>Save Observation</Text>
        </TouchableOpacity>
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
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  form: {
    padding: 20,
  },
  input: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#27ae60',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});