import { smokeUser, upsertDevSeed } from "./dev-seed";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3310/api/v1";

async function fetchJson(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${JSON.stringify(json)}`);
  }
  return json.data;
}

async function runSmoke() {
  await upsertDevSeed();

  const login = await fetchJson("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: smokeUser.username,
      password: smokeUser.password,
    }),
  });
  const authorization = `Bearer ${login.access_token}`;

  const me = await fetchJson("/users/me", { headers: { Authorization: authorization } });
  if (!Array.isArray(me.area_assignments) || me.area_assignments.length === 0) {
    throw new Error("/users/me did not return area assignments");
  }

  await fetchJson("/devices/register", {
    method: "POST",
    headers: { Authorization: authorization },
    body: JSON.stringify({
      device_id: "dev-smoke-device",
      device_name: "Dev smoke device",
    }),
  });

  const forms = await fetchJson("/protocol/forms", { headers: { Authorization: authorization } });
  if (!Array.isArray(forms.forms) || forms.forms.length !== 11) {
    throw new Error("/protocol/forms did not return 11 bundled forms");
  }

  const formBatch = await fetchJson("/protocol/forms/batch?codes=HHQ,PEF,VA", {
    headers: { Authorization: authorization },
  });
  if (!Array.isArray(formBatch.forms) || formBatch.forms.length !== 2) {
    throw new Error("/protocol/forms/batch did not return the two available requested forms");
  }

  const pull = await fetchJson("/sync/pull?locality_codes=01", {
    headers: { Authorization: authorization },
  });
  if (!Array.isArray(pull.tasks) || pull.tasks.length === 0) {
    throw new Error("/sync/pull did not return seeded task");
  }
  if (!Array.isArray(pull.form_versions) || !pull.form_versions[0]?.checksum) {
    throw new Error("/sync/pull did not return checksum-bearing form_versions");
  }

  const push = await fetchJson("/sync/push", {
    method: "POST",
    headers: { Authorization: authorization },
    body: JSON.stringify({ device_id: "dev-smoke-device", records: [] }),
  });
  if (push.accepted !== 0) {
    throw new Error("/sync/push empty-record smoke expected accepted=0");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        api_base_url: API_BASE_URL,
        user: me.username,
        assignments: me.area_assignments.length,
        forms: forms.forms.length,
        pulled_tasks: pull.tasks.length,
      },
      null,
      2,
    ),
  );
}

runSmoke()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
