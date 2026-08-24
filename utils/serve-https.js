#!/usr/bin/env node
// Minimal HTTPS static server for dist/ using self-signed dev keys.
// Generate keys with: npm run gen-dev-keys
const https = require('https');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', process.argv[2] || 'dist');
const port = Number(process.env.PORT) || 8443;
const keyDir = path.resolve(__dirname, '..', '.dev-keys');
const keyPath = path.join(keyDir, 'dev.key');
const certPath = path.join(keyDir, 'dev.crt');

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.error(`Missing dev keys in ${keyDir}. Run: npm run gen-dev-keys`);
  process.exit(1);
}
if (!fs.existsSync(root)) {
  console.error(`Missing ${root}. Run: npm run build`);
  process.exit(1);
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

const server = https.createServer(
  { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
  (req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'https://localhost').pathname);
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }
    let filePath = path.normalize(path.join(root, urlPath));
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.stat(filePath, (err, stat) => {
      if (!err && stat.isDirectory()) {
        if (!urlPath.endsWith('/')) {
          res.writeHead(301, { Location: urlPath + '/' }).end();
          return;
        }
        filePath = path.join(filePath, 'index.html');
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': mime[ext] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        res.end(data);
      });
    });
  }
);

server.listen(port, '0.0.0.0', () => {
  console.log(`Serving ${root} at https://localhost:${port}/ (self-signed cert)`);
});
