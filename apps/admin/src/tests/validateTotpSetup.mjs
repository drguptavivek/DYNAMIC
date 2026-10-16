import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise the real component effect with Strict Mode setup/cleanup/setup.
const result = await build({
  entryPoints: ['apps/admin/src/pages/TotpSetupPage.tsx'],
  bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic',
  plugins: [{ name: 'component-dependencies', setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime|react-router-dom|qrcode)$|\/lib\/(api|auth-context)$|\.css$/ }, args => ({ path: args.path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents:
      args.path === 'react' ? 'export const {useState,useRef,useEffect}=globalThis.totpHarness;' :
      args.path === 'react/jsx-runtime' ? 'export const jsx=()=>null; export const jsxs=jsx; export const Fragment="fragment";' :
      args.path === 'react-router-dom' ? 'export const useNavigate=()=>()=>{};' :
      args.path === 'qrcode' ? 'export default {toDataURL:async()=>"synthetic-qr"};' :
      args.path.endsWith('/api') ? 'export const api={post:(...args)=>globalThis.totpHarness.post(...args)};' :
      args.path.endsWith('/auth-context') ? 'export const useAuth=()=>({markTotpEnabled(){}});' :
      'export default {};'
    }));
  }}],
});
const module = { exports: {} };

for (const failure of [false, true]) {
  const state = [];
  let effect, settle, requests = 0;
  globalThis.totpHarness = {
    useState(initial) { const index = state.push(initial) - 1; return [initial, value => { state[index] = value; }]; },
    useRef(initial) { return { current: initial }; },
    useEffect(callback) { effect = callback; },
    post() { requests++; return new Promise((resolve, reject) => { settle = failure ? reject : resolve; }); },
  };
  // The mock React exports bind the current harness when the module loads.
  new Function('module', 'exports', result.outputFiles[0].text)(module, module.exports);
  module.exports.default();
  effect()();
  const cleanup = effect();
  settle(failure ? new Error('Setup unavailable') : { secret: 'SYNTHETIC', otpauth_uri: 'synthetic' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests, 1);
  assert.equal(state[4], false, 'loading must finish after effect replay');
  assert.equal(state[3], failure ? 'Setup unavailable' : '');
  assert.equal(state[1], failure ? '' : 'synthetic-qr');
  cleanup();
}
delete globalThis.totpHarness;
console.log('TOTP setup effect replay validation passed');
