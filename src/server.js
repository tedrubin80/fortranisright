const http = require('http');
const fs = require('fs');
const path = require('path');

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
 *
 * API routes:
 *   POST /api/validate   — Validate Fortran or Pascal code
 *   POST /api/execute     — Execute Pascal code (emulator)
 *   GET  /api/rules       — List all validation rules
 */
const server = http.createServer((req, res) => {
  // Parse body for POST requests
  if (req.method === 'POST') {
    let body = '';
    let bodySize = 0;
    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > 600000) {
        req.destroy();
        return;
      }
      body += chunk;
    });
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

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function routeRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // --- POST /api/validate ---
  if (pathname === '/api/validate' && req.method === 'POST') {
    const { source, language, options } = req.body;

    if (typeof source !== 'string') {
      return sendJson(res, 400, { error: 'Missing or invalid "source" field.' });
    }
    if (source.length > 500000) {
      return sendJson(res, 400, { error: 'Source exceeds 500,000 character limit.' });
    }

    const lang = (language || 'fortran').toLowerCase();
    let validator;

    if (lang === 'pascal') {
      const { createPascalValidator } = require('./pascal');
      validator = createPascalValidator();
    } else {
      const { createValidator } = require('./validator');
      validator = createValidator();
    }

    const result = validator.validate(source, options || {});
    const summary = {
      errors: result.diagnostics.filter(d => d.severity === 'error').length,
      warnings: result.diagnostics.filter(d => d.severity === 'warning').length,
      info: result.diagnostics.filter(d => d.severity === 'info').length,
      style: result.diagnostics.filter(d => d.severity === 'style').length,
    };
    return sendJson(res, 200, { diagnostics: result.diagnostics, meta: result.meta, summary });
  }

  // --- POST /api/execute ---
  if (pathname === '/api/execute' && req.method === 'POST') {
    const { source, input, language } = req.body;

    if (typeof source !== 'string') {
      return sendJson(res, 400, { error: 'Missing or invalid "source" field.' });
    }
    if (source.length > 500000) {
      return sendJson(res, 400, { error: 'Source exceeds 500,000 character limit.' });
    }

    const lang = (language || 'pascal').toLowerCase();

    if (lang !== 'pascal') {
      return sendJson(res, 400, { error: 'Execution is currently supported for Pascal only.' });
    }

    const { PascalInterpreter } = require('./pascal');
    const interpreter = new PascalInterpreter({
      input: typeof input === 'string' ? input : '',
      maxSteps: 200000,
      maxOutput: 100000,
    });

    const result = interpreter.execute(source);
    return sendJson(res, 200, {
      output: result.output,
      errors: result.errors,
      steps: result.steps,
    });
  }

  // --- GET /api/rules ---
  if (pathname === '/api/rules' && req.method === 'GET') {
    const lang = url.searchParams.get('language') || 'all';

    const allRules = [];

    if (lang === 'all' || lang === 'fortran') {
      const { createValidator } = require('./validator');
      const fv = createValidator();
      allRules.push(...fv.listRules().map(r => ({ ...r, language: 'fortran' })));
    }

    if (lang === 'all' || lang === 'pascal') {
      const { createPascalValidator } = require('./pascal');
      const pv = createPascalValidator();
      allRules.push(...pv.listRules().map(r => ({ ...r, language: 'pascal' })));
    }

    return sendJson(res, 200, { rules: allRules });
  }

  // --- Static files ---
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
  console.log(`  Fortran validator: POST /api/validate { language: "fortran" }`);
  console.log(`  Pascal validator:  POST /api/validate { language: "pascal" }`);
  console.log(`  Pascal emulator:   POST /api/execute  { language: "pascal" }`);
});

module.exports = server;
