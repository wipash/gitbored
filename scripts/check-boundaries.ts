import { builtinModules } from 'node:module';
import { relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const root = resolve('.');
const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const errors: string[] = [];
function inside(path: string, directory: string): boolean {
  const local = relative(resolve(root, directory), resolve(path));
  return local === '' || (local !== '..' && !local.startsWith(`..${sep}`) && !local.startsWith(sep));
}
function check(configName: string, side: 'client' | 'server'): void {
  const config = ts.readConfigFile(configName, (path) => ts.sys.readFile(path));
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length > 0) throw new Error(ts.formatDiagnosticsWithColorAndContext(parsed.errors, {
    getCanonicalFileName: (name) => name, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  for (const source of program.getSourceFiles()) {
    if (program.isSourceFileFromExternalLibrary(source) || program.isSourceFileDefaultLibrary(source)) continue;
    if (!inside(source.fileName, `src/${side}`) && !inside(source.fileName, 'src/shared')) {
      errors.push(`${configName}: transitive import escapes src/${side} and src/shared: ${source.fileName}`);
    }
    const browserSafe = side === 'client' || inside(source.fileName, 'src/shared');
    function inspect(node: ts.Node): void {
      let specifier: ts.Expression | undefined;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        specifier = node.moduleReference.expression;
      }
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        specifier = node.arguments[0];
        if (!specifier || !ts.isStringLiteralLike(specifier)) {
          errors.push(`${source.fileName}: computed module loading cannot be checked`);
        }
      }
      if (specifier && ts.isStringLiteralLike(specifier)) {
        const name = specifier.text;
        if (browserSafe && (builtins.has(name) || name.startsWith('node:'))) {
          errors.push(`${source.fileName}: browser-safe code imports Node module ${name}`);
        }
        const target = ts.resolveModuleName(name, source.fileName, parsed.options, ts.sys).resolvedModule;
        if (target && !target.isExternalLibraryImport) {
          const allowed = inside(target.resolvedFileName, `src/${side}`) || inside(target.resolvedFileName, 'src/shared');
          if (!allowed || (inside(source.fileName, 'src/shared') && !inside(target.resolvedFileName, 'src/shared'))) {
            errors.push(`${source.fileName}: disallowed import ${name} -> ${target.resolvedFileName}`);
          }
        }
      }
      ts.forEachChild(node, inspect);
    }
    inspect(source);
  }
}
check('tsconfig.client.json', 'client');
check('tsconfig.server.json', 'server');
if (errors.length > 0) throw new Error(`Import boundaries failed:\n${errors.join('\n')}`);
