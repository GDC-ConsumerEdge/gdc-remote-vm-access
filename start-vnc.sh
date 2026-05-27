#!/bin/bash

# start-vnc.sh
# Usage: ./start-vnc.sh <vm-name> [namespace]

VM_NAME=$1
NAMESPACE=$2
PORT=8080
VNC_PORT=5900

if [ -n "$VM_NAME" ]; then
    if [ -z "$NAMESPACE" ]; then
        NAMESPACE=$(kubectl config view --minify -o jsonpath='{..namespace}' 2>/dev/null)
        NAMESPACE=${NAMESPACE:-default}
        echo "Using namespace: $NAMESPACE"
    fi

    # Check if virtctl exists
    if [ ! -f "./virtctl" ]; then
        echo "virtctl not found. Please run install.sh first."
        exit 1
    fi

    # Kill any existing processes
    echo "Cleaning up existing VNC/websockify processes..."
    pkill -f "virtctl vnc" || true
    pkill -f "websockify" || true

    # Start virtctl vnc proxy in background
    echo "Starting virtctl vnc proxy for VM '$VM_NAME' in namespace '$NAMESPACE'..."
    ./virtctl vnc "$VM_NAME" -n "$NAMESPACE" --port $VNC_PORT --proxy-only &
    VIRT_PID=$!

    # Cleanup on exit
    trap "kill $VIRT_PID 2>/dev/null" EXIT
else
    echo "No VM name provided. Skipping VNC proxy startup."
fi

# Start server.js
# It will serve noVNC files from ./noVNC and proxy WS to localhost:VNC_PORT
echo "Starting web server on port $PORT..."
echo "-------------------------------------------------------"
echo "VNC is starting. To access it:"
echo "1. Click the 'Web Preview' button in the top right of Cloud Shell."
echo "2. Select 'Preview on port $PORT'."
echo "3. If it doesn't open vnc.html automatically, append '/vnc.html?autoconnect=true' to the URL."
echo "-------------------------------------------------------"

PORT=$PORT node server.js
