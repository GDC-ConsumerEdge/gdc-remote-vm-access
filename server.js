const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const url = require('url');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const WEB_ROOT = path.join(__dirname, 'noVNC');
const TARGET_HOST = '127.0.0.1';
const TARGET_PORT = 5900;

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

const server = http.createServer((req, res) => {
    let pathname = url.parse(req.url).pathname;
    if (pathname === '/') pathname = '/index.html';

    const filename = path.join(WEB_ROOT, pathname);

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
    console.log(`Serving static files from ${WEB_ROOT}`);
    console.log(`Proxying WebSockets to ${TARGET_HOST}:${TARGET_PORT}`);
});
