const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const url = require('url');
const { exec, spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const WEB_ROOT = path.join(__dirname, 'noVNC');
const TARGET_HOST = '127.0.0.1';
const TARGET_PORT = 5900;

let virtctlProcess = null;
let currentVM = null;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ico': 'image/x-icon',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

function execPromise(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Command failed: ${command}\nError: ${stderr || error.message}`);
                reject(stderr || error.message);
            } else resolve(stdout);
        });
    });
}

async function getProjectId() {
    const project_id = (process.env.GOOGLE_CLOUD_PROJECT || process.env.CLOUDSDK_CORE_PROJECT || await execPromise('gcloud config get-value project')).trim();
    if (!project_id || project_id === '(unset)') {
        throw new Error("Project ID not set. Please set GOOGLE_CLOUD_PROJECT or CLOUDSDK_CORE_PROJECT environment variable.");
    }
    return project_id;
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    let pathname = parsedUrl.pathname;

    // API: Get clusters
    if (pathname === '/api/clusters') {
        try {
            const project_id = await getProjectId();
            const token = (await execPromise('gcloud auth print-access-token')).trim();
            const query = 'avg by ("status","cluster_name")(avg_over_time({"__name__"="edgecontainer.googleapis.com/edge_cluster/connection_status","monitored_resource"="edgecontainer.googleapis.com/EdgeCluster"}[1h]))';
            
            const apiUrl = `https://monitoring.googleapis.com/v1/projects/${project_id}/location/global/prometheus/api/v1/query`;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({ query })
            });
            const data = await response.json();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.toString() }));
        }
        return;
    }

    // API: Get VMs for a cluster
    if (pathname === '/api/vms') {
        const cluster = parsedUrl.query.cluster;
        if (!cluster) {
            res.writeHead(400); res.end('Missing cluster parameter'); return;
        }
        try {
            const project_id = await getProjectId();
            console.log(`Getting credentials for cluster: ${cluster} in project: ${project_id}`);
            await execPromise(`gcloud container fleet memberships get-credentials ${cluster} --project ${project_id} --quiet`);
            const vmsJson = await execPromise('kubectl get gvm -n vm-workloads -o json');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(vmsJson);
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.toString() }));
        }
        return;
    }

    // API: Connect to a VM
    if (pathname === '/api/connect' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { vm, namespace } = JSON.parse(body);
                if (!vm || !namespace) {
                    res.writeHead(400); res.end('Missing vm or namespace'); return;
                }

                if (virtctlProcess) {
                    console.log('Killing existing virtctl process...');
                    virtctlProcess.kill();
                }

                console.log(`Starting virtctl vnc for ${vm} in ${namespace}...`);
                virtctlProcess = spawn('./virtctl', ['vnc', vm, '-n', namespace, '--port', TARGET_PORT, '--proxy-only']);
                currentVM = { vm, namespace };

                virtctlProcess.stdout.on('data', (data) => console.log(`virtctl: ${data}`));
                virtctlProcess.stderr.on('data', (data) => console.error(`virtctl error: ${data}`));

                // Wait a bit for the proxy to start
                setTimeout(() => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                }, 2000);
            } catch (err) {
                res.writeHead(500); res.end(JSON.stringify({ error: err.toString() }));
            }
        });
        return;
    }

    // API: Disconnect
    if (pathname === '/api/disconnect' && req.method === 'POST') {
        if (virtctlProcess) {
            console.log('Disconnecting: Killing virtctl process...');
            virtctlProcess.kill();
            virtctlProcess = null;
            currentVM = null;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // API: Get current status
    if (pathname === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            connected: !!virtctlProcess, 
            vm: currentVM 
        }));
        return;
    }

    // Serve selection UI or noVNC
    if (pathname === '/') pathname = '/selection.html';

    let filename = path.join(__dirname, pathname);
    if (!fs.existsSync(filename)) {
        filename = path.join(WEB_ROOT, pathname);
    }

    fs.exists(filename, (exists) => {
        if (!exists || fs.statSync(filename).isDirectory()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        const ext = path.extname(filename).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filename, (err, content) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error');
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            }
        });
    });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    console.log(`WebSocket connection from ${req.socket.remoteAddress}`);
    
    const target = net.createConnection(TARGET_PORT, TARGET_HOST, () => {
        console.log('Connected to target VNC server');
    });

    target.on('data', (data) => {
        try {
            ws.send(data, { binary: true });
        } catch (e) {
            console.error('Error sending to WS:', e);
            target.end();
        }
    });

    ws.on('message', (msg) => {
        target.write(msg);
    });

    target.on('end', () => {
        console.log('Target disconnected');
        ws.close();
    });

    target.on('error', (err) => {
        console.error('Target connection error:', err);
        target.end();
        ws.close();
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
        target.end();
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        target.end();
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Proxying WebSockets to ${TARGET_HOST}:${TARGET_PORT}`);
    console.log('\x1b[32m%s\x1b[0m', '-------------------------------------------------------');
    console.log('\x1b[32m%s\x1b[0m', 'To access the selection page or VNC session:');
    console.log('\x1b[32m%s\x1b[0m', 'Click "Web Preview" in Cloud Shell and select "Preview on port 8080"');
    console.log('\x1b[32m%s\x1b[0m', '-------------------------------------------------------');
});

