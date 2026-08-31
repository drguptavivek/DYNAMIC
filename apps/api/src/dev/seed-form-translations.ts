import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const LANGUAGES = ["hi", "kn", "mr", "ta", "te"] as const;
const ROOT = path.resolve(process.cwd(), "../..");
const FORMS_DIR = path.join(ROOT, "expo", "src", "data", "forms");
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_dev";

type Translation = { title?: string; description?: string; choices?: Record<string, string> };
type TranslationMap = Record<string, Translation>;

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const object = value as Record<string, unknown>;
  for (const key of ["default", "en", "english"]) {
    if (typeof object[key] === "string" && object[key].trim()) return object[key].trim();
  }
  return "";
}

function walk(items: unknown[], visit: (element: Record<string, unknown>) => void): void {
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const element = item as Record<string, unknown>;
    visit(element);
    for (const key of ["elements", "templateElements", "columns", "rows"]) {
      if (Array.isArray(element[key])) walk(element[key] as unknown[], visit);
    }
  }
}

function sourceTranslations(form: Record<string, unknown>): TranslationMap {
  const result: TranslationMap = {};
  const pages = Array.isArray(form.pages) ? form.pages : [];
  for (const page of pages) {
    if (!page || typeof page !== "object" || Array.isArray(page)) continue;
    const elements = Array.isArray((page as Record<string, unknown>).elements)
      ? ((page as Record<string, unknown>).elements as unknown[])
      : [];
    walk(elements, (element) => {
      const name = typeof element.name === "string" ? element.name : "";
      if (!name) return;
      const item: Translation = {};
      const title = textValue(element.title);
      const description = textValue(element.description);
      if (title) item.title = title;
      if (description) item.description = description;
      if (Array.isArray(element.choices)) {
        const choices: Record<string, string> = {};
        for (const choice of element.choices) {
          if (!choice || typeof choice !== "object" || Array.isArray(choice)) continue;
          const choiceObject = choice as Record<string, unknown>;
          const value = String(choiceObject.value ?? "");
          const text = textValue(choiceObject.text ?? value);
          if (value && text) choices[value] = text;
        }
        if (Object.keys(choices).length) item.choices = choices;
      }
      if (Object.keys(item).length) result[name] = item;
    });
  }
  return result;
}

async function translate(text: string, language: string): Promise<string> {
  const hosts = [
    // The Google APIs host is the most reliable endpoint in restricted/local
    // environments; keep it first so retries do not immediately hit a throttled
    // regional frontend.
    "translate.googleapis.com", "translate.google.com", "translate.google.co.in", "translate.google.co.uk",
    "translate.google.co.jp", "translate.google.de", "translate.google.fr", "translate.google.it",
    "translate.google.com.au", "translate.google.co.za",
  ];
  for (let attempt = 0; attempt < hosts.length; attempt += 1) {
    try {
      const url = new URL(`https://${hosts[attempt % hosts.length]}/translate_a/single`);
      url.searchParams.set("client", "gtx");
      url.searchParams.set("sl", "en");
      url.searchParams.set("tl", language);
      url.searchParams.set("dt", "t");
      url.searchParams.set("q", text);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as unknown;
      const chunks = Array.isArray(payload) && Array.isArray(payload[0]) ? payload[0] : [];
      const translated = chunks
        .filter((chunk): chunk is unknown[] => Array.isArray(chunk) && typeof chunk[0] === "string")
        .map((chunk) => String(chunk[0]))
        .join("")
        .trim();
      if (translated) return translated;
      throw new Error("empty translation");
    } catch (error) {
      if (String(error).includes("HTTP 429")) continue;
      if (attempt === hosts.length - 1) throw error;
      const message = String(error);
      const delay = message.includes("HTTP 429") ? 12_000 * (attempt + 1) : 1_000 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return text;
}

async function translateBatch(texts: string[], language: string): Promise<string[]> {
  const marker = "DYNSEP12345";
  const joined = texts.join(` ${marker} `);
  try {
    const translated = await translate(joined, language);
    const parts = translated.split(marker).map((part) => part.trim());
    if (parts.length === texts.length) return parts;
  } catch {
    // Retry below one text at a time when a provider changes/removes the marker.
  }
  // Some proxies/providers rewrite the separator token.  Individual requests
  // preserve correctness and avoid relying on a second rate-limited service.
  const individual: string[] = [];
  for (const text of texts) {
    try {
      individual.push(await translate(text, language));
    } catch {
      individual.push(text);
    }
  }
  return individual;
}

async function main(): Promise<void> {
  const catalog = JSON.parse(await fs.readFile(path.join(FORMS_DIR, "index.json"), "utf8")) as Array<{ form_code: string; file_name: string }>;
  const pool = new Pool({ connectionString: DATABASE_URL });
  const cache = new Map<string, string>();
  let requests = 0;
  try {
    for (const entry of catalog) {
      const form = JSON.parse(await fs.readFile(path.join(FORMS_DIR, entry.file_name), "utf8")) as Record<string, unknown>;
      const source = sourceTranslations(form);
      const existingResult = await pool.query<{ language_code: string; translations_json: TranslationMap }>(
        "select language_code, translations_json from form_language_translations where site_id = 0 and form_code = $1",
        [entry.form_code],
      );
      const existing = new Map(existingResult.rows.map((row) => [row.language_code, row.translations_json || {}]));
      for (const language of LANGUAGES) {
        const merged: TranslationMap = JSON.parse(JSON.stringify(existing.get(language) || {}));
        const jobs: Array<{ name: string; kind: "title" | "description" | "choice"; value: string; choice?: string }> = [];
        for (const [name, item] of Object.entries(source)) {
          const target = (merged[name] ||= {});
          // Treat a stored value identical to the English source as untranslated.
          // Earlier best-effort requests could persist the English fallback when a
          // provider was throttled; those entries must be retried on subsequent runs.
          if (item.title && (!target.title || target.title.trim() === item.title.trim())) {
            jobs.push({ name, kind: "title", value: item.title });
          }
          if (item.description && (!target.description || target.description.trim() === item.description.trim())) {
            jobs.push({ name, kind: "description", value: item.description });
          }
          for (const [choice, value] of Object.entries(item.choices || {})) {
            if (!target.choices?.[choice] || target.choices[choice].trim() === value.trim()) {
              jobs.push({ name, kind: "choice", choice, value });
            }
          }
        }
        let cursor = 0;
        const worker = async () => {
          while (true) {
            const batch: typeof jobs = [];
            let batchLength = 0;
            while (cursor < jobs.length && batch.length < 8) {
              const candidate = jobs[cursor];
              const nextLength = batchLength + candidate.value.length + 16;
              if (batch.length > 0 && nextLength > 1800) break;
              batch.push(candidate);
              batchLength = nextLength;
              cursor += 1;
            }
            if (!batch.length) return;
            const missing = batch.filter((job) => !cache.has(`${language}\u0000${job.value}`));
            if (missing.length) {
              const translated = await translateBatch(missing.map((job) => job.value), language);
              missing.forEach((job, index) => cache.set(`${language}\u0000${job.value}`, translated[index] || job.value));
              requests += missing.length;
              if (requests % 100 === 0) console.log(`translated ${requests} unique texts`);
            }
            for (const job of batch) {
              const translated = cache.get(`${language}\u0000${job.value}`) || job.value;
            const target = merged[job.name] ||= {};
            if (job.kind === "title") target.title = translated;
            else if (job.kind === "description") target.description = translated;
            else (target.choices ||= {})[job.choice!] = translated;
            }
          }
        };
        await Promise.all(Array.from({ length: 2 }, () => worker()));
        await pool.query(
          `insert into form_language_translations (site_id, form_code, language_code, translations_json, updated_by_user_id, updated_at)
           values (0, $1, $2, $3::jsonb, 'one_time_translation_seed', now())
           on conflict (site_id, form_code, language_code) do update set translations_json = excluded.translations_json,
             updated_by_user_id = excluded.updated_by_user_id, updated_at = excluded.updated_at`,
          [entry.form_code, language, JSON.stringify(merged)],
        );
        console.log(`${entry.form_code}/${language}: ${Object.keys(merged).length} variables, ${jobs.length} newly translated texts`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
