import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const exports = {};
const code = ts.transpileModule(fs.readFileSync('components/virtual-table-body.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const hookExports = {};
const hookCode = ts.transpileModule(fs.readFileSync("components/use-table-viewport.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(hookCode, { exports: hookExports, require });
vm.runInNewContext(code, { exports, require: name => name === "./use-table-viewport" ? hookExports : require(name) });
for (const count of [864, 10000]) {
  test(`virtual table renders a bounded viewport for ${count} records`, () => {
    const rows = Array.from({ length: count }, (_, index) => ({ id: `row-${index}` }));
    let rendered = 0;
    const html = renderToStaticMarkup(React.createElement('table', null,
      React.createElement(exports.VirtualTableBody, { rows, columns: 2, rowKey: row => row.id }, row => {
        rendered++;
        return React.createElement('tr', { key: row.id }, React.createElement('td', null, row.id), React.createElement('td', null, 'value'));
      })));
    assert.equal(rendered, 26);
    assert.equal((html.match(/data-index=/g) || []).length, 26);
    assert.match(html, /data-sheet-spacer/);
    assert.ok(!html.includes(`row-${count - 1}`));
  });
}
test('small virtual tables render every available row without an artificial spacer', () => {
  const html = renderToStaticMarkup(React.createElement('table', null,
    React.createElement(exports.VirtualTableBody, { rows: [{ id: 'one' }], columns: 1, rowKey: row => row.id }, row => React.createElement('tr', null, React.createElement('td', null, row.id)))));
  assert.equal((html.match(/data-index=/g) || []).length, 1);
  assert.ok(!html.includes('data-sheet-spacer'));
});
