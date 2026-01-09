# GPS Tracker

A simple mobile app that captures GPS locations and saves them as GeoJSON files to GitHub.

## 📱 Download Links

**Latest Release:** [GitHub Releases](https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest)

### Direct Download Links
- 📱 **Android APK**: Available in [Releases](https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest)

## Features

- **GPS Capture**: Capture precise GPS coordinates with accuracy
- **GeoJSON Export**: Creates GeoJSON files with location data
- **GitHub Storage**: Automatically uploads GeoJSON files to your GitHub repository
- **Simple Interface**: One-screen app with minimal setup

## 📋 How It Works

1. **Set up GitHub**: Enter your GitHub personal access token and repository name
2. **Capture GPS**: Tap "Capture GPS" to get your current location
3. **Upload**: Tap "Create GeoJSON & Upload" to save the location as a GeoJSON file
4. **View Data**: Files appear in your GitHub repository under the `data/` folder

## 📊 Sample GeoJSON Output

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-74.006015, 40.712728]
      },
      "properties": {
        "id": "point_1640995200000",
        "timestamp": "2023-12-31T12:00:00.000Z",
        "accuracy": 5.2,
        "altitude": 10.5
      }
    }
  ]
}
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd WildlifeTracker
npm install
```

### 2. Configure GitHub Repository

1. Create a new GitHub repository (public or private)
2. Generate a Personal Access Token:
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Click "Generate new token (classic)"
   - Select scopes: `repo` (full control of private repositories)
   - Copy the token (keep it secure!)

### 3. Configure the App

1. Open the app and go to the Settings tab
2. Enter your GitHub Personal Access Token
3. Enter your repository in format: `username/repository-name`
4. Optionally customize the data path (default: `data/observations`)
5. Tap "Test Connection" to verify settings
6. Tap "Save Settings"

### 4. Run the App

```bash
# For development
npx expo start

# Or run on specific platform
npx expo run:ios
npx expo run:android
```

## How to Use

### Making Observations

1. Open the "Observe" tab
2. Select the wildlife species from the dropdown
3. Enter your name as the enumerator
4. Add any additional observations/items (comma-separated)
5. Tap "Capture GPS Location" to get coordinates
6. Tap "Save Observation"

### Offline Usage

- The app works completely offline
- Observations are stored locally and added to the outbox
- When you regain internet connection, go to the "Outbox" tab and tap "Sync All"

### Managing Outbox

- View all pending observations in the "Outbox" tab
- See sync status and retry counts
- Manually trigger sync with "Sync All" button
- Remove items if needed

## Data Format

Each observation is saved as a JSON file with this structure:

```json
{
  "id": "obs_1640995200000_abc123",
  "species": "White-tailed Deer",
  "items": ["tracks", "scat"],
  "enumerator": "John Doe",
  "location": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "accuracy": 5.2,
    "altitude": 10.5
  },
  "timestamp": "2023-12-31T12:00:00.000Z",
  "synced": true
}
```

## File Structure

```
data/observations/
├── obs_1640995200000_abc123.json
├── obs_1640995260000_def456.json
└── ...
```

## Permissions Required

- **Location**: To capture GPS coordinates for observations
- **Network**: To sync data with GitHub when online

## Troubleshooting

### Location Permissions
- iOS: Settings → Wildlife Tracker → Location → While Using the App
- Android: Settings → Apps → Wildlife Tracker → Permissions → Location

### GitHub Connection Issues
- Verify your Personal Access Token is correct and has `repo` scope
- Check that the repository exists and you have write access
- Ensure repository format is `username/repo-name`

### Sync Failures
- Check internet connection
- Verify GitHub settings are correct
- Look at error messages in the outbox for specific issues

## Development

### Project Structure

```
src/
├── components/          # React components
│   ├── ObservationForm.tsx
│   ├── OutboxScreen.tsx
│   └── SettingsScreen.tsx
├── services/           # Business logic
│   ├── locationService.ts
│   ├── storageService.ts
│   └── syncService.ts
└── types/             # TypeScript definitions
    └── index.ts
```

### Key Services

- **LocationService**: Handles GPS location capture
- **StorageService**: Manages local data storage with AsyncStorage
- **SyncService**: Handles GitHub API integration and syncing

## 🚀 Quick Start

### 1. Set Up GitHub Repository
1. Create a new GitHub repository
2. Generate a Personal Access Token:
   - Go to GitHub → Settings → Developer settings → Personal access tokens
   - Create new token with `repo` permissions
   - Copy the token

### 2. Configure the App
1. Download and install the APK from [Releases](https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest)
2. Open the app and tap on the token/repo fields to set them
3. Enter your GitHub token and repository name (format: `username/repository`)

### 3. Start Tracking
1. Tap "Capture GPS" to get your location
2. Tap "Create GeoJSON & Upload" to save to GitHub
3. Files will appear in your repository under `data/` folder

## 📦 Distribution & Installation

### Android Installation
1. Download the APK from [GitHub Releases](https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest)
2. Enable "Install unknown apps" in Android settings
3. Open the downloaded APK file and install

### Building from Source

#### Prerequisites
```bash
# Install Expo CLI
npm install -g @expo/eas-cli
eas login
```

#### Build APK
```bash
cd WildlifeTracker
eas build:configure
npm run build:android
```

#### Automated Builds
The repository includes GitHub Actions that automatically build APKs when you create releases.

## 📊 GeoJSON Output

Each GPS capture creates a GeoJSON file like this:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-74.006015, 40.712728]
      },
      "properties": {
        "id": "point_1640995200000",
        "timestamp": "2023-12-31T12:00:00.000Z",
        "accuracy": 5.2,
        "altitude": 10.5
      }
    }
  ]
}
```

## ⚙️ Configuration

### GitHub Setup
- **Repository**: Create any public/private GitHub repository
- **Token**: Personal Access Token with `repo` scope
- **Path**: Files are saved to `data/` folder in your repository

### App Permissions
- Location access for GPS coordinates
- Internet access for GitHub uploads

## 🛠️ Development

```bash
# Install dependencies
npm install

# Start development server
npx expo start

# Build for production
npm run build:android
```

## 📝 License

MIT License
