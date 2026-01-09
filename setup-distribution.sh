#!/bin/bash

echo "🚀 GPS Tracker Distribution Setup"
echo "================================="

# Check if we're in the right directory
if [ ! -f "WildlifeTracker/package.json" ]; then
    echo "❌ Error: Please run this script from the wildlife tracking app root directory"
    exit 1
fi

cd WildlifeTracker

echo "📝 Step 1: Installing EAS CLI..."
npm install -g @expo/eas-cli

echo "🔑 Step 2: Login to Expo"
eas login

echo "⚙️  Step 3: Configure EAS project"
eas build:configure

echo "📋 Next steps:"
echo "1. Push this code to GitHub"
echo "2. Update README.md with your actual GitHub username/repo"
echo "3. Add EXPO_TOKEN to GitHub repository secrets"
echo "4. Create a release to trigger automatic APK build"
echo ""
echo "Manual build commands:"
echo "  npm run build:android  # Build APK"
echo ""
echo "🎉 Setup complete! Check the README for detailed distribution instructions."
