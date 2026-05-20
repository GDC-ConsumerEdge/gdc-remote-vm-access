# KubeVirt VNC Console

Welcome to the Cloud Shell VNC console for KubeVirt VMs. This guide will help you connect to your VM.

## Step 1: Connect to the Cluster

If you arrived here via a link, the environment variables should already be set. Click the button below to authenticate and start the VNC proxy.

<walkthrough-project-setup></walkthrough-project-setup>

```bash
./launch.sh {{project-id}} {{cluster-name}} {{vm-name}} {{namespace}}
```

<walkthrough-footnote>Note: If you don't see your VM name above, ensure the URL parameters were correctly provided.</walkthrough-footnote>

## Step 2: Open the VNC View

Once the command above says "Starting web server", perform the following:

1.  Click the **Web Preview** <walkthrough-web-preview-icon></walkthrough-web-preview-icon> button at the top right.
2.  Select **Preview on port 8080**.
3.  In the new tab, noVNC will open. Click **Connect** to see your VM console.

## Troubleshooting

- **Auth Errors:** Ensure you have `container.fleet.memberships.get-credentials` permissions on the cluster.
- **VM Not Found:** Double check the namespace and VM name in the `launch.sh` command.
- **Port 8080 Busy:** If you have another app running on 8080, you may need to kill it or use `PORT=9000 ./launch.sh ...`.
