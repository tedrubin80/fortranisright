const { createValidator } = require('../validator');

const validator = createValidator();

/**
 * POST /api/validate
 * Body: { source: string, options?: { fixedForm?: boolean, standard?: string, disabledRules?: string[] } }
 * Returns: { diagnostics, meta, rules }
 */
function handleValidate(req, res) {
  const { source, options } = req.body;

  if (typeof source !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "source" field. Expected a string of Fortran code.' });
  }

  if (source.length > 500000) {
    return res.status(400).json({ error: 'Source code exceeds maximum length of 500,000 characters.' });
  }

  const result = validator.validate(source, options || {});

  const summary = {
    errors: result.diagnostics.filter(d => d.severity === 'error').length,
    warnings: result.diagnostics.filter(d => d.severity === 'warning').length,
    info: result.diagnostics.filter(d => d.severity === 'info').length,
    style: result.diagnostics.filter(d => d.severity === 'style').length,
  };

  res.json({
    diagnostics: result.diagnostics,
    meta: result.meta,
    summary,
  });
}

/**
 * GET /api/rules
 * Returns the list of all available validation rules.
 */
function handleListRules(req, res) {
  res.json({ rules: validator.listRules() });
}

function registerRoutes(app) {
  app.post('/api/validate', handleValidate);
  app.get('/api/rules', handleListRules);
}

module.exports = { registerRoutes };
