/**
 * FortranIsRight — Frontend application
 */
(function () {
  'use strict';

  const editor = document.getElementById('editor');
  const lineNumbers = document.getElementById('line-numbers');
  const lineInfo = document.getElementById('line-info');
  const validateBtn = document.getElementById('validate-btn');
  const clearBtn = document.getElementById('clear-btn');
  const sampleBtn = document.getElementById('sample-btn');
  const rulesBtn = document.getElementById('rules-btn');
  const rulesCloseBtn = document.getElementById('rules-close-btn');
  const resultsList = document.getElementById('results-list');
  const summaryEl = document.getElementById('summary');
  const rulesPanel = document.getElementById('rules-panel');
  const rulesList = document.getElementById('rules-list');
  const formSelect = document.getElementById('form-select');
  const standardSelect = document.getElementById('standard-select');
  const filtersEl = document.getElementById('results-filters');

  let currentDiagnostics = [];

  // -- Line numbers --
  function updateLineNumbers() {
    const lines = editor.value.split('\n');
    const count = lines.length;
    let html = '';
    for (let i = 1; i <= count; i++) {
      html += i + '\n';
    }
    lineNumbers.textContent = html;
  }

  function updateLineInfo() {
    const val = editor.value;
    const pos = editor.selectionStart;
    const before = val.substring(0, pos);
    const line = before.split('\n').length;
    const col = pos - before.lastIndexOf('\n');
    lineInfo.textContent = `Line ${line}, Col ${col}`;
  }

  editor.addEventListener('input', updateLineNumbers);
  editor.addEventListener('scroll', () => {
    lineNumbers.scrollTop = editor.scrollTop;
  });
  editor.addEventListener('click', updateLineInfo);
  editor.addEventListener('keyup', updateLineInfo);

  // -- Validate --
  async function validate() {
    const source = editor.value;
    if (!source.trim()) {
      showEmpty('Enter some Fortran code first.');
      return;
    }

    validateBtn.disabled = true;
    validateBtn.textContent = 'Validating...';

    const options = {};
    const formVal = formSelect.value;
    if (formVal === 'fixed') options.fixedForm = true;
    if (formVal === 'free') options.fixedForm = false;
    options.standard = standardSelect.value;

    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, options }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showEmpty(err.error || 'Validation failed.');
        return;
      }

      const data = await res.json();
      currentDiagnostics = data.diagnostics;
      renderSummary(data.summary, data.meta);
      renderResults(data.diagnostics);
      filtersEl.style.display = data.diagnostics.length > 0 ? 'flex' : 'none';
    } catch (err) {
      showEmpty('Network error: ' + err.message);
    } finally {
      validateBtn.disabled = false;
      validateBtn.textContent = 'Validate';
    }
  }

  validateBtn.addEventListener('click', validate);

  // Ctrl+Enter to validate
  editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      validate();
    }
    // Tab inserts spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.value = editor.value.substring(0, start) + '      ' + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + 6;
      updateLineNumbers();
    }
  });

  // -- Render --
  function renderSummary(summary, meta) {
    let html = '';
    if (summary.errors > 0)
      html += `<span class="count"><span class="dot dot-error"></span>${summary.errors} error${summary.errors !== 1 ? 's' : ''}</span>`;
    if (summary.warnings > 0)
      html += `<span class="count"><span class="dot dot-warning"></span>${summary.warnings} warning${summary.warnings !== 1 ? 's' : ''}</span>`;
    if (summary.info > 0)
      html += `<span class="count"><span class="dot dot-info"></span>${summary.info} info</span>`;
    if (summary.style > 0)
      html += `<span class="count"><span class="dot dot-style"></span>${summary.style} style</span>`;
    if (summary.errors === 0 && summary.warnings === 0 && summary.info === 0 && summary.style === 0)
      html = `<span class="count" style="color:var(--green)">All clear</span>`;

    html += `<span class="count" style="margin-left:auto">${meta.fixedForm ? 'Fixed-form' : 'Free-form'} | ${meta.totalLines} lines</span>`;
    summaryEl.innerHTML = html;
  }

  function renderResults(diagnostics) {
    if (diagnostics.length === 0) {
      resultsList.innerHTML = '<div class="success-state">No issues found. Your Fortran code looks correct.</div>';
      return;
    }

    // Get active severity filters
    const activeFilters = new Set();
    filtersEl.querySelectorAll('input:checked').forEach(cb => activeFilters.add(cb.value));

    const filtered = diagnostics.filter(d => activeFilters.has(d.severity));

    if (filtered.length === 0) {
      resultsList.innerHTML = '<div class="empty-state">No results match current filters.</div>';
      return;
    }

    let html = '';
    for (const d of filtered) {
      const loc = `Line ${d.line}${d.column ? ':' + d.column : ''}`;
      html += `
        <div class="result-item" data-line="${d.line}">
          <span class="result-severity severity-${d.severity}">${d.severity}</span>
          <div class="result-body">
            <div class="result-location">${escapeHtml(loc)}</div>
            <div class="result-message">${escapeHtml(d.message)}</div>
            ${d.suggestion ? `<div class="result-suggestion">${escapeHtml(d.suggestion)}</div>` : ''}
          </div>
          <span class="result-rule">${escapeHtml(d.rule)}</span>
        </div>
      `;
    }
    resultsList.innerHTML = html;

    // Click to jump to line
    resultsList.querySelectorAll('.result-item').forEach(item => {
      item.addEventListener('click', () => {
        const line = parseInt(item.dataset.line, 10);
        jumpToLine(line);
      });
    });
  }

  function showEmpty(msg) {
    resultsList.innerHTML = `<div class="empty-state">${escapeHtml(msg)}</div>`;
    summaryEl.innerHTML = '';
    filtersEl.style.display = 'none';
  }

  // Re-render when filters change
  filtersEl.addEventListener('change', () => {
    renderResults(currentDiagnostics);
  });

  // -- Jump to line --
  function jumpToLine(lineNum) {
    const lines = editor.value.split('\n');
    let pos = 0;
    for (let i = 0; i < lineNum - 1 && i < lines.length; i++) {
      pos += lines[i].length + 1;
    }
    editor.focus();
    editor.selectionStart = pos;
    editor.selectionEnd = pos + (lines[lineNum - 1] || '').length;

    // Scroll to line
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 18;
    editor.scrollTop = (lineNum - 5) * lineHeight;
    updateLineInfo();
  }

  // -- Clear --
  clearBtn.addEventListener('click', () => {
    editor.value = '';
    updateLineNumbers();
    showEmpty('Click "Validate" to check your Fortran code.');
    currentDiagnostics = [];
  });

  // -- Sample code --
  const SAMPLE_CODE = `C     SAMPLE FORTRAN 77 PROGRAM WITH INTENTIONAL ISSUES
C     This demonstrates the FortranIsRight validator
C
      PROGRAM SAMPLE
      INTEGER I, J, N
      REAL X, Y, RESULT
      DIMENSION X(100)
C
C     Read input
      READ(5,100) N
  100 FORMAT(I5)
C
C     Check bounds
      IF (N .GT. 100) THEN
        PRINT *, 'N TOO LARGE'
        STOP
      ENDIF
C
C     Compute values
      DO 200 I = 1, N
        X(I) = REAL(I) * 3.14159
  200 CONTINUE
C
C     Nested loops with deep nesting
      DO 300 I = 1, N
        DO 300 J = 1, N
          IF (I .EQ. J) THEN
            RESULT = X(I) ** 2
          ELSE
            RESULT = X(I) + X(J)
          ENDIF
  300 CONTINUE
C
C     Using GOTO (style issue)
      IF (N .EQ. 0) GOTO 999
C
      WRITE(6,400) RESULT
  400 FORMAT(F10.3)
C
  999 CONTINUE
      STOP
      END
`;

  sampleBtn.addEventListener('click', () => {
    editor.value = SAMPLE_CODE;
    updateLineNumbers();
    updateLineInfo();
  });

  // -- Rules panel --
  rulesBtn.addEventListener('click', async () => {
    if (rulesPanel.style.display === 'none') {
      rulesPanel.style.display = '';
      try {
        const res = await fetch('/api/rules');
        const data = await res.json();
        renderRules(data.rules);
      } catch (err) {
        rulesList.innerHTML = '<div class="empty-state">Failed to load rules.</div>';
      }
    } else {
      rulesPanel.style.display = 'none';
    }
  });

  rulesCloseBtn.addEventListener('click', () => {
    rulesPanel.style.display = 'none';
  });

  function renderRules(rules) {
    let html = '';
    for (const r of rules) {
      const stdClass = (r.standard || 'F77').toLowerCase();
      html += `
        <div class="rule-item">
          <div class="rule-header">
            <span class="rule-id">${escapeHtml(r.id)}</span>
            <div class="rule-meta">
              <span class="badge badge-${stdClass}">${escapeHtml(r.standard || 'F77')}</span>
              <span class="result-severity severity-${r.severity || 'warning'}">${r.severity || 'warning'}</span>
            </div>
          </div>
          <div class="rule-name">${escapeHtml(r.name)}</div>
          <div class="rule-desc">${escapeHtml(r.description)}</div>
        </div>
      `;
    }
    rulesList.innerHTML = html;
  }

  // -- Utility --
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // -- Init --
  updateLineNumbers();
})();
