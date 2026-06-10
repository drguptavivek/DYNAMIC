import { FIELD_APP_ROUTES } from "./appNavigation.js";

export const ROUTES = FIELD_APP_ROUTES;

let navigationHandler = null;

export function setNavigationHandler(handler) {
  navigationHandler = typeof handler === "function" ? handler : null;
}

export function navigateTo(route) {
  if (!route) return;
  if (navigationHandler) {
    navigationHandler(route);
    return;
  }
  if (typeof window !== "undefined") {
    window.location.assign(route);
  }
}
