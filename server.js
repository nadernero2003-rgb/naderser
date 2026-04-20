/**
 * Simple local server for Church Service App
 * Run: node server.js
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 4000;
const ROOT = __dirname;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.webp': 'image/webp',
};

http.createServer((req, res) => {
    let url = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const filePath = path.join(ROOT, decodeURIComponent(url));

    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found: ' + url); return; }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'text/plain',
            'Cache-Control': 'no-cache',
        });
        res.end(data);
    });
}).listen(PORT, '127.0.0.1', () => {
    console.log('\n✅ الخادم يعمل على: http://localhost:' + PORT);
    console.log('📂 المجلد: ' + ROOT);
    console.log('\nاضغط Ctrl+C للإيقاف\n');
});
