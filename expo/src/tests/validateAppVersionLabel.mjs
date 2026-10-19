import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const appConfig = JSON.parse(await readFile(new URL("../../app.json", import.meta.url), "utf8"));
for (const nativeVersion of ["9.8.7", null]) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../components/AppVersionLabel.js", import.meta.url))],
    bundle: true, write: false, format: "cjs", platform: "node",
    jsx: "automatic", loader: { ".js": "jsx" },
    plugins: [{ name: "version-label-dependencies", setup(builder) {
      builder.onResolve({ filter: /^(react|react\/jsx-runtime|react-native|expo-application)$/ }, args => ({ path: args.path, namespace: "mock" }));
      builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents:
        args.path === "react" ? "export default {};" :
        args.path === "react/jsx-runtime" ? "export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;" :
        args.path === "react-native" ? 'export const Text="Text";' :
        `export const nativeApplicationVersion=${JSON.stringify(nativeVersion)};`
      }));
    }}],
  });
  const module = { exports: {} };
  new Function("module", "exports", result.outputFiles[0].text)(module, module.exports);
  const style = { color: "gray" };
  const node = module.exports.AppVersionLabel({ style });
  assert.equal(node.props.children.join(""), `Version ${nativeVersion || appConfig.expo.version}`);
  assert.equal(node.props.style, style);
}
const shell = await readFile(new URL("../shell/FieldAppShell.js", import.meta.url), "utf8");
const profile = await readFile(new URL("../modules/profile/FieldWorkerProfileScreen.js", import.meta.url), "utf8");
assert.equal((shell.match(/<AppVersionLabel /g) || []).length, 2, "Login and PIN screens show the shared version label");
assert.ok(profile.includes("<AppVersionLabel "), "Profile/settings shows the shared version label");
assert.ok(!shell.includes("nativeBuildVersion"), "Build numbers stay out of the login label");
console.log("Validated app version labels, native version, and config fallback.");
