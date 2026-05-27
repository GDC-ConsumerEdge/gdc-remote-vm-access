#!/bin/bash

# entrypoint.sh - Entrypoint for GDC Remote VM Access container

PROJECT_ID=$1
CLUSTER_NAME=$2
VM_NAME=$3
NAMESPACE=$4
PORT=${PORT:-8080}
VNC_PORT=5900

# Function to start the node server
start_server() {
    echo "Starting web server on port $PORT..."
    PORT=$PORT node /app/server.js
}

# Check if we have enough parameters for direct VNC connection
if [ -n "$PROJECT_ID" ] && [ -n "$CLUSTER_NAME" ] && [ -n "$VM_NAME" ]; then
    if [ -z "$NAMESPACE" ]; then
        NAMESPACE="default"
    fi

    echo "Direct connection mode: Authenticating to cluster $CLUSTER_NAME..."
    
    # Set the project explicitly to ensure gcloud is in the right context
    gcloud config set project "$PROJECT_ID" --quiet

    # Get credentials for the cluster
    gcloud container fleet memberships get-credentials "$CLUSTER_NAME" --quiet

    # Start virtctl vnc proxy in background
    echo "Starting virtctl vnc proxy for VM '$VM_NAME' in namespace '$NAMESPACE'..."
    /app/virtctl vnc "$VM_NAME" -n "$NAMESPACE" --port $VNC_PORT --proxy-only &
    VIRT_PID=$!

    # Cleanup on exit
    trap "kill $VIRT_PID 2>/dev/null" EXIT
    
    start_server
else
    echo "Missing parameters for direct connection. Starting in selection mode..."
    # If project ID was provided but not others, set it
    if [ -n "$PROJECT_ID" ]; then
        gcloud config set project "$PROJECT_ID" --quiet
    fi
    start_server
fi
