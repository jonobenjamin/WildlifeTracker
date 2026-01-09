# GPS Field Tracker

A Progressive Web App (PWA) that captures GPS locations and saves observation data as JSON files to GitHub. Can be installed as a mobile app on phones and tablets.

## Features

- 📍 **GPS Location Capture** - High accuracy coordinates with accuracy indicator
- 💾 **JSON Data Storage** - Saves structured observation data to GitHub
- 📱 **Mobile App** - Installable PWA that works like a native app
- 🔄 **Offline Capable** - Service worker for offline functionality
- 🌐 **Cross-Platform** - Works on any device with a modern browser
- 👥 **Multi-User Support** - Different users can save to different repositories

## Quick Start

### 1. Host on GitHub Pages

1. Upload all files to a GitHub repository
2. Go to Repository Settings → Pages
3. Set source to "main" branch and "/root" folder
4. Your app will be available at: `https://yourusername.github.io/repository-name`

### 2. Install as Mobile App

**On Android/iOS:**
1. Open the GitHub Pages URL in your browser
2. Tap "Add to Home Screen" or "Install App"
3. The app will install like a native mobile app

### 3. Configure GitHub Access

1. Create a Personal Access Token:
   - GitHub → Settings → Developer settings → Personal access tokens
   - Give it `repo` permissions

2. In the app, tap Settings and enter:
   - Your GitHub token
   - Repository name (format: `username/repository-name`)
   - Data folder (where to save JSON files)

## How It Works

1. **Capture GPS**: Tap "Capture GPS Location" to get your current position
2. **Review Data**: Check the accuracy and location details
3. **Save & Upload**: Tap "Save & Upload to GitHub" to store the observation

Each observation creates a JSON file like this:

```json
{
  "id": "obs_1640995200123_abc123def",
  "timestamp": "2023-12-31T12:00:00.000Z",
  "location": {
    "latitude": 40.712728,
    "longitude": -74.006015,
    "accuracy": 5.2,
    "altitude": 10.5,
    "speed": null,
    "heading": null
  },
  "device": {
    "userAgent": "Mozilla/5.0...",
    "platform": "MacIntel"
  }
}
```

## Data Storage

- **Repository Structure**: Files are saved to your chosen folder (default: `data/`)
- **File Naming**: `observation_{id}.json`
- **Multi-User**: Different users can configure different repositories
- **Future Migration**: Easy to move to Firebase or other databases later

## Browser Support

Works on all modern browsers with GPS support:
- ✅ Chrome/Chromium (Android, Desktop)
- ✅ Safari (iOS, macOS)
- ✅ Firefox (Android, Desktop)
- ✅ Edge (Windows, Android)

## Offline Usage

The app works offline after the initial load:
- GPS capture works without internet
- Data is stored locally until upload
- Service worker caches the app for offline use

## Development

### Local Testing

```bash
# Start a local server
python -m http.server 8000
# Or use any local server

# Open http://localhost:8000 in your browser
```

### Customization

Edit `index.html` to modify:
- UI styling and colors
- Data fields captured
- GitHub integration settings
- Accuracy requirements

## Deployment Options

### Option 1: GitHub Pages (Free)
- Host directly on GitHub
- Automatic HTTPS
- Custom domain support

### Option 2: Netlify/Vercel (Free tier)
- Drag & drop deployment
- Better performance
- Custom domains included

### Option 3: Your Own Server
- Full control
- Custom backend integration
- Database integration ready

## Privacy & Security

- GitHub token stored locally in browser
- No data sent to third parties
- GPS data only used for observations
- Location permissions required for functionality

## Future Enhancements

- 📊 Data visualization dashboard
- 📷 Photo attachments
- 🗺️ Map integration
- 👥 Team collaboration features
- 🔄 Firebase migration support

## Troubleshooting

### GPS Not Working
- Ensure location permissions are granted
- Try refreshing the page
- Check if GPS is enabled on device

### Upload Failing
- Verify GitHub token has `repo` permissions
- Check repository name format
- Ensure you have write access

### App Not Installing
- Use Chrome on Android for best PWA support
- Ensure you're on HTTPS (required for PWAs)

## License

Open source - modify and distribute as needed.