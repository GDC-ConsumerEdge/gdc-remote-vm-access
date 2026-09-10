#!/bin/bash

# start-vnc.sh
# Usage: ./start-vnc.sh <vm-name> [namespace]

VM_NAME=$1
NAMESPACE=$2
PORT=${PORT:-8080}
VNC_PORT=5900

if [ -n "$VM_NAME" ]; then
    if [ -z "$NAMESPACE" ]; then
        NAMESPACE=$(kubectl config view --minify -o jsonpath='{..namespace}' 2>/dev/null)
        NAMESPACE=${NAMESPACE:-default}
        echo "Using namespace: $NAMESPACE"
    fi

    # Check if virtctl exists
    VIRTCTL_BIN="./virtctl"
    if [ ! -f "$VIRTCTL_BIN" ]; then
        if command -v virtctl >/dev/null 2>&1; then
            VIRTCTL_BIN=$(command -v virtctl)
        elif [ -f "/app/virtctl" ]; then
            VIRTCTL_BIN="/app/virtctl"
        elif [ -f "/usr/local/bin/virtctl" ]; then
            VIRTCTL_BIN="/usr/local/bin/virtctl"
        else
            echo "virtctl not found. Please run install.sh first."
            exit 1
        fi
    fi

    # Kill any existing processes
    echo "Cleaning up existing VNC/websockify processes..."
    pkill -f "virtctl vnc" || true
    pkill -f "websockify" || true

    # Start virtctl vnc proxy in background
    echo "Starting virtctl vnc proxy for VM '$VM_NAME' in namespace '$NAMESPACE' using $VIRTCTL_BIN..."
    "$VIRTCTL_BIN" vnc "$VM_NAME" -n "$NAMESPACE" --port $VNC_PORT --proxy-only &
    VIRT_PID=$!

    # Cleanup on exit
    trap "kill $VIRT_PID 2>/dev/null" EXIT

    export VM_NAME="$VM_NAME"
    export NAMESPACE="$NAMESPACE"
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
