/**
 * Parses every app source file with Babel so a syntax error in a React
 * Native screen (which the other node tests never import) fails here
 * instead of in Metro during the release build.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const ROOTS = ["src", "app", "plugins"].map((dir) => path.join(root, dir));
const SKIP_DIRS = new Set(["tests", "node_modules", "data"]);

function collect(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collect(path.join(dir, entry.name), out);
    } else if (/\.(js|jsx|mjs|cjs)$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const files = ROOTS.flatMap((dir) => collect(dir));
const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const isModule = !/\.cjs$/.test(file) && !/module\.exports|require\(/.test(source.slice(0, 4000)) || /^\s*(import|export)\s/m.test(source);
  try {
    parse(source, {
      sourceType: isModule ? "module" : "script",
      allowReturnOutsideFunction: true,
      plugins: ["jsx", "importAttributes", "topLevelAwait"],
    });
  } catch (error) {
    failures.push(`${path.relative(root, file)}: ${error.message}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  throw new Error(`${failures.length} source file(s) failed to parse`);
}
console.log(`Source syntax validation passed (${files.length} files)`);
