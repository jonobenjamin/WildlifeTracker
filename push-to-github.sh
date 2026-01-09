#!/bin/bash

echo "🚀 Push GPS Tracker to GitHub"
echo "============================"

# Get GitHub repository details
read -p "Enter your GitHub username: " GITHUB_USERNAME
read -p "Enter repository name (e.g., gps-tracker): " REPO_NAME

# Validate inputs
if [ -z "$GITHUB_USERNAME" ] || [ -z "$REPO_NAME" ]; then
    echo "❌ Error: GitHub username and repository name are required"
    exit 1
fi

echo "📝 Creating GitHub repository URL..."
REPO_URL="https://github.com/$GITHUB_USERNAME/$REPO_NAME.git"

echo "🔗 Adding remote origin: $REPO_URL"
git remote add origin $REPO_URL

echo "📤 Pushing to GitHub..."
git branch -M main
git push -u origin main

echo ""
echo "✅ Success! Your GPS Tracker app is now on GitHub!"
echo ""
echo "📱 Next steps:"
echo "1. Go to: https://github.com/$GITHUB_USERNAME/$REPO_NAME"
echo "2. Add EXPO_TOKEN to repository secrets (Settings → Secrets and variables → Actions)"
echo "3. Create a release: git tag v1.0.0 && git push origin v1.0.0"
echo "4. Download APK from: https://github.com/$GITHUB_USERNAME/$REPO_NAME/releases/latest"
echo ""
echo "🔑 Get your EXPO_TOKEN from: https://expo.dev/settings/access-tokens"