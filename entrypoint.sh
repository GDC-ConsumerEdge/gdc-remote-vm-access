#!/bin/bash

# entrypoint.sh - Entrypoint for Cloud Shell VNC container

PROJECT_ID=$1
CLUSTER_NAME=$2
VM_NAME=$3
NAMESPACE=$4
PORT=${PORT:-8080}
VNC_PORT=5900

if [ -z "$PROJECT_ID" ] || [ -z "$CLUSTER_NAME" ] || [ -z "$VM_NAME" ]; then
    echo "Usage: docker run -it --rm --init ... <PROJECT_ID> <CLUSTER_NAME> <VM_NAME> [NAMESPACE]"
    exit 1
fi

if [ -z "$NAMESPACE" ]; then
    NAMESPACE="default"
    echo "Using default namespace"
fi

echo "Authenticating to cluster: $CLUSTER_NAME in project: $PROJECT_ID..."
# This requires gcloud credentials to be mounted into the container
gcloud container fleet memberships get-credentials "$CLUSTER_NAME" --project "$PROJECT_ID"

# Check if virtctl exists (it should be in /app)
if [ ! -f "/app/virtctl" ]; then
    echo "virtctl not found in /app"
    exit 1
fi

# Kill any existing processes (though unlikely in a fresh container)
pkill -f "virtctl vnc" || true

# Start virtctl vnc proxy in background
echo "Starting virtctl vnc proxy for VM '$VM_NAME' in namespace '$NAMESPACE'..."
/app/virtctl vnc "$VM_NAME" -n "$NAMESPACE" --port $VNC_PORT --proxy-only &
VIRT_PID=$!

# Cleanup on exit
trap "kill $VIRT_PID 2>/dev/null" EXIT

# Start server.js
echo "Starting web server on port $PORT..."
PORT=$PORT node /app/server.js
