import { FIELD_APP_ROUTES } from "./appNavigation.js";

export const ROUTES = FIELD_APP_ROUTES;

let navigationHandler = null;

export function setNavigationHandler(handler) {
  navigationHandler = typeof handler === "function" ? handler : null;
}

export function navigateTo(route, options = {}) {
  if (!route) return;
  if (navigationHandler) {
    navigationHandler(route, options);
    return;
  }
  if (typeof window !== "undefined") {
    if (options.replace) {
      window.location.replace(route);
      return;
    }
    window.location.assign(route);
  }
}
