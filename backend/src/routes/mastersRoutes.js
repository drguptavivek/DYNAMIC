import {
  findStudySite,
  findStudyVillage,
  deleteStudySite,
  deleteStudyVillage,
  listStudySites,
  listStudyVillagesForSite,
  saveStudySite,
  saveStudyVillage,
  updateStudySite,
  updateStudyVillage
} from "../masters/masterService.js";
import { sendBadRequest, sendJson, sendNotFound } from "../http/respond.js";

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
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

export async function routeMasters(request, requestUrl, response) {
  const { pathname, searchParams } = requestUrl;

  if (request.method === "GET" && pathname === "/api/masters/study-sites") {
    sendJson(response, 200, { data: listStudySites() });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/masters/study-sites") {
    try {
      sendServiceResult(response, saveStudySite(await readJsonBody(request)));
    } catch {
      sendBadRequest(response, "Request body must be valid JSON.");
    }
    return true;
  }

  const studySiteMatch = pathname.match(/^\/api\/masters\/study-sites\/([^/]+)$/);
  if (request.method === "GET" && studySiteMatch) {
    const site = findStudySite(studySiteMatch[1]);
    if (!site) {
      sendNotFound(response, "Study site not found");
      return true;
    }
    sendJson(response, 200, { data: site });
    return true;
  }

  if (request.method === "PUT" && studySiteMatch) {
    try {
      sendServiceResult(response, updateStudySite(studySiteMatch[1], await readJsonBody(request)));
    } catch {
      sendBadRequest(response, "Request body must be valid JSON.");
    }
    return true;
  }

  if (request.method === "DELETE" && studySiteMatch) {
    sendServiceResult(response, deleteStudySite(studySiteMatch[1]));
    return true;
  }

  const siteVillagesMatch = pathname.match(/^\/api\/masters\/study-sites\/([^/]+)\/villages$/);
  if (request.method === "GET" && siteVillagesMatch) {
    const site = findStudySite(siteVillagesMatch[1]);
    if (!site) {
      sendNotFound(response, "Study site not found");
      return true;
    }
    sendJson(response, 200, { data: listStudyVillagesForSite(siteVillagesMatch[1]) });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/masters/study-villages") {
    sendJson(response, 200, {
      data: listStudyVillagesForSite(searchParams.get("site_id"))
    });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/masters/study-villages") {
    try {
      sendServiceResult(response, saveStudyVillage(await readJsonBody(request)));
    } catch {
      sendBadRequest(response, "Request body must be valid JSON.");
    }
    return true;
  }

  const villageMatch = pathname.match(/^\/api\/masters\/study-sites\/([^/]+)\/villages\/([^/]+)$/);
  if (request.method === "GET" && villageMatch) {
    const village = findStudyVillage(villageMatch[1], villageMatch[2]);
    if (!village) {
      sendNotFound(response, "Study village not found");
      return true;
    }
    sendJson(response, 200, { data: village });
    return true;
  }

  if (request.method === "PUT" && villageMatch) {
    try {
      sendServiceResult(response, updateStudyVillage(villageMatch[1], villageMatch[2], await readJsonBody(request)));
    } catch {
      sendBadRequest(response, "Request body must be valid JSON.");
    }
    return true;
  }

  if (request.method === "DELETE" && villageMatch) {
    sendServiceResult(response, deleteStudyVillage(villageMatch[1], villageMatch[2]));
    return true;
  }

  return false;
}
