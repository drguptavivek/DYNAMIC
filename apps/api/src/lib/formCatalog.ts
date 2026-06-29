import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type FormIndexEntry = {
  form_code: string;
  title: string;
  version: string;
  question_count: number;
  file_name: string;
};

export type FormMetadata = {
  form_code: string;
  title: string;
  version: string;
  question_count: number;
  file_name: string;
  checksum: string;
  json_url: string;
};

export type FormWithJson = FormMetadata & {
  json: Record<string, unknown>;
};

export type FormVersionManifestEntry = Pick<FormMetadata, "form_code" | "version" | "checksum">;

const FORM_DIR_CANDIDATES = [
  path.resolve(process.cwd(), "expo/src/data/forms"),
  path.resolve(process.cwd(), "../../expo/src/data/forms"),
];

function getFormDirectory(): string {
  const formDirectory = FORM_DIR_CANDIDATES.find((candidate) =>
    existsSync(path.join(candidate, "index.json")),
  );

  if (!formDirectory) {
    throw new Error("Bundled form directory not found");
  }

  return formDirectory;
}

function normalizeVersion(fileName: string, fallback: string): string {
  const match = fileName.match(/_v(\d{4}\.\d{2}\.\d{2})\.json$/);
  return match?.[1] ?? fallback;
}

function readFormIndex(): FormIndexEntry[] {
  const indexPath = path.join(getFormDirectory(), "index.json");
  return JSON.parse(readFileSync(indexPath, "utf8")) as FormIndexEntry[];
}

export function getLatestFormMetadata(code: string): FormMetadata | null {
  const upperCode = code.toUpperCase();
  const indexEntry = readFormIndex().find((entry) => entry.form_code.toUpperCase() === upperCode);

  if (!indexEntry) {
    return null;
  }

  const formPath = path.join(getFormDirectory(), indexEntry.file_name);
  const formJson = readFileSync(formPath);
  const checksum = createHash("sha256").update(formJson).digest("hex");

  return {
    form_code: indexEntry.form_code.toUpperCase(),
    title: indexEntry.title,
    version: normalizeVersion(indexEntry.file_name, indexEntry.version),
    question_count: indexEntry.question_count,
    file_name: indexEntry.file_name,
    checksum,
    json_url: `/api/v1/protocol/forms/${indexEntry.form_code.toUpperCase()}`,
  };
}

export function getAllFormMetadata(): FormMetadata[] {
  return readFormIndex()
    .map((entry) => getLatestFormMetadata(entry.form_code))
    .filter((metadata): metadata is FormMetadata => metadata !== null);
}

export function getFormVersionManifest(): FormVersionManifestEntry[] {
  return getAllFormMetadata().map(({ form_code, version, checksum }) => ({
    form_code,
    version,
    checksum,
  }));
}

export function getFormJsonPath(code: string): string | null {
  const metadata = getLatestFormMetadata(code);

  if (!metadata) {
    return null;
  }

  return path.join(getFormDirectory(), metadata.file_name);
}

export function getFormJson(code: string): Record<string, unknown> | null {
  const jsonPath = getFormJsonPath(code);

  if (!jsonPath) {
    return null;
  }

  return JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown>;
}

export function getRequestedFormsWithJson(codes: string[]): FormWithJson[] {
  return codes
    .map((code) => {
      const metadata = getLatestFormMetadata(code);
      const json = getFormJson(code);

      if (!metadata || !json) {
        return null;
      }

      return {
        ...metadata,
        json,
      };
    })
    .filter((form): form is FormWithJson => form !== null);
}
