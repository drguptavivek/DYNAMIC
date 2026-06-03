import { defineConfig } from "vite";
import { routeHouseholds } from "./src/routes/householdRoutes.js";
import { routeMasters } from "./src/routes/mastersRoutes.js";
import { sendJson, sendNoContent } from "./src/http/respond.js";

function dynamicApiMiddleware() {
  return {
    name: "dynamic-api-middleware",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

        if (request.method === "OPTIONS") {
          sendNoContent(response);
          return;
        }

        if (requestUrl.pathname === "/health") {
          sendJson(response, 200, { status: "ok", service: "dynamic-masters-backend" });
          return;
        }

        if (requestUrl.pathname.startsWith("/api/masters")) {
          if (await routeMasters(request, requestUrl, response)) return;
        }

        if (requestUrl.pathname.startsWith("/api/households") || requestUrl.pathname.startsWith("/api/sync/households")) {
          if (await routeHouseholds(request, requestUrl, response)) return;
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [dynamicApiMiddleware()],
  server: {
    host: "0.0.0.0",
    port: 8090,
    strictPort: true
  }
});
