// Transpile pure TypeScript domain helpers without adding a production dependency.
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
export async function loadDomain() {
  const source = await readFile(new URL('../src/lib/domain.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}
