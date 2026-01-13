#!/bin/bash

# 🦌 Wildlife Tracker - Cloud Build Script
# Run this to build everything in the cloud!

echo "🦌 Building Wildlife Tracker in the cloud..."
echo ""

# Check if we're in the right directory
if [ ! -d "WildlifeTracker" ]; then
    echo "❌ Error: WildlifeTracker directory not found!"
    echo "Run this script from the project root."
    exit 1
fi

echo "📦 Step 1: Committing changes..."
git add .
git commit -m "Cloud build: $(date)" || echo "No changes to commit"

echo "⬆️ Step 2: Pushing to GitHub..."
git push origin main

echo ""
echo "⏳ Step 3: Waiting for GitHub Actions to build APK..."
echo "Check: https://github.com/jonobenjamin/WildlifeTracker/actions"
echo ""
echo "📱 Your APK will be ready in 5-10 minutes!"
echo "Download from: Actions → Latest run → Artifacts → wildlife-tracker-apk"
echo ""
echo "🎯 Test your app:"
echo "1. Download APK from GitHub Actions"
echo "2. Install on Android device"
echo "3. Login: test@example.com / test123"
echo ""
echo "✅ Cloud build initiated! Check GitHub Actions for progress."