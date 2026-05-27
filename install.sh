#!/bin/bash

# install.sh - Installs dependencies for GDC Remote VM Access

set -e

echo "Installing dependencies..."

# 1. Download virtctl
if [ ! -f "./virtctl" ]; then
    echo "Downloading virtctl..."
    VIRTCTL_VERSION=$(curl -s https://api.github.com/repos/kubevirt/kubevirt/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    echo "Latest version: $VIRTCTL_VERSION"
    curl -L -o virtctl "https://github.com/kubevirt/kubevirt/releases/download/$VIRTCTL_VERSION/virtctl-$VIRTCTL_VERSION-linux-amd64"
    chmod +x virtctl
else
    echo "virtctl already exists."
fi

# 2. Download noVNC
if [ ! -d "./noVNC" ]; then
    echo "Cloning noVNC..."
    git clone --depth 1 https://github.com/novnc/noVNC.git noVNC
else
    echo "noVNC already exists."
fi

# 3. Install ws (WebSocket library for Node.js)
if [ ! -d "./node_modules/ws" ]; then
    echo "Installing ws..."
    npm install ws
else
    echo "ws already exists."
fi

echo "Installation complete."
echo "You can now run: ./start-vnc.sh <vm-name> [namespace]"
