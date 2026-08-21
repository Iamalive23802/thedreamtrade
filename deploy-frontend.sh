#!/bin/bash
# Deployment script for TheDreamTrade CRM Frontend
# Deploys to: crm.thedreamtrade.in

set -e

echo "🚀 Starting TheDreamTrade frontend deployment..."

# Navigate to frontend directory
cd /var/www/thedreamtrade/frontend

# Stop dev server if running to free memory
echo "📦 Stopping dev server to free memory..."
pkill -f "node.*vite.*thedreamtrade" || true
sleep 2

# Clean and build
echo "🔨 Building frontend..."
rm -rf dist
NODE_OPTIONS="--max-old-space-size=400" npm run build

# Deploy to production directory
echo "📤 Deploying to production directory..."
cp -r dist/* /var/www/html/thedreamtrade/

# Reload nginx
echo "🔄 Reloading nginx..."
systemctl reload nginx

echo "✅ Deployment complete! Changes are live on:"
echo "   - https://crm.thedreamtrade.in"
echo ""
echo "💡 Don't forget to hard refresh your browser (Ctrl+Shift+R) to clear cache!"
