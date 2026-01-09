# GPS Field Tracker - Cordova APK

A downloadable mobile app built with Apache Cordova that captures GPS locations and saves JSON data to GitHub.

## Features

- 📱 **Native Mobile App** - Real APK that installs on Android phones
- 📍 **GPS Location Capture** - High accuracy coordinates
- 💾 **JSON Data Storage** - Saves to GitHub as JSON files
- 🔄 **Multi-User Support** - Different repositories per user
- 📶 **Offline Capable** - Works without internet after initial load

## Building the APK

### Prerequisites

1. **Node.js** (v14 or higher)
2. **Android Studio** with Android SDK
3. **Java JDK** (v8 or higher)

### Build Steps

```bash
# Install dependencies
npm install

# Add Android platform (if not already added)
npx cordova platform add android

# Build APK
./build-apk.sh
```

The APK will be created at: `platforms/android/app/build/outputs/apk/release/app-release.apk`

## Installation

1. **Transfer APK to Android device**
2. **Enable "Install unknown apps"** in Android settings
3. **Open the APK file** to install
4. **Launch the app** from your app drawer

## Configuration

### GitHub Setup

1. **Create Personal Access Token:**
   - GitHub → Settings → Developer settings → Personal access tokens
   - Generate token with `repo` permissions

2. **Configure in App:**
   - Open the installed app
   - Tap ⚙️ Settings
   - Enter GitHub token and repository name
   - Choose data folder (default: `data`)

## Data Format

Each observation saves as JSON:

```json
{
  "id": "obs_1640995200123_abc123def",
  "timestamp": "2023-12-31T12:00:00.000Z",
  "location": {
    "latitude": 40.712728,
    "longitude": -74.006015,
    "accuracy": 5.2,
    "altitude": 10.5
  },
  "device": {
    "userAgent": "Cordova Android App",
    "platform": "Android"
  }
}
```

## Distribution

- **Upload APK to GitHub Releases** for easy downloading
- **Share APK file directly** with users
- **No app store required** - direct installation

## Development

### Project Structure

```
GPSFieldApp/
├── config.xml          # Cordova configuration
├── www/               # Web assets
│   ├── index.html     # Main app
│   ├── manifest.json  # PWA manifest
│   └── sw.js         # Service worker
├── platforms/         # Platform-specific code
├── plugins/          # Cordova plugins
└── build-apk.sh      # Build script
```

### Modifying the App

Edit files in the `www/` folder:
- `index.html` - Main UI and logic
- `manifest.json` - App metadata
- `sw.js` - Offline functionality

### Adding Plugins

```bash
npx cordova plugin add cordova-plugin-geolocation
```

## Permissions

The app requests:
- **Location access** for GPS coordinates
- **Internet access** for GitHub uploads

## Troubleshooting

### Build Issues

```bash
# Check requirements
npx cordova requirements android

# Clean and rebuild
npx cordova clean android
npx cordova build android
```

### GPS Not Working

- Grant location permissions when prompted
- Try restarting the app
- Check Android location settings

### Upload Issues

- Verify GitHub token has `repo` scope
- Check repository name format
- Ensure write access to repository

## License

Open source - modify and distribute freely.