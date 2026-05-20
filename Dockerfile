# Use the Google Cloud SDK image as a base
FROM google/cloud-sdk:slim

# Install Node.js, git, curl, and gke-gcloud-auth-plugin
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs git curl procps google-cloud-sdk-gke-gcloud-auth-plugin && \
    apt-get clean

# Set the working directory
WORKDIR /app

# 1. Download specific kubectl version (v1.30.0)
RUN curl -LO "https://dl.k8s.io/release/v1.30.0/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/

# 2. Download virtctl (using latest stable version from GitHub)
RUN VIRTCTL_VERSION=$(curl -s https://api.github.com/repos/kubevirt/kubevirt/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/') && \
    echo "Downloading virtctl $VIRTCTL_VERSION..." && \
    curl -L -o virtctl "https://github.com/kubevirt/kubevirt/releases/download/$VIRTCTL_VERSION/virtctl-$VIRTCTL_VERSION-linux-amd64" && \
    chmod +x virtctl

# 3. Clone noVNC
RUN git clone --depth 1 https://github.com/novnc/noVNC.git noVNC

# 4. Copy package files and install dependencies
COPY package*.json ./
RUN npm install --only=production

# 5. Copy application files
COPY server.js entrypoint.sh launch.sh start-vnc.sh install.sh ./

# Ensure scripts are executable
RUN chmod +x entrypoint.sh launch.sh start-vnc.sh install.sh

# Expose the web port
EXPOSE 8080

# Use the entrypoint script
ENTRYPOINT ["/app/entrypoint.sh"]
