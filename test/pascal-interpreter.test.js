const { describe, it } = require('node:test');
const assert = require('node:assert');
const { PascalInterpreter } = require('../src/pascal');

describe('PascalInterpreter', () => {
  function run(source, input = '') {
    const interp = new PascalInterpreter({ input });
    return interp.execute(source);
  }

  describe('basic programs', () => {
    it('executes Hello World', () => {
      const result = run("program Hello;\nbegin\n  writeln('Hello, World!');\nend.");
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('Hello, World!'));
    });

    it('handles variables and assignment', () => {
      const source = `program Test;
var x, y: integer;
begin
  x := 10;
  y := 20;
  writeln(x + y);
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('30'));
    });

    it('handles constants', () => {
      const source = `program Test;
const PI = 3;
begin
  writeln(PI);
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('3'));
    });
  });

  describe('control flow', () => {
    it('executes IF/THEN/ELSE', () => {
      const source = `program Test;
var x: integer;
begin
  x := 5;
  if x > 3 then
    writeln('big')
  else
    writeln('small');
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('big'));
    });

    it('executes FOR loop', () => {
      const source = `program Test;
var i: integer;
begin
  for i := 1 to 5 do
    write(i, ' ');
  writeln;
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('1'));
      assert.ok(result.output.includes('5'));
    });

    it('executes WHILE loop', () => {
      const source = `program Test;
var x: integer;
begin
  x := 1;
  while x <= 3 do
  begin
    writeln(x);
    x := x + 1;
  end;
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('1'));
      assert.ok(result.output.includes('3'));
    });

    it('executes REPEAT/UNTIL', () => {
      const source = `program Test;
var x: integer;
begin
  x := 0;
  repeat
    x := x + 1;
  until x >= 3;
  writeln(x);
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('3'));
    });

    it('executes CASE statement', () => {
      const source = `program Test;
var x: integer;
begin
  x := 2;
  case x of
    1: writeln('one');
    2: writeln('two');
    3: writeln('three');
  end;
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('two'));
    });
  });

  describe('procedures and functions', () => {
    it('calls a procedure', () => {
      const source = `program Test;
procedure Greet;
begin
  writeln('Hello from procedure');
end;
begin
  Greet;
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('Hello from procedure'));
    });

    it('calls a function with return value', () => {
      const source = `program Test;
function Double(x: integer): integer;
begin
  Double := x * 2;
end;
begin
  writeln(Double(21));
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('42'));
    });

    it('handles parameters', () => {
      const source = `program Test;
function Add(a, b: integer): integer;
begin
  Add := a + b;
end;
begin
  writeln(Add(3, 4));
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('7'));
    });
  });

  describe('arrays', () => {
    it('handles array indexing', () => {
      const source = `program Test;
var arr: array[1..5] of integer;
    i: integer;
begin
  for i := 1 to 5 do
    arr[i] := i * 10;
  writeln(arr[3]);
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('30'));
    });

    it('detects array bounds violation', () => {
      const source = `program Test;
var arr: array[1..3] of integer;
begin
  arr[10] := 1;
end.`;
      const result = run(source);
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors[0].message.includes('out of bounds'));
    });
  });

  describe('built-in functions', () => {
    it('handles abs, sqr, sqrt', () => {
      const source = `program Test;
begin
  writeln(abs(-5));
  writeln(sqr(4));
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('5'));
      assert.ok(result.output.includes('16'));
    });

    it('handles string functions', () => {
      const source = `program Test;
begin
  writeln(length('hello'));
  writeln(copy('abcdef', 2, 3));
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('5'));
      assert.ok(result.output.includes('bcd'));
    });

    it('handles ord and chr', () => {
      const source = `program Test;
begin
  writeln(ord('A'));
  writeln(chr(66));
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('65'));
      assert.ok(result.output.includes('B'));
    });
  });

  describe('formatted output', () => {
    it('handles field width', () => {
      const source = `program Test;
begin
  writeln(42:10);
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('42'));
      // Should be right-justified in 10 chars
      assert.ok(result.output.trim().length >= 2);
    });

    it('handles decimal precision', () => {
      const source = `program Test;
var x: real;
begin
  x := 3.14159;
  writeln(x:8:2);
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('3.14'));
    });
  });

  describe('safety', () => {
    it('halts infinite loops', () => {
      const source = `program Test;
begin
  while true do
    ;
end.`;
      const result = run(source);
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.some(e => e.message.includes('step limit')));
    });
  });

  describe('string operations', () => {
    it('concatenates strings with +', () => {
      const source = `program Test;
var s: string;
begin
  s := 'Hello' + ' ' + 'World';
  writeln(s);
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('Hello World'));
    });
  });

  describe('boolean expressions', () => {
    it('evaluates boolean logic', () => {
      const source = `program Test;
begin
  if (3 > 2) and (1 < 5) then
    writeln('yes')
  else
    writeln('no');
end.`;
      const result = run(source);
      assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(result.output.includes('yes'));
    });
  });
});
