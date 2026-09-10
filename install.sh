#!/bin/bash

# install.sh - Installs dependencies for GDC Remote VM Access

set -e

echo "Installing dependencies..."

# 1. Download virtctl
if [ ! -f "./virtctl" ]; then
    echo "Downloading virtctl..."
    VIRTCTL_VERSION=$(curl -s https://api.github.com/repos/kubevirt/kubevirt/releases/latest 2>/dev/null | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' || true)
    if [ -z "$VIRTCTL_VERSION" ]; then
        VIRTCTL_VERSION="v1.3.0"
    fi
    echo "Using version: $VIRTCTL_VERSION"
    curl -L -o virtctl "https://github.com/kubevirt/kubevirt/releases/download/$VIRTCTL_VERSION/virtctl-$VIRTCTL_VERSION-linux-amd64"
    chmod +x virtctl
else
    echo "virtctl already exists."
fi

# 2. Download noVNC (Pinned to v1.7.0)
if [ ! -d "./noVNC" ]; then
    echo "Cloning noVNC (tag v1.7.0)..."
    git clone --depth 1 --branch v1.7.0 https://github.com/novnc/noVNC.git noVNC
else
    echo "noVNC already exists."
fi

# Add Back button to noVNC interface if not already present
if [ -f "./noVNC/vnc.html" ] && ! grep -q "noVNC_back_button" "./noVNC/vnc.html"; then
    echo "Adding Back button to noVNC interface..."
    sed -i 's/<input type="image" alt="Disconnect" src="app\/images\/disconnect.svg"/<input type="image" alt="Back" src="app\/images\/back.svg" id="noVNC_back_button" class="noVNC_button" title="Back to Console" onclick="fetch('\''\/api\/disconnect'\'', {method:'\''POST'\''}).then(() => window.location.href='\''\/'\'')">\n\n            <input type="image" alt="Disconnect" src="app\/images\/disconnect.svg"/' noVNC/vnc.html
fi

if [ -f "assets/back.svg" ] && [ -d "noVNC/app/images" ]; then
    cp assets/back.svg noVNC/app/images/back.svg
fi

# 3. Install ws (WebSocket library for Node.js)
if [ ! -d "./node_modules/ws" ]; then
    echo "Installing ws..."
    npm install --omit=dev
else
    echo "ws already exists."
fi

echo "Installation complete."
echo "You can now run: ./start-vnc.sh <vm-name> [namespace]"
