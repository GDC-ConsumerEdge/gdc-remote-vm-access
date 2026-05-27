FROM google/cloud-sdk:slim

RUN apt-get update && apt-get install -y git curl procps google-cloud-sdk-gke-gcloud-auth-plugin xz-utils && \
    curl -LO "https://nodejs.org/dist/v20.14.0/node-v20.14.0-linux-x64.tar.xz" && \
    echo "fedf8fa73b6f51c4ffcc5da8f86cd1ed381bc9dceae0829832c7d683a78b8e36  node-v20.14.0-linux-x64.tar.xz" | sha256sum -c - && \
    tar -xJf node-v20.14.0-linux-x64.tar.xz -C /usr/local --strip-components=1 --no-same-owner && \
    rm node-v20.14.0-linux-x64.tar.xz && \
    apt-get clean

WORKDIR /app

# Download specific kubectl version (v1.30.0) and verify checksum
RUN curl -LO "https://dl.k8s.io/release/v1.30.0/bin/linux/amd64/kubectl" && \
    echo "7c3807c0f5c1b30110a2ff1e55da1d112a6d0096201f1beb81b269f582b5d1c5  kubectl" | sha256sum -c - && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/

# Download virtctl (Pinned to a specific stable version) and verify checksum
ARG VIRTCTL_VERSION=v1.3.0
RUN echo "Downloading virtctl $VIRTCTL_VERSION..." && \
    curl -L -o virtctl "https://github.com/kubevirt/kubevirt/releases/download/$VIRTCTL_VERSION/virtctl-$VIRTCTL_VERSION-linux-amd64" && \
    echo "c5bc1d0cea095645f3aca4fb86c8e9de27b949f7b06e08873472547596104ab7  virtctl" | sha256sum -c - && \
    chmod +x virtctl

# Clone noVNC (Pinned to tag v1.7.0)
RUN git clone --depth 1 --branch v1.7.0 https://github.com/novnc/noVNC.git noVNC && \
    sed -i 's/<input type="image" alt="Disconnect" src="app\/images\/disconnect.svg"/<input type="image" alt="Back" src="app\/images\/back.svg" id="noVNC_back_button" class="noVNC_button" title="Back to Console" onclick="fetch('\''\/api\/disconnect'\'', {method:'\''POST'\''}).then(() => window.location.href='\''\/'\'')">\n\n            <input type="image" alt="Disconnect" src="app\/images\/disconnect.svg"/' noVNC/vnc.html

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy application files
COPY server.js selection.html entrypoint.sh start-vnc.sh install.sh ./
COPY assets/back.svg ./noVNC/app/images/back.svg

# Ensure scripts are executable
RUN chmod +x entrypoint.sh start-vnc.sh install.sh

# Expose the web port
EXPOSE 8080

# Use the entrypoint script
ENTRYPOINT ["/app/entrypoint.sh"]
