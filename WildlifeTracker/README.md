# 🦌 Wildlife Tracker

**Cloud-first Android app for wildlife monitoring and tracking**

## ✨ Why Cloud Development?

- ✅ **No local setup** - Everything runs on GitHub
- ✅ **Automatic builds** - APK generated on every push
- ✅ **Professional CI/CD** - Automated testing & deployment
- ✅ **Easy collaboration** - Code in GitHub, test on phone

## 🚀 Quick Cloud Build

```bash
# Make changes in GitHub web editor or your IDE
# Then run:
./cloud-build.sh

# APK ready in 5-10 minutes!
```

## 📱 What You Get

- 📱 **Android APK** (no Play Store needed)
- 🔐 **Firebase Auth** (username/password)
- 📴 **Offline sync** (works without internet)
- 🔔 **Auto-updates** (APK downloads automatically)
- 📝 **Survey forms** (wildlife observations)
- 🗺️ **GPS tracking** (location monitoring)
- 📸 **Photo capture** (documentation)
- ☁️ **Cloud storage** (Firebase)

## 🔧 Setup (Already Done!)

### ✅ Firebase Project

1. Create a Firebase project at https://console.firebase.google.com/
2. Enable Authentication with Email/Password
3. Enable Firestore Database
4. Enable Storage (for photos)
5. Copy your Firebase config to `firebase.js`

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Firebase

Edit `firebase.js` with your Firebase project configuration:

```javascript
export const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};
```

### 4. Run the App

```bash
npm start
```

For Android development:
```bash
npm run android
```

## Building APK

### Local Build
```bash
npx expo prebuild
npx expo run:android --variant release
```

### Cloud Build
```bash
npx expo build:android
```

## Data Collection Types

Choose based on your wildlife tracking needs:

### Form-Based Collection
- Discrete observations (sightings, counts, behaviors)
- Survey-style data entry
- Best for: Point-in-time wildlife monitoring

### GPS Tracking
- Continuous location monitoring
- Movement patterns and migration
- Best for: Animal tracking collars, range mapping

### Hybrid Approach
- Combine both methods for comprehensive monitoring

## Firebase Security Rules

Add these rules to your Firestore database:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /observations/{document} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
    }

    // Admin access for all users
    match /users/{document} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
  }
}
```

## Update System

Host `latest.json` on your server:

```json
{
  "version": "1.0.1",
  "mandatory": false,
  "apk_url": "https://yourdomain.com/wildlife-tracker_v1.0.1.apk",
  "notes": "Bug fixes and new features"
}
```

## Project Structure

```
WildlifeTracker/
├── src/
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── HomeScreen.tsx
│   │   ├── SurveyFormScreen.tsx
│   │   └── MapScreen.tsx
│   └── components/
├── firebase.js
├── App.tsx
├── app.json
└── package.json
```