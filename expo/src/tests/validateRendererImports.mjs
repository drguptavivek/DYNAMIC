/** Verifies every JSX component referenced by native form renderers is imported or declared. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";

const root = path.dirname(fileURLToPath(import.meta.url));

function collectComponentFiles() {
  const dirs = [path.resolve(root, "../components/forms")];
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".js") && !entry.name.endsWith(".test.js")) files.push(full);
    }
  };
  dirs.forEach(walk);
  return files;
}

function declaredNames(ast) {
  const names = new Set(["React"]);
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node.type === "ImportDeclaration") {
      for (const specifier of node.specifiers || []) names.add(specifier.local.name);
    }
    if (node.type === "FunctionDeclaration" && node.id) names.add(node.id.name);
    if (node.type === "ClassDeclaration" && node.id) names.add(node.id.name);
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") names.add(node.id.name);
    if (node.type === "TSTypeAliasDeclaration" && node.id) names.add(node.id.name);
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "start" || key === "end") continue;
      visit(node[key]);
    }
  };
  visit(ast.program);
  return names;
}

function jsxComponentNames(ast) {
  const names = new Set();
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node.type === "JSXOpeningElement" && node.name?.type === "JSXIdentifier") {
      const name = node.name.name;
      if (/^[A-Z]/.test(name)) names.add(name);
    }
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "start" || key === "end") continue;
      visit(node[key]);
    }
  };
  visit(ast.program);
  return names;
}

// Self-test: the checker must flag a component used without an import.
const broken = parse('export function Broken() { return <MissingThing />; }', {
  sourceType: "module",
  plugins: ["jsx"],
});
assert.deepEqual(
  [...jsxComponentNames(broken)].filter((name) => !declaredNames(broken).has(name)),
  ["MissingThing"],
  "checker must detect unimported JSX components"
);

const missing = [];
for (const file of collectComponentFiles()) {
  const source = fs.readFileSync(file, "utf8");
  const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
  const declared = declaredNames(ast);
  for (const name of jsxComponentNames(ast)) {
    if (!declared.has(name)) missing.push(`${path.relative(root, file)}: <${name}> is not imported or declared`);
  }
}

assert.deepEqual(
  missing,
  [],
  `Native form renderers reference undefined components:\n${missing.join("\n")}`
);

console.log("Validated native renderer component imports.");
