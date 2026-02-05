const http = require('http');
const fs = require('fs');
const path = require('path');
const { registerRoutes } = require('./api/routes');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/**
 * Minimal HTTP server — no Express dependency needed.
 * Serves static files from /public and JSON API from /api.
 */
const server = http.createServer((req, res) => {
  // Parse body for POST requests
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        req.body = JSON.parse(body);
      } catch {
        req.body = {};
      }
      routeRequest(req, res);
    });
    return;
  }

  routeRequest(req, res);
});

function routeRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // API routes
  if (pathname === '/api/validate' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');
    const fakeRes = {
      status(code) { res.statusCode = code; return this; },
      json(data) { res.end(JSON.stringify(data)); },
    };
    const { createValidator } = require('./validator');
    const validator = createValidator();

    const { source, options } = req.body;
    if (typeof source !== 'string') {
      return fakeRes.status(400).json({ error: 'Missing or invalid "source" field.' });
    }
    if (source.length > 500000) {
      return fakeRes.status(400).json({ error: 'Source exceeds 500,000 character limit.' });
    }

    const result = validator.validate(source, options || {});
    const summary = {
      errors: result.diagnostics.filter(d => d.severity === 'error').length,
      warnings: result.diagnostics.filter(d => d.severity === 'warning').length,
      info: result.diagnostics.filter(d => d.severity === 'info').length,
      style: result.diagnostics.filter(d => d.severity === 'style').length,
    };
    return fakeRes.json({ diagnostics: result.diagnostics, meta: result.meta, summary });
  }

  if (pathname === '/api/rules' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    const { createValidator } = require('./validator');
    const validator = createValidator();
    res.end(JSON.stringify({ rules: validator.listRules() }));
    return;
  }

  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);

  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html');
      res.end('<h1>404 Not Found</h1>');
      return;
    }
    res.setHeader('Content-Type', contentType);
    res.end(data);
  });
}

server.listen(PORT, () => {
  console.log(`FortranIsRight validator running at http://localhost:${PORT}`);
});

module.exports = server;
