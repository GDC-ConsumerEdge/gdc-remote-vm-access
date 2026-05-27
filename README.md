# GDC Remote VM Access

This project allows you to access GDC VMRuntime (VMR) consoles via VNC directly from your browser using Google Cloud Shell. It uses `noVNC` and a Node.js proxy server to bridge the VNC connection to a web interface.

## Architecture

```mermaid
graph TD
    User([User Browser]) -- "HTTPS/WSS (Web Preview)" --> CS[Cloud Shell Proxy]
    CS -- Port 8080 --> Node[Node.js Server]
    
    subgraph "Cloud Shell Instance / Container"
        Node -- "Spawn / Manage" --> Virtctl[virtctl vnc process]
        Node -- "Auth & Discovery" --> GCloud[gcloud / kubectl]
        Node -- "WebSocket to TCP Bridge" --> Virtctl
    end
    
    GCloud -- "List Clusters/VMs" --> GDC[Google APIs]
    Virtctl -- "K8s API Tunnel" --> GDC
    GDC -- "Console Access" --> VM[Target Virtual Machine]

    style Node fill:#e1f5fe,stroke:#01579b
    style Virtctl fill:#fff3e0,stroke:#e65100
    style GDC fill:#e8f5e9,stroke:#1b5e20
```

## Prerequisites

- Access to a GDC connected cluster with KubeVirt.
- `gcloud` and `kubectl` configured in Cloud Shell.

## Usage (Docker)

You can run the tool as a container. This bundles all dependencies and only requires `docker` to be installed.

### 1. Build and push the image
```bash
export IMAGE_PATH=gcr.io/your-project-id/gdc-remote-vm-access
docker build -t $IMAGE_PATH .
docker push $IMAGE_PATH
```

### 2. Run the container
To allow the container to use your Cloud Shell identity, you must mount your `gcloud` configuration directory.

```bash
docker run -it --rm --init -p 8080:8080 \
  -e GOOGLE_CLOUD_PROJECT \
  -v ~/.config/gcloud:/root/.config/gcloud \
  $IMAGE_PATH
```

**Note:** The container will automatically run `gcloud container fleet memberships get-credentials` using your mounted credentials.

### Web Interface

Once started:
- Click the **Web Preview** button (top right of Cloud Shell).
- Select **Preview on port 8080**.
- The **Selection UI** will open, allowing you to choose your Cluster and VM.
- Once a VM is selected, the VNC session will start.

---

## Local Development

### Local Setup

1. Clone or copy these files to your Cloud Shell.
2. Run the installation script:
   ```bash
   ./install.sh
   ```

### Local Usage (Direct Script)

1. Start the VNC bridge:
   ```bash
   ./start-vnc.sh
   ```

## Disclaimer

This project is not an official Google project. It is not supported by
Google and Google specifically disclaims all warranties as to its quality,
merchantability, or fitness for a particular purpose.