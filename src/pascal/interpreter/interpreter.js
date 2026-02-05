const { PascalLexer } = require('../lexer');
const { Parser, ParseError } = require('./parser');

/**
 * Pascal Tree-Walking Interpreter / Emulator
 *
 * Executes Pascal programs by walking the AST produced by the parser.
 * Supports: variables, constants, arithmetic, strings, arrays, records,
 * IF/FOR/WHILE/REPEAT/CASE, procedures, functions, basic I/O.
 *
 * Safety: execution is sandboxed with step limits and output buffering.
 */

class RuntimeError extends Error {
  constructor(message, line) {
    super(message);
    this.line = line;
  }
}

class BreakSignal { constructor() { this.type = 'break'; } }
class ContinueSignal { constructor() { this.type = 'continue'; } }
class ExitSignal { constructor(value) { this.type = 'exit'; this.value = value; } }

class Environment {
  constructor(parent = null) {
    this.parent = parent;
    this.vars = new Map();
  }

  define(name, value) {
    this.vars.set(name.toLowerCase(), value);
  }

  get(name) {
    const lower = name.toLowerCase();
    if (this.vars.has(lower)) return this.vars.get(lower);
    if (this.parent) return this.parent.get(name);
    throw new RuntimeError(`Undefined variable: '${name}'`);
  }

  set(name, value) {
    const lower = name.toLowerCase();
    if (this.vars.has(lower)) { this.vars.set(lower, value); return; }
    if (this.parent) { this.parent.set(name, value); return; }
    // Auto-define (for function return values etc.)
    this.vars.set(lower, value);
  }

  has(name) {
    const lower = name.toLowerCase();
    if (this.vars.has(lower)) return true;
    if (this.parent) return this.parent.has(name);
    return false;
  }
}

class PascalInterpreter {
  constructor(options = {}) {
    this.maxSteps = options.maxSteps || 100000;
    this.maxOutput = options.maxOutput || 50000;
    this.steps = 0;
    this.output = '';
    this.inputBuffer = (options.input || '').split('');
    this.inputPos = 0;
    this.globalEnv = new Environment();
    this.procedures = new Map(); // name -> { params, block, returnType? }
    this.errors = [];
    this._setupBuiltins();
  }

  _setupBuiltins() {
    const env = this.globalEnv;
    env.define('maxint', 2147483647);
    env.define('pi', Math.PI);
  }

  /**
   * Execute a Pascal program from source code.
   * Returns { output, errors, steps }
   */
  execute(source) {
    try {
      const lexer = new PascalLexer(source);
      const tokens = lexer.tokenize();

      if (lexer.diagnostics.length > 0) {
        for (const d of lexer.diagnostics) {
          if (d.severity === 'error') {
            this.errors.push({ line: d.line, message: d.message });
          }
        }
      }

      const parser = new Parser(tokens);
      const ast = parser.parseProgram();
      this._executeBlock(ast.block, this.globalEnv);
    } catch (err) {
      if (err instanceof ParseError) {
        this.errors.push({ line: err.line, message: `Parse error: ${err.message}` });
      } else if (err instanceof RuntimeError) {
        this.errors.push({ line: err.line, message: `Runtime error: ${err.message}` });
      } else if (err.message === 'STEP_LIMIT') {
        this.errors.push({ line: 0, message: `Execution halted: exceeded ${this.maxSteps} step limit (possible infinite loop)` });
      } else if (err.message === 'OUTPUT_LIMIT') {
        this.errors.push({ line: 0, message: `Output limit exceeded (${this.maxOutput} characters)` });
      } else {
        this.errors.push({ line: 0, message: `Internal error: ${err.message}` });
      }
    }

    return {
      output: this.output,
      errors: this.errors,
      steps: this.steps,
    };
  }

  _tick() {
    this.steps++;
    if (this.steps > this.maxSteps) throw new Error('STEP_LIMIT');
  }

  _write(text) {
    this.output += text;
    if (this.output.length > this.maxOutput) throw new Error('OUTPUT_LIMIT');
  }

  _readChar() {
    if (this.inputPos < this.inputBuffer.length) {
      return this.inputBuffer[this.inputPos++];
    }
    return null;
  }

  _readLine() {
    let line = '';
    while (this.inputPos < this.inputBuffer.length) {
      const ch = this.inputBuffer[this.inputPos++];
      if (ch === '\n') break;
      line += ch;
    }
    return line;
  }

  // ---- Block execution ----

  _executeBlock(block, env) {
    // Constants
    for (const c of block.constants) {
      env.define(c.name, this._evalExpr(c.value, env));
    }

    // Variables — initialize with defaults
    for (const v of block.variables) {
      const defaultVal = this._defaultValue(v.varType);
      for (const name of v.names) {
        env.define(name, defaultVal);
      }
    }

    // Register procedures/functions
    for (const p of block.procedures) {
      this.procedures.set(p.name.toLowerCase(), p);
    }

    // Execute body
    this._executeStmt(block.body, env);
  }

  _defaultValue(typeSpec) {
    if (!typeSpec) return 0;
    switch (typeSpec.type) {
      case 'SimpleType': {
        const name = typeSpec.name.toLowerCase();
        if (name === 'integer' || name === 'byte' || name === 'word' || name === 'longint' || name === 'shortint') return 0;
        if (name === 'real') return 0.0;
        if (name === 'boolean') return false;
        if (name === 'char') return '\0';
        if (name === 'string') return '';
        return 0;
      }
      case 'StringType': return '';
      case 'ArrayType': return this._createArray(typeSpec);
      case 'RecordType': return this._createRecord(typeSpec);
      default: return 0;
    }
  }

  _createArray(typeSpec) {
    // For simple subrange index types
    const indexType = typeSpec.indexTypes[0];
    let low = 0, high = 0;
    if (indexType && indexType.type === 'SubrangeType') {
      low = typeof indexType.low === 'object' && indexType.low.value !== undefined ? indexType.low.value : 0;
      high = typeof indexType.high === 'object' && indexType.high.value !== undefined ? indexType.high.value : 0;
    }
    const size = high - low + 1;
    const defaultVal = this._defaultValue(typeSpec.elementType);
    const arr = { _low: low, _high: high, _data: {} };
    for (let i = low; i <= high; i++) {
      arr._data[i] = typeof defaultVal === 'object' ? JSON.parse(JSON.stringify(defaultVal)) : defaultVal;
    }
    return arr;
  }

  _createRecord(typeSpec) {
    const record = {};
    for (const field of typeSpec.fields) {
      const val = this._defaultValue(field.fieldType);
      for (const name of field.names) {
        record[name.toLowerCase()] = val;
      }
    }
    return record;
  }

  // ---- Statement execution ----

  _executeStmt(stmt, env) {
    if (!stmt) return;
    this._tick();

    switch (stmt.type) {
      case 'Compound':
        for (const s of stmt.statements) {
          const result = this._executeStmt(s, env);
          if (result instanceof BreakSignal || result instanceof ContinueSignal || result instanceof ExitSignal) {
            return result;
          }
        }
        return;

      case 'Assignment':
        return this._executeAssignment(stmt, env);

      case 'ProcedureCall':
        return this._executeProcedureCall(stmt, env);

      case 'If':
        return this._executeIf(stmt, env);

      case 'For':
        return this._executeFor(stmt, env);

      case 'While':
        return this._executeWhile(stmt, env);

      case 'Repeat':
        return this._executeRepeat(stmt, env);

      case 'Case':
        return this._executeCase(stmt, env);

      case 'Write':
        return this._executeWrite(stmt, env);

      case 'Read':
        return this._executeRead(stmt, env);

      case 'Break':
        return new BreakSignal();

      case 'Continue':
        return new ContinueSignal();

      case 'Exit':
        return new ExitSignal();

      case 'Empty':
        return;

      default:
        return;
    }
  }

  _executeAssignment(stmt, env) {
    const value = this._evalExpr(stmt.value, env);

    if (stmt.target.type === 'Identifier') {
      env.set(stmt.target.name, value);
    } else if (stmt.target.type === 'ArrayAccess') {
      const arr = this._evalExpr(stmt.target.array, env);
      const idx = this._evalExpr(stmt.target.indices[0], env);
      if (arr && arr._data !== undefined) {
        if (idx < arr._low || idx > arr._high) {
          throw new RuntimeError(`Array index ${idx} out of bounds [${arr._low}..${arr._high}]`, stmt.line);
        }
        arr._data[idx] = value;
      }
    } else if (stmt.target.type === 'FieldAccess') {
      const obj = this._evalExpr(stmt.target.object, env);
      if (obj && typeof obj === 'object') {
        obj[stmt.target.field.toLowerCase()] = value;
      }
    }
  }

  _executeProcedureCall(stmt, env) {
    const name = stmt.name.toLowerCase();

    // Built-in procedures
    if (name === 'inc') {
      const current = env.get(stmt.args[0].name);
      const amount = stmt.args.length > 1 ? this._evalExpr(stmt.args[1], env) : 1;
      env.set(stmt.args[0].name, current + amount);
      return;
    }
    if (name === 'dec') {
      const current = env.get(stmt.args[0].name);
      const amount = stmt.args.length > 1 ? this._evalExpr(stmt.args[1], env) : 1;
      env.set(stmt.args[0].name, current - amount);
      return;
    }
    if (name === 'halt') {
      throw new ExitSignal();
    }
    if (name === 'write' || name === 'writeln') {
      this._executeWrite({
        type: 'Write',
        args: stmt.args.map(a => ({ expr: a, width: null, decimals: null })),
        newline: name === 'writeln',
        line: stmt.line,
      }, env);
      return;
    }
    if (name === 'read' || name === 'readln') {
      this._executeRead({ type: 'Read', args: stmt.args, newline: name === 'readln', line: stmt.line }, env);
      return;
    }
    if (name === 'str') {
      // str(number, stringVar)
      if (stmt.args.length >= 2) {
        const num = this._evalExpr(stmt.args[0], env);
        env.set(stmt.args[1].name, String(num));
      }
      return;
    }
    if (name === 'val') {
      // val(string, number, code)
      if (stmt.args.length >= 2) {
        const s = String(this._evalExpr(stmt.args[0], env));
        const num = parseFloat(s);
        env.set(stmt.args[1].name, isNaN(num) ? 0 : num);
        if (stmt.args.length >= 3) {
          env.set(stmt.args[2].name, isNaN(num) ? 1 : 0);
        }
      }
      return;
    }
    if (name === 'randomize') {
      return; // no-op in emulator
    }
    if (name === 'new') {
      if (stmt.args.length > 0) env.set(stmt.args[0].name, {});
      return;
    }
    if (name === 'dispose') {
      if (stmt.args.length > 0) env.set(stmt.args[0].name, null);
      return;
    }

    // User-defined procedure
    const proc = this.procedures.get(name);
    if (!proc) {
      throw new RuntimeError(`Undefined procedure: '${stmt.name}'`, stmt.line);
    }

    const callEnv = new Environment(this.globalEnv);

    // Bind parameters
    let argIdx = 0;
    for (const param of proc.params) {
      for (const pName of param.names) {
        const val = argIdx < stmt.args.length ? this._evalExpr(stmt.args[argIdx], env) : this._defaultValue(param.paramType);
        callEnv.define(pName, val);
        argIdx++;
      }
    }

    // For functions, define the function name as a variable (for return value)
    if (proc.type === 'FunctionDecl') {
      callEnv.define(proc.name, this._defaultValue(proc.returnType));
    }

    if (proc.block) {
      this._executeBlock(proc.block, callEnv);
    }

    // For functions, return the value
    if (proc.type === 'FunctionDecl') {
      return callEnv.get(proc.name);
    }
  }

  _executeIf(stmt, env) {
    const cond = this._evalExpr(stmt.condition, env);
    if (cond) {
      return this._executeStmt(stmt.thenBranch, env);
    } else if (stmt.elseBranch) {
      return this._executeStmt(stmt.elseBranch, env);
    }
  }

  _executeFor(stmt, env) {
    const start = this._evalExpr(stmt.start, env);
    const end = this._evalExpr(stmt.end, env);
    env.set(stmt.variable, start);

    if (stmt.direction === 'to') {
      for (let i = start; i <= end; i++) {
        this._tick();
        env.set(stmt.variable, i);
        const result = this._executeStmt(stmt.body, env);
        if (result instanceof BreakSignal) break;
        if (result instanceof ExitSignal) return result;
        if (result instanceof ContinueSignal) continue;
      }
    } else {
      for (let i = start; i >= end; i--) {
        this._tick();
        env.set(stmt.variable, i);
        const result = this._executeStmt(stmt.body, env);
        if (result instanceof BreakSignal) break;
        if (result instanceof ExitSignal) return result;
        if (result instanceof ContinueSignal) continue;
      }
    }
  }

  _executeWhile(stmt, env) {
    while (this._evalExpr(stmt.condition, env)) {
      this._tick();
      const result = this._executeStmt(stmt.body, env);
      if (result instanceof BreakSignal) break;
      if (result instanceof ExitSignal) return result;
      if (result instanceof ContinueSignal) continue;
    }
  }

  _executeRepeat(stmt, env) {
    do {
      this._tick();
      for (const s of stmt.statements) {
        const result = this._executeStmt(s, env);
        if (result instanceof BreakSignal) return;
        if (result instanceof ExitSignal) return result;
      }
    } while (!this._evalExpr(stmt.condition, env));
  }

  _executeCase(stmt, env) {
    const val = this._evalExpr(stmt.expr, env);

    for (const branch of stmt.branches) {
      for (const v of branch.values) {
        if (this._evalExpr(v, env) === val) {
          return this._executeStmt(branch.body, env);
        }
      }
    }

    if (stmt.elseBranch) {
      return this._executeStmt(stmt.elseBranch, env);
    }
  }

  _executeWrite(stmt, env) {
    for (const arg of stmt.args) {
      let val = this._evalExpr(arg.expr, env);
      let str;

      if (typeof val === 'boolean') {
        str = val ? 'TRUE' : 'FALSE';
      } else if (typeof val === 'number') {
        if (arg.decimals !== null) {
          const dec = this._evalExpr(arg.decimals, env);
          str = val.toFixed(dec);
        } else if (Number.isInteger(val)) {
          str = String(val);
        } else {
          str = val.toExponential(10).toUpperCase();
        }
      } else {
        str = String(val ?? '');
      }

      if (arg.width !== null) {
        const width = this._evalExpr(arg.width, env);
        if (str.length < width) {
          str = str.padStart(width, ' ');
        }
      }

      this._write(str);
    }

    if (stmt.newline) {
      this._write('\n');
    }
  }

  _executeRead(stmt, env) {
    for (const arg of stmt.args) {
      if (arg.type === 'Identifier') {
        const line = this._readLine();
        const num = parseFloat(line);
        env.set(arg.name, isNaN(num) ? line : num);
      }
    }
    if (stmt.newline && stmt.args.length === 0) {
      this._readLine(); // consume a line
    }
  }

  // ---- Expression evaluation ----

  _evalExpr(expr, env) {
    if (!expr) return 0;
    this._tick();

    switch (expr.type) {
      case 'IntegerLiteral':
        return expr.value;
      case 'RealLiteral':
        return expr.value;
      case 'StringLiteral':
        return expr.value;
      case 'BooleanLiteral':
        return expr.value;
      case 'NilLiteral':
        return null;

      case 'Identifier':
        return env.get(expr.name);

      case 'UnaryOp':
        return this._evalUnary(expr, env);

      case 'BinaryOp':
        return this._evalBinary(expr, env);

      case 'FunctionCall':
        return this._evalFunctionCall(expr, env);

      case 'ArrayAccess': {
        const arr = this._evalExpr(expr.array, env);
        const idx = this._evalExpr(expr.indices[0], env);
        if (arr && arr._data !== undefined) {
          if (idx < arr._low || idx > arr._high) {
            throw new RuntimeError(`Array index ${idx} out of bounds [${arr._low}..${arr._high}]`);
          }
          return arr._data[idx];
        }
        // String indexing
        if (typeof arr === 'string') {
          return arr[idx - 1] || '';
        }
        return 0;
      }

      case 'FieldAccess': {
        const obj = this._evalExpr(expr.object, env);
        if (obj && typeof obj === 'object') {
          return obj[expr.field.toLowerCase()];
        }
        return 0;
      }

      case 'SetConstructor': {
        const elements = new Set();
        for (const e of expr.elements) {
          elements.add(this._evalExpr(e, env));
        }
        return elements;
      }

      default:
        return 0;
    }
  }

  _evalUnary(expr, env) {
    const val = this._evalExpr(expr.operand, env);
    switch (expr.op) {
      case '-': return -val;
      case 'not': return !val;
      default: return val;
    }
  }

  _evalBinary(expr, env) {
    const left = this._evalExpr(expr.left, env);
    const right = this._evalExpr(expr.right, env);

    switch (expr.op.toLowerCase()) {
      case '+':
        if (typeof left === 'string' || typeof right === 'string') return String(left) + String(right);
        return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': {
        if (right === 0) throw new RuntimeError('Division by zero');
        return left / right;
      }
      case 'div': {
        if (right === 0) throw new RuntimeError('Division by zero');
        return Math.trunc(left / right);
      }
      case 'mod': {
        if (right === 0) throw new RuntimeError('Division by zero');
        return left % right;
      }
      case '=': return left === right;
      case '<>': return left !== right;
      case '<': return left < right;
      case '>': return left > right;
      case '<=': return left <= right;
      case '>=': return left >= right;
      case 'and':
        if (typeof left === 'boolean') return left && right;
        return (left | 0) & (right | 0); // bitwise
      case 'or':
        if (typeof left === 'boolean') return left || right;
        return (left | 0) | (right | 0);
      case 'xor':
        if (typeof left === 'boolean') return left !== right;
        return (left | 0) ^ (right | 0);
      case 'shl': return (left | 0) << (right | 0);
      case 'shr': return (left | 0) >> (right | 0);
      case 'in':
        if (right instanceof Set) return right.has(left);
        return false;
      default:
        throw new RuntimeError(`Unknown operator: ${expr.op}`);
    }
  }

  _evalFunctionCall(expr, env) {
    const name = expr.name.toLowerCase();
    const args = expr.args.map(a => this._evalExpr(a, env));

    // Built-in functions
    switch (name) {
      case 'abs': return Math.abs(args[0]);
      case 'sqr': return args[0] * args[0];
      case 'sqrt': return Math.sqrt(args[0]);
      case 'sin': return Math.sin(args[0]);
      case 'cos': return Math.cos(args[0]);
      case 'arctan': return Math.atan(args[0]);
      case 'exp': return Math.exp(args[0]);
      case 'ln': return Math.log(args[0]);
      case 'log': return Math.log(args[0]);
      case 'trunc': return Math.trunc(args[0]);
      case 'round': return Math.round(args[0]);
      case 'odd': return args[0] % 2 !== 0;
      case 'ord': return typeof args[0] === 'string' ? args[0].charCodeAt(0) : Number(args[0]);
      case 'chr': return String.fromCharCode(args[0]);
      case 'succ': return args[0] + 1;
      case 'pred': return args[0] - 1;
      case 'length': return typeof args[0] === 'string' ? args[0].length : 0;
      case 'copy': return String(args[0]).substring((args[1] || 1) - 1, (args[1] || 1) - 1 + (args[2] || 0));
      case 'pos': return String(args[1]).indexOf(String(args[0])) + 1;
      case 'concat': return args.map(String).join('');
      case 'upcase': return typeof args[0] === 'string' ? args[0].toUpperCase() : String.fromCharCode(args[0]).toUpperCase();
      case 'lowercase': return typeof args[0] === 'string' ? args[0].toLowerCase() : String.fromCharCode(args[0]).toLowerCase();
      case 'random': {
        if (args.length > 0) return Math.floor(Math.random() * args[0]);
        return Math.random();
      }
      case 'sizeof': return 0; // stub
      case 'high': return args[0] && args[0]._high !== undefined ? args[0]._high : 0;
      case 'low': return args[0] && args[0]._low !== undefined ? args[0]._low : 0;
      case 'int': return Math.trunc(args[0]);
      case 'frac': return args[0] - Math.trunc(args[0]);
      case 'eof': return this.inputPos >= this.inputBuffer.length;
    }

    // User-defined functions
    const func = this.procedures.get(name);
    if (func && func.type === 'FunctionDecl') {
      const callEnv = new Environment(this.globalEnv);

      // Bind parameters
      let argIdx = 0;
      for (const param of func.params) {
        for (const pName of param.names) {
          callEnv.define(pName, argIdx < args.length ? args[argIdx] : 0);
          argIdx++;
        }
      }

      callEnv.define(func.name, this._defaultValue(func.returnType));

      if (func.block) {
        this._executeBlock(func.block, callEnv);
      }

      return callEnv.get(func.name);
    }

    // User-defined procedure called as expression (shouldn't happen but handle gracefully)
    const proc = this.procedures.get(name);
    if (proc) {
      this._executeProcedureCall({ name: expr.name, args: expr.args, line: 0 }, env);
      return 0;
    }

    throw new RuntimeError(`Undefined function: '${expr.name}'`);
  }
}

module.exports = { PascalInterpreter, RuntimeError };
