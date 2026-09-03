/**
 * Public ESM entrypoint for the lazy native Survey Core model factory.
 *
 * The implementation lives in CommonJS so its synchronous `require` remains
 * compatible with Metro and Node's ESM test runner. Importing this module still
 * does not evaluate Survey Core; that happens only when the factory is called.
 */
export { createSurveyModel, isNativeSurveyCorePatched } from "./surveyCoreNative.cjs";
