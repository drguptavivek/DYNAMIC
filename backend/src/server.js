import http from "node:http";
import { renderMastersPage } from "./admin/mastersPage.js";
import { routeHouseholds } from "./routes/householdRoutes.js";
import { routeMasters } from "./routes/mastersRoutes.js";
import { sendHtml, sendJson, sendNoContent, sendNotFound } from "./http/respond.js";

export function createServer() {
  return http.createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      sendNoContent(response);
      return;
    }

    if (!["GET", "POST", "PUT", "DELETE"].includes(request.method)) {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (requestUrl.pathname === "/") {
      sendJson(response, 200, {
        service: "dynamic-masters-backend",
        endpoints: [
          "/health",
          "/admin/masters",
          "/api/households",
          "/api/households/:household_id/members",
          "/api/sync/households",
          "/api/masters/study-sites",
          "/api/masters/study-sites/:site_id",
          "/api/masters/study-sites/:site_id/villages",
          "/api/masters/study-villages?site_id=:site_id"
        ]
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/admin/masters") {
      sendHtml(response, 200, renderMastersPage());
      return;
    }

    if (requestUrl.pathname === "/health") {
      sendJson(response, 200, { status: "ok", service: "dynamic-masters-backend" });
      return;
    }

    if (await routeMasters(request, requestUrl, response)) {
      return;
    }

    if (await routeHouseholds(request, requestUrl, response)) {
      return;
    }

    sendNotFound(response);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8090);
  createServer().listen(port, () => {
    console.log(`DYNAMIC masters backend listening on http://localhost:${port}`);
  });
}
