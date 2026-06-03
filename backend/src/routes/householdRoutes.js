import {
  listHouseholdMembers,
  listHouseholds,
  syncHouseholds
} from "../households/householdService.js";
import { sendBadRequest, sendJson } from "../http/respond.js";

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!rawBody.trim()) return {};
  return JSON.parse(rawBody);
}

function sendServiceResult(response, result) {
  if (result.error) {
    sendJson(response, result.status || 400, { error: result.error });
    return;
  }
  sendJson(response, result.status || 200, { data: result.data });
}

export async function routeHouseholds(request, requestUrl, response) {
  const { pathname } = requestUrl;

  if (request.method === "GET" && pathname === "/api/households") {
    sendJson(response, 200, { data: listHouseholds() });
    return true;
  }

  const membersMatch = pathname.match(/^\/api\/households\/([^/]+)\/members$/);
  if (request.method === "GET" && membersMatch) {
    sendJson(response, 200, { data: listHouseholdMembers(decodeURIComponent(membersMatch[1])) });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/sync/households") {
    try {
      sendServiceResult(response, syncHouseholds(await readJsonBody(request)));
    } catch {
      sendBadRequest(response, "Request body must be valid JSON.");
    }
    return true;
  }

  return false;
}
