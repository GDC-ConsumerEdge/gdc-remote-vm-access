# KubeVirt VNC Console

Welcome to the Cloud Shell VNC console for KubeVirt VMs.

## Step 1: Provide VM Details

Please enter your cluster and VM details below. These values will be used to generate the connection command.

<walkthrough-project-setup></walkthrough-project-setup>

**Cluster Name:**
<walkthrough-input-variable name="CLUSTER_NAME" label="Enter cluster name" default-value="my-cluster"></walkthrough-input-variable>

**VM Name:**
<walkthrough-input-variable name="VM_NAME" label="Enter VM name" default-value="windows-vm-1"></walkthrough-input-variable>

**Namespace:**
<walkthrough-input-variable name="NAMESPACE" label="Enter namespace" default-value="default"></walkthrough-input-variable>

## Step 2: Connect to the Cluster

Click the button below to authenticate and start the VNC proxy with your specified details:

```bash
./launch.sh {{project-id}} {{CLUSTER_NAME}} {{VM_NAME}} {{NAMESPACE}}
```

## Step 3: Open the VNC View

Once the command above says "Starting web server", perform the following:

1.  Click the **Web Preview** <walkthrough-web-preview-icon></walkthrough-web-preview-icon> button at the top right.
2.  Select **Preview on port 8080**.
3.  In the new tab, noVNC will open. Click **Connect** to see your VM console.
