#!/bin/bash

# launch.sh - Automated launcher for "Open in Cloud Shell"
# Usage: ./launch.sh <PROJECT_ID> <CLUSTER_NAME> <VM_NAME> [NAMESPACE]

PROJECT_ID=$1
CLUSTER_NAME=$2
VM_NAME=$3
NAMESPACE=$4

# ANSI Color codes for better visibility
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Cloud Shell VNC Launcher...${NC}"

if [ -z "$PROJECT_ID" ] || [ -z "$CLUSTER_NAME" ] || [ -z "$VM_NAME" ]; then
    echo -e "${RED}❌ Error: Missing parameters.${NC}"
    echo "Usage: ./launch.sh <PROJECT_ID> <CLUSTER_NAME> <VM_NAME> [NAMESPACE]"
    echo "This script is intended to be triggered via 'Open in Cloud Shell' URL parameters."
    exit 1
fi

if [ -z "$NAMESPACE" ]; then
    NAMESPACE="default"
fi

# 1. Ensure dependencies are installed
# We check for the artifacts created by install.sh
if [ ! -f "./virtctl" ] || [ ! -d "./noVNC" ] || [ ! -d "./node_modules/ws" ]; then
    echo -e "${YELLOW}📦 Installing dependencies (this may take a few seconds)...${NC}"
    # Ensure install.sh is executable
    chmod +x ./install.sh
    ./install.sh
fi

# 2. Set the project and get credentials
# Using --quiet to avoid interactive prompts
echo -e "${BLUE}🔑 Authenticating to cluster '${CLUSTER_NAME}' in project '${PROJECT_ID}'...${NC}"
gcloud config set project "$PROJECT_ID" --quiet 2>/dev/null
gcloud container fleet memberships get-credentials "$CLUSTER_NAME" --quiet

# 3. Start the VNC bridge
# We use the existing start-vnc.sh to keep logic centralized
echo -e "${GREEN}🌉 Starting VNC bridge for VM '${VM_NAME}' (${NAMESPACE})...${NC}"
chmod +x ./start-vnc.sh
./start-vnc.sh "$VM_NAME" "$NAMESPACE"
