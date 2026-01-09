#!/bin/bash

echo "🚀 Building GPS Field Tracker APK"
echo "=================================="

# Build the Cordova project
echo "📦 Building Cordova project..."
npx cordova build android --release

if [ -f "platforms/android/app/build/outputs/apk/release/app-release.apk" ]; then
    echo "✅ APK built successfully!"
    APK_PATH="$(pwd)/platforms/android/app/build/outputs/apk/release/app-release.apk"
    echo "📁 APK location: $APK_PATH"

    # Copy to a convenient location
    cp "$APK_PATH" "$(pwd)/GPS-Field-Tracker.apk"
    echo "📋 Also copied to: $(pwd)/GPS-Field-Tracker.apk"

    echo ""
    echo "📱 Installation Instructions:"
    echo "1. Transfer the APK file to your Android device"
    echo "2. Enable 'Install unknown apps' in Android settings"
    echo "3. Open the APK file to install"
    echo ""
    echo "🔗 Download link (after uploading to GitHub Releases):"
    echo "   https://github.com/jonobenjamin/WildlifeTracker/releases/download/v1.0.0/GPS-Field-Tracker.apk"
else
    echo "❌ APK build failed. Check the output above for errors."
    echo ""
    echo "🔧 Troubleshooting:"
    echo "1. Make sure Android SDK is installed"
    echo "2. Check if JAVA_HOME is set"
    echo "3. Try: npx cordova requirements android"
    exit 1
fi