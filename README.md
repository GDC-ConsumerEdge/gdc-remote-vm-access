# Cloud Shell VNC for KubeVirt

This project allows you to access KubeVirt VM consoles via VNC directly from your browser using Google Cloud Shell. It uses `noVNC` and `a Node.js proxy server` to bridge the VNC connection to a web interface.

## Prerequisites

- Access to a GDC connected cluster with KubeVirt.
- `gcloud` and `kubectl` configured in Cloud Shell.

## Setup

1. Clone or copy these files to your Cloud Shell.
2. Run the installation script:
   ```bash
   ./install.sh
   ```

## Usage (Direct Script)

1. Authenticate to your cluster:
   ```bash
   gcloud container fleet memberships get-credentials $CLUSTER_NAME
   ```

2. Start the VNC bridge:
   ```bash
   ./start-vnc.sh <VM_NAME> [NAMESPACE]
   ```

## Usage (Docker)

You can run the tool as a container. This bundles all dependencies and only requires `docker` to be installed.

### 1. Build the image
```bash
docker build -t gcr.io/gdc-images/cloudshell-vnc .
```

### 2. Run the container
To allow the container to use your Cloud Shell identity, you must mount your `gcloud` configuration directory.

```bash
docker run -it --rm --init -p 8080:8080 \
  -v ~/.config/gcloud:/root/.config/gcloud \
  gcr.io/gdc-images/cloudshell-vnc \
  $PROJECT_ID $CLUSTER_NAME $VM_NAME $NAMESPACE
```

**Note:** The container will automatically run `gcloud container fleet memberships get-credentials` using your mounted credentials.

## Web Interface

Once started (via script or Docker):
- Click the **Web Preview** button (top right of Cloud Shell).
- Select **Preview on port 8080**.
- Your browser will open the noVNC interface.
- Click **Connect** (or it might connect automatically).

## One-Click Launch (Recommended)

You can launch this tool directly from a URL. This is ideal for integration with monitoring dashboards or IDPs.

### 1. The Magic Link
Replace the placeholders in the URL below:

```text
https://shell.google.com/cloudshell/editor?cloudshell_git_repo=https://github.com/YOUR_ORG/cloudshell-vnc&cloudshell_tutorial=cloudshell_tutorial.md&cloudshell_open_command=./launch.sh+PROJECT_ID+CLUSTER_NAME+VM_NAME+NAMESPACE
```

### 2. How it works
- **`cloudshell_git_repo`**: Automatically clones this repository.
- **`cloudshell_tutorial`**: Opens a side panel guide.
- **`cloudshell_open_command`**: Runs the `launch.sh` script automatically, which handles dependency installation and cluster authentication.

### 3. Manual Testing
To test this manually, you can paste a URL like this into your browser (after replacing your specific details):
`https://shell.google.com/cloudshell/editor?cloudshell_git_repo=https://github.com/YOUR_ORG/cloudshell-vnc&cloudshell_open_command=./launch.sh+my-project+my-cluster+my-vm+default`
ll's Web Preview feature provides a secure HTTPS URL to access port 8080.
