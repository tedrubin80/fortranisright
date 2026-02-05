/**
 * FortranIsRight — Frontend application
 * Supports Fortran validation and Pascal validation + emulation.
 */
(function () {
  'use strict';

  // ---- DOM elements ----
  const editor = document.getElementById('editor');
  const lineNumbers = document.getElementById('line-numbers');
  const lineInfo = document.getElementById('line-info');
  const editorTitle = document.getElementById('editor-title');
  const validateBtn = document.getElementById('validate-btn');
  const executeBtn = document.getElementById('execute-btn');
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
  const pascalStandardSelect = document.getElementById('pascal-standard-select');
  const filtersEl = document.getElementById('results-filters');
  const emulatorPanel = document.getElementById('emulator-panel');
  const emulatorInput = document.getElementById('emulator-input');
  const emulatorOutput = document.getElementById('emulator-output');
  const emulatorErrors = document.getElementById('emulator-errors');
  const emulatorMeta = document.getElementById('emulator-meta');

  let currentLang = 'fortran';
  let currentDiagnostics = [];

  // ---- Language switching ----
  const langTabs = document.querySelectorAll('.lang-tab');
  langTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const lang = tab.dataset.lang;
      if (lang === currentLang) return;
      currentLang = lang;

      // Update tabs
      langTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Toggle lang-specific controls
      document.querySelectorAll('.fortran-only').forEach(el => {
        el.style.display = lang === 'fortran' ? '' : 'none';
      });
      document.querySelectorAll('.pascal-only').forEach(el => {
        el.style.display = lang === 'pascal' ? '' : 'none';
      });

      // Update editor title
      editorTitle.textContent = lang === 'fortran' ? 'Fortran Source Code' : 'Pascal Source Code';

      // Update tab size
      editor.style.tabSize = lang === 'fortran' ? '6' : '2';

      // Clear results
      showEmpty('Click "Validate" to check your code.');
      currentDiagnostics = [];
      emulatorOutput.textContent = '';
      emulatorErrors.innerHTML = '';
      emulatorMeta.textContent = '';

      // Close rules panel
      rulesPanel.style.display = 'none';
    });
  });

  // ---- Line numbers ----
  function updateLineNumbers() {
    const lines = editor.value.split('\n');
    let html = '';
    for (let i = 1; i <= lines.length; i++) {
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

  // ---- Validate ----
  async function validate() {
    const source = editor.value;
    if (!source.trim()) {
      showEmpty('Enter some code first.');
      return;
    }

    validateBtn.disabled = true;
    validateBtn.textContent = 'Validating...';

    const options = {};
    if (currentLang === 'fortran') {
      const formVal = formSelect.value;
      if (formVal === 'fixed') options.fixedForm = true;
      if (formVal === 'free') options.fixedForm = false;
      options.standard = standardSelect.value;
    } else {
      options.standard = pascalStandardSelect.value;
    }

    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, language: currentLang, options }),
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

  // ---- Execute (Pascal emulator) ----
  async function executeProgram() {
    const source = editor.value;
    if (!source.trim()) {
      emulatorOutput.textContent = '(no source code)';
      return;
    }

    executeBtn.disabled = true;
    executeBtn.textContent = 'Running...';
    emulatorOutput.textContent = '';
    emulatorOutput.classList.remove('has-error');
    emulatorErrors.innerHTML = '';
    emulatorMeta.textContent = '';

    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          language: 'pascal',
          input: emulatorInput.value,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        emulatorOutput.textContent = err.error || 'Execution failed.';
        emulatorOutput.classList.add('has-error');
        return;
      }

      const data = await res.json();

      // Show output
      emulatorOutput.textContent = data.output || '(no output)';
      if (data.output) {
        emulatorOutput.classList.remove('has-error');
      }

      // Show errors
      if (data.errors && data.errors.length > 0) {
        emulatorOutput.classList.add('has-error');
        let errHtml = '';
        for (const e of data.errors) {
          errHtml += `<div class="emulator-error-item">${e.line ? `Line ${e.line}: ` : ''}${escapeHtml(e.message)}</div>`;
        }
        emulatorErrors.innerHTML = errHtml;
      }

      // Show meta
      emulatorMeta.textContent = `${data.steps} steps`;
    } catch (err) {
      emulatorOutput.textContent = 'Network error: ' + err.message;
      emulatorOutput.classList.add('has-error');
    } finally {
      executeBtn.disabled = false;
      executeBtn.textContent = 'Run';
    }
  }

  executeBtn.addEventListener('click', executeProgram);

  // ---- Keyboard shortcuts ----
  editor.addEventListener('keydown', (e) => {
    // Ctrl+Enter to validate
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      validate();
    }
    // Shift+Ctrl+Enter to execute (Pascal)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      if (currentLang === 'pascal') executeProgram();
    }
    // Tab inserts spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const spaces = currentLang === 'fortran' ? '      ' : '  ';
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.value = editor.value.substring(0, start) + spaces + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + spaces.length;
      updateLineNumbers();
    }
  });

  // ---- Render results ----
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

    const formInfo = meta.fixedForm !== undefined
      ? (meta.fixedForm ? 'Fixed-form' : 'Free-form')
      : (meta.language || currentLang).charAt(0).toUpperCase() + (meta.language || currentLang).slice(1);
    html += `<span class="count" style="margin-left:auto">${formInfo} | ${meta.totalLines} lines</span>`;
    summaryEl.innerHTML = html;
  }

  function renderResults(diagnostics) {
    if (diagnostics.length === 0) {
      resultsList.innerHTML = '<div class="success-state">No issues found. Your code looks correct.</div>';
      return;
    }

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

    resultsList.querySelectorAll('.result-item').forEach(item => {
      item.addEventListener('click', () => {
        jumpToLine(parseInt(item.dataset.line, 10));
      });
    });
  }

  function showEmpty(msg) {
    resultsList.innerHTML = `<div class="empty-state">${escapeHtml(msg)}</div>`;
    summaryEl.innerHTML = '';
    filtersEl.style.display = 'none';
  }

  filtersEl.addEventListener('change', () => {
    renderResults(currentDiagnostics);
  });

  // ---- Jump to line ----
  function jumpToLine(lineNum) {
    const lines = editor.value.split('\n');
    let pos = 0;
    for (let i = 0; i < lineNum - 1 && i < lines.length; i++) {
      pos += lines[i].length + 1;
    }
    editor.focus();
    editor.selectionStart = pos;
    editor.selectionEnd = pos + (lines[lineNum - 1] || '').length;

    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 18;
    editor.scrollTop = (lineNum - 5) * lineHeight;
    updateLineInfo();
  }

  // ---- Clear ----
  clearBtn.addEventListener('click', () => {
    editor.value = '';
    updateLineNumbers();
    showEmpty('Click "Validate" to check your code.');
    currentDiagnostics = [];
    emulatorOutput.textContent = '';
    emulatorErrors.innerHTML = '';
    emulatorMeta.textContent = '';
  });

  // ---- Sample code ----
  const SAMPLES = {
    fortran: `C     SAMPLE FORTRAN 77 PROGRAM WITH INTENTIONAL ISSUES
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
`,
    pascal: `program FibonacciDemo;
{ Demonstrates the Pascal emulator with a Fibonacci sequence,
  prime checking, and formatted output. }

const
  MaxN = 20;

var
  i, n: integer;
  fib: array[1..20] of integer;

function IsPrime(num: integer): boolean;
var
  j: integer;
begin
  if num < 2 then
  begin
    IsPrime := false;
    exit;
  end;
  IsPrime := true;
  j := 2;
  while j * j <= num do
  begin
    if num mod j = 0 then
    begin
      IsPrime := false;
      exit;
    end;
    j := j + 1;
  end;
end;

begin
  writeln('=== Fibonacci Sequence ===');
  writeln;

  n := 15;
  fib[1] := 1;
  fib[2] := 1;
  for i := 3 to n do
    fib[i] := fib[i-1] + fib[i-2];

  writeln('First ', n, ' Fibonacci numbers:');
  for i := 1 to n do
  begin
    write(fib[i]:6);
    if i mod 5 = 0 then
      writeln;
  end;
  writeln;
  writeln;

  writeln('=== Prime Fibonacci Numbers ===');
  for i := 1 to n do
  begin
    if IsPrime(fib[i]) then
      writeln('  fib(', i, ') = ', fib[i], ' is PRIME');
  end;

  writeln;
  writeln('Sum of first ', n, ' Fibonacci numbers: ',
    fib[1] + fib[2] + fib[3] + fib[4] + fib[5] +
    fib[6] + fib[7] + fib[8] + fib[9] + fib[10] +
    fib[11] + fib[12] + fib[13] + fib[14] + fib[15]);
end.
`,
  };

  sampleBtn.addEventListener('click', () => {
    editor.value = SAMPLES[currentLang] || SAMPLES.fortran;
    updateLineNumbers();
    updateLineInfo();
  });

  // ---- Rules panel ----
  rulesBtn.addEventListener('click', async () => {
    if (rulesPanel.style.display === 'none') {
      rulesPanel.style.display = '';
      try {
        const res = await fetch(`/api/rules?language=${currentLang}`);
        const data = await res.json();
        renderRules(data.rules);
      } catch {
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
      const stdClass = (r.standard || r.language || 'f77').toLowerCase();
      const langBadge = r.language
        ? `<span class="badge badge-${r.language}">${r.language}</span>`
        : '';
      html += `
        <div class="rule-item">
          <div class="rule-header">
            <span class="rule-id">${escapeHtml(r.id)}</span>
            <div class="rule-meta">
              ${langBadge}
              <span class="badge badge-${stdClass}">${escapeHtml(r.standard || 'F77')}</span>
              <span class="result-severity severity-${r.severity || 'warning'}">${r.severity || 'warning'}</span>
            </div>
          </div>
          <div class="rule-name">${escapeHtml(r.name)}</div>
          <div class="rule-desc">${escapeHtml(r.description)}</div>
        </div>
      `;
    }
    rulesList.innerHTML = html || '<div class="empty-state">No rules for this language.</div>';
  }

  // ---- Utility ----
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- Init ----
  updateLineNumbers();
})();
