const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const url = require('url');
const { exec, spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = parseInt(process.env.PORT || '8080', 10);
const WEB_ROOT = path.join(__dirname, 'noVNC');
const TARGET_HOST = '127.0.0.1';
const TARGET_PORT = 5900;

let virtctlProcess = null;
let currentVM = null;

// Global process error handlers to prevent unhandled errors from terminating the server and breaking HTTP/2 streams
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
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

function findVirtctl() {
    const candidates = [
        path.join(__dirname, 'virtctl'),
        './virtctl',
        '/app/virtctl',
        '/usr/local/bin/virtctl'
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    return 'virtctl';
}

function sendJson(res, statusCode, data) {
    const payload = JSON.stringify(data);
    const buf = Buffer.from(payload, 'utf8');
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': buf.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Connection': 'keep-alive'
    });
    res.end(buf);
}

function sendJsonString(res, statusCode, jsonString) {
    const buf = Buffer.from(jsonString, 'utf8');
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': buf.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Connection': 'keep-alive'
    });
    res.end(buf);
}

function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8') {
    const buf = Buffer.from(text, 'utf8');
    res.writeHead(statusCode, {
        'Content-Type': contentType,
        'Content-Length': buf.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Connection': 'keep-alive'
    });
    res.end(buf);
}

function waitForVirtctl(child, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
        let stderr = '';
        let timer = null;

        const onStdout = (data) => {
            const str = data.toString();
            // virtctl outputs `{"port":5900}` when the listener is bound and ready
            if (str.includes('"port"') || str.includes(String(TARGET_PORT))) {
                cleanup();
                resolve();
            }
        };

        const onStderr = (data) => {
            stderr += data.toString();
        };

        const onExit = (code, signal) => {
            cleanup();
            reject(new Error(`virtctl exited prematurely with code ${code}.${stderr ? ' Error: ' + stderr.trim() : ''}`));
        };

        const onError = (err) => {
            cleanup();
            reject(new Error(`Failed to spawn virtctl: ${err.message}`));
        };

        const cleanup = () => {
            if (timer) clearTimeout(timer);
            if (child.stdout) child.stdout.removeListener('data', onStdout);
            if (child.stderr) child.stderr.removeListener('data', onStderr);
            child.removeListener('exit', onExit);
            child.removeListener('error', onError);
        };

        timer = setTimeout(() => {
            cleanup();
            if (child.exitCode === null) {
                resolve();
            } else {
                reject(new Error(`Timed out waiting for virtctl to start.${stderr ? ' Error: ' + stderr.trim() : ''}`));
            }
        }, timeoutMs);

        if (child.stdout) child.stdout.on('data', onStdout);
        if (child.stderr) child.stderr.on('data', onStderr);
        child.once('exit', onExit);
        child.once('error', onError);
    });
}

async function isVirtctlRunning() {
    if (virtctlProcess && virtctlProcess.exitCode === null && !virtctlProcess.killed) {
        return true;
    }
    // Only check for an external process if direct mode was configured via environment
    if (process.env.VM_NAME) {
        try {
            const pids = await execPromise('pgrep -x virtctl');
            return pids.trim().length > 0;
        } catch {
            return false;
        }
    }
    return false;
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Connection', 'keep-alive');

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
            sendJson(res, 200, data);
        } catch (err) {
            console.error('Error fetching clusters:', err);
            sendJson(res, 500, { error: err.toString() });
        }
        return;
    }

    // API: Get VMs for a cluster
    if (pathname === '/api/vms') {
        const cluster = parsedUrl.query.cluster;
        if (!cluster) {
            sendJson(res, 400, { error: 'Missing cluster parameter' });
            return;
        }
        try {
            const project_id = await getProjectId();
            console.log(`Getting credentials for cluster: ${cluster} in project: ${project_id}`);
            await execPromise(`gcloud container fleet memberships get-credentials ${cluster} --project ${project_id} --quiet`);
            const vmsJson = await execPromise('kubectl get gvm -n vm-workloads -o json');
            sendJsonString(res, 200, vmsJson);
        } catch (err) {
            console.error(`Error fetching VMs for cluster ${cluster}:`, err);
            sendJson(res, 500, { error: err.toString() });
        }
        return;
    }

    // API: Connect to a VM
    if (pathname === '/api/connect' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { vm, namespace, cluster } = JSON.parse(body || '{}');
                const resolvedNamespace = namespace || 'vm-workloads';
                if (!vm) {
                    sendJson(res, 400, { success: false, error: 'Missing vm parameter' });
                    return;
                }

                if (virtctlProcess) {
                    console.log('Killing existing virtctl process...');
                    try { virtctlProcess.kill('SIGTERM'); } catch (e) {}
                    virtctlProcess = null;
                }

                if (cluster) {
                    try {
                        const project_id = await getProjectId();
                        console.log(`Ensuring credentials for cluster ${cluster} in project ${project_id}...`);
                        await execPromise(`gcloud container fleet memberships get-credentials ${cluster} --project ${project_id} --quiet`);
                    } catch (e) {
                        console.warn(`Could not refresh credentials for cluster ${cluster}:`, e);
                    }
                }

                const virtctlBin = findVirtctl();
                console.log(`Starting virtctl vnc using "${virtctlBin}" for ${vm} in ${resolvedNamespace}...`);
                virtctlProcess = spawn(virtctlBin, ['vnc', vm, '-n', resolvedNamespace, '--port', String(TARGET_PORT), '--proxy-only']);
                currentVM = { vm, namespace: resolvedNamespace };

                virtctlProcess.stdout.on('data', (data) => console.log(`virtctl: ${data}`));
                virtctlProcess.stderr.on('data', (data) => console.error(`virtctl error: ${data}`));
                virtctlProcess.on('error', (err) => {
                    console.error(`virtctl failed to spawn: ${err.message}`);
                });
                virtctlProcess.on('exit', (code, signal) => {
                    console.log(`virtctl process exited with code ${code}, signal ${signal}`);
                    if (virtctlProcess && virtctlProcess.exitCode !== null) {
                        virtctlProcess = null;
                    }
                });

                // Wait for virtctl to signal it is listening
                console.log(`Waiting for virtctl to become ready on port ${TARGET_PORT}...`);
                await waitForVirtctl(virtctlProcess, 20000);
                console.log(`virtctl is ready on port ${TARGET_PORT}.`);

                sendJson(res, 200, { success: true });
            } catch (err) {
                console.error(`Error connecting to VM: ${err.message || err}`);
                sendJson(res, 500, { success: false, error: err.message || err.toString() });
            }
        });
        return;
    }

    // API: Disconnect
    if (pathname === '/api/disconnect' && req.method === 'POST') {
        if (virtctlProcess) {
            console.log('Disconnecting: Killing virtctl process...');
            try { virtctlProcess.kill('SIGTERM'); } catch (e) {}
            virtctlProcess = null;
            currentVM = null;
        }
        if (process.env.VM_NAME) {
            try { await execPromise('pkill -x virtctl'); } catch (e) {}
            delete process.env.VM_NAME;
        }
        sendJson(res, 200, { success: true });
        return;
    }

    // API: Get current status
    if (pathname === '/api/status') {
        const isConnected = await isVirtctlRunning();
        sendJson(res, 200, { 
            connected: isConnected, 
            vm: currentVM || (isConnected && process.env.VM_NAME ? { vm: process.env.VM_NAME, namespace: process.env.NAMESPACE || 'default' } : null)
        });
        return;
    }

    // Serve selection UI or noVNC
    if (pathname === '/') pathname = '/selection.html';

    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    let filename = path.join(__dirname, safePath);
    if (!fs.existsSync(filename)) {
        filename = path.join(WEB_ROOT, safePath);
    }

    try {
        if (!fs.existsSync(filename)) {
            sendText(res, 404, '404 Not Found');
            return;
        }

        const stat = fs.statSync(filename);
        if (stat.isDirectory()) {
            sendText(res, 404, '404 Not Found');
            return;
        }

        const ext = path.extname(filename).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const content = fs.readFileSync(filename);

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': content.length,
            'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
            'Connection': 'keep-alive'
        });
        res.end(content);
    } catch (err) {
        console.error(`Error serving file ${filename}:`, err);
        sendText(res, 500, '500 Internal Server Error');
    }
});

// Configure timeouts for Google Front End (GFE) / Cloud Shell Web Preview reverse proxy.
// GFE idle keep-alive timeout is ~60s; backend keepAliveTimeout must exceed it to avoid ERR_HTTP2_PROTOCOL_ERROR
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

const wss = new WebSocket.Server({
    noServer: true,
    handleProtocols: (protocols) => {
        const hasBinary = protocols instanceof Set 
            ? protocols.has('binary') 
            : Array.isArray(protocols) && protocols.includes('binary');
        if (hasBinary) return 'binary';
        if (protocols && protocols.size > 0) return Array.from(protocols)[0];
        if (Array.isArray(protocols) && protocols.length > 0) return protocols[0];
        return false;
    }
});

server.on('upgrade', (request, socket, head) => {
    socket.on('error', (err) => {
        console.error('Socket error during HTTP upgrade:', err.message);
    });

    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

wss.on('connection', (ws, req) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`WebSocket connection established from ${clientIp}`);

    let target = null;
    let isClosed = false;
    const pendingClientMessages = [];

    const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        if (target) {
            target.removeAllListeners();
            target.destroy();
            target = null;
        }
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            try {
                ws.close(1000, 'Session terminated');
            } catch (e) {}
        }
    };

    target = net.createConnection(TARGET_PORT, TARGET_HOST, () => {
        console.log(`Connected to target VNC server at ${TARGET_HOST}:${TARGET_PORT}`);
        while (pendingClientMessages.length > 0 && target && target.writable) {
            const msg = pendingClientMessages.shift();
            target.write(msg);
        }
    });

    target.on('data', (data) => {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(data, { binary: true });
            } catch (e) {
                console.error('Error sending to WS:', e.message);
                cleanup();
            }
        }
    });

    target.on('end', () => {
        console.log('Target VNC server disconnected (EOF)');
        cleanup();
    });

    target.on('error', (err) => {
        console.error('Target VNC connection error:', err.message);
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.close(1011, 'VNC target connection error');
            } catch (e) {}
        }
        cleanup();
    });

    target.on('close', () => {
        console.log('Target VNC socket closed');
        cleanup();
    });

    ws.on('message', (msg) => {
        if (target && target.writable && target.readyState === 'open') {
            target.write(msg);
        } else if (!isClosed) {
            pendingClientMessages.push(msg);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`WebSocket client disconnected (code: ${code}, reason: ${reason ? reason.toString() : 'none'})`);
        cleanup();
    });

    ws.on('error', (err) => {
        console.error('WebSocket client error:', err.message);
        cleanup();
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on 0.0.0.0:${PORT}`);
    console.log(`Proxying WebSockets to ${TARGET_HOST}:${TARGET_PORT}`);
    console.log('Keep-alive timeouts: keepAliveTimeout=65s, headersTimeout=66s');
    console.log('\x1b[32m%s\x1b[0m', '-------------------------------------------------------');
    console.log('\x1b[32m%s\x1b[0m', 'To access the selection page or VNC session:');
    console.log('\x1b[32m%s\x1b[0m', `Click "Web Preview" in Cloud Shell and select "Preview on port ${PORT}"`);
    console.log('\x1b[32m%s\x1b[0m', '-------------------------------------------------------');
});

