import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import styles from "./FormLanguageManagementPage.module.css";

interface FormMeta {
  form_code: string;
  title: string;
  version: string;
}

interface Site {
  site_id: number;
  site_code: string;
  site_name: string;
}

interface Language {
  code: string;
  label: string;
}

interface PermissionUser {
  user_id: string;
  username: string;
  display_name?: string | null;
  role: string;
  site_id: number;
}

interface FormElement {
  name: string;
  type?: string;
  title: string;
  description: string;
  page_name?: string;
  page_title?: string;
  source_code?: string;
  order?: number;
  section_order?: number;
  choices: Array<{ value: string; text: string }>;
}

interface ElementTranslation {
  title?: string;
  description?: string;
  choices?: Record<string, string>;
}

type TranslationMap = Record<string, ElementTranslation>;

interface Permission {
  site_id: number;
  user_id: string;
  form_code: string;
  language_code: string;
  can_edit: boolean;
}

interface DashboardPayload {
  forms: FormMeta[];
  sites: Site[];
  users: PermissionUser[];
  languages: Language[];
  permissions: Permission[];
  can_manage_permissions: boolean;
}

interface FormLanguageDetail {
  form_code: string;
  form_version: string;
  form_checksum: string;
  elements: FormElement[];
  translations: TranslationMap;
  can_edit: boolean;
}

interface ImportPreviewRow {
  rowNumber: number;
  variableName: string;
  rowType: string;
  optionValue: string;
  defaultText: string;
  translatedText: string;
  status: "matched" | "ignored";
  message: string;
}

function permissionKey(siteId: number | "", userId: string, formCode: string, languageCode: string): string {
  return `${siteId}|${userId}|${formCode}|${languageCode}`;
}

function siteLabel(site: Site): string {
  return `${site.site_name} (ID ${site.site_id})`;
}

function buildCleanTranslations(translations: TranslationMap): TranslationMap {
  const clean: TranslationMap = {};

  for (const [name, translation] of Object.entries(translations)) {
    const next: ElementTranslation = {};
    if (translation.title?.trim()) next.title = translation.title.trim();
    if (translation.description?.trim()) next.description = translation.description.trim();
    const choices = Object.entries(translation.choices || {}).reduce<Record<string, string>>(
      (acc, [value, text]) => {
        if (text.trim()) acc[value] = text.trim();
        return acc;
      },
      {},
    );
    if (Object.keys(choices).length > 0) next.choices = choices;
    if (Object.keys(next).length > 0) clean[name] = next;
  }

  return clean;
}

function getTargetText(value?: string): string {
  return value?.trim() || "No text added yet";
}

function choiceEditKey(elementName: string, choiceValue: string): string {
  return `${elementName}::${choiceValue}`;
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (quoted) {
      if (char === '"' && nextChar === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function canonicalChoiceValue(element: FormElement, rawValue: string): string | null {
  const trimmedValue = String(rawValue || "").trim();
  const exactChoice = element.choices.find((choice) => String(choice.value) === trimmedValue);
  if (exactChoice) return String(exactChoice.value);

  const numericValue = Number(trimmedValue);
  if (!Number.isFinite(numericValue)) return null;

  const numericChoice = element.choices.find((choice) => Number(choice.value) === numericValue);
  return numericChoice ? String(numericChoice.value) : null;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function FormLanguageManagementPage() {
  const [forms, setForms] = useState<FormMeta[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [permissionUsers, setPermissionUsers] = useState<PermissionUser[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedForm, setSelectedForm] = useState("");
  const [selectedSite, setSelectedSite] = useState<number | "">("");
  const [selectedLanguage, setSelectedLanguage] = useState("hi");
  const [elements, setElements] = useState<FormElement[]>([]);
  const [loadedFormVersion, setLoadedFormVersion] = useState("");
  const [loadedFormChecksum, setLoadedFormChecksum] = useState("");
  const [translations, setTranslations] = useState<TranslationMap>({});
  const [canEdit, setCanEdit] = useState(false);
  const [canManagePermissions, setCanManagePermissions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingElements, setEditingElements] = useState<Set<string>>(new Set());
  const [editingChoices, setEditingChoices] = useState<Set<string>>(new Set());
  const [importPreviewRows, setImportPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [importTranslations, setImportTranslations] = useState<TranslationMap | null>(null);
  const [permissionForm, setPermissionForm] = useState("");
  const [permissionLanguage, setPermissionLanguage] = useState("hi");

  const permissionLookup = useMemo(() => {
    return new Map(
      permissions.map((permission) => [
        permissionKey(permission.site_id, permission.user_id, permission.form_code, permission.language_code),
        permission.can_edit,
      ]),
    );
  }, [permissions]);

  useEffect(() => {
    void loadDashboard();
  }, []);

  useEffect(() => {
    if (!selectedForm || !selectedSite || !selectedLanguage) return;
    void loadFormLanguage();
  }, [selectedForm, selectedSite, selectedLanguage]);

  useEffect(() => {
    if (selectedForm) setPermissionForm(selectedForm);
    if (selectedLanguage) setPermissionLanguage(selectedLanguage);
  }, [selectedForm, selectedLanguage]);

  const usersForSelectedSite = useMemo(
    () => permissionUsers.filter((candidate) => candidate.site_id === selectedSite),
    [permissionUsers, selectedSite],
  );

  const grantedUsersForSelectedSite = useMemo(() => {
    if (!selectedSite || !permissionForm || !permissionLanguage) return 0;
    return usersForSelectedSite.filter(
      (siteUser) =>
        permissionLookup.get(
          permissionKey(selectedSite, siteUser.user_id, permissionForm, permissionLanguage),
        ) === true,
    ).length;
  }, [permissionForm, permissionLanguage, permissionLookup, selectedSite, usersForSelectedSite]);
  const permissionFullyOn =
    usersForSelectedSite.length > 0 && grantedUsersForSelectedSite === usersForSelectedSite.length;

  async function loadDashboard() {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<DashboardPayload>("/form-language-management");
      setForms(data.forms);
      setSites(data.sites);
      setPermissionUsers(data.users || []);
      setLanguages(data.languages);
      setPermissions(data.permissions || []);
      setCanManagePermissions(data.can_manage_permissions);

      const initialForm = data.forms[0]?.form_code || "";
      const initialSite = data.sites[0]?.site_id || "";
      const initialLanguage = data.languages.find((language) => language.code === "hi")?.code || data.languages[0]?.code || "";
      setSelectedForm((current) => current || initialForm);
      setSelectedSite((current) => current || initialSite);
      setSelectedLanguage((current) => current || initialLanguage);
      setPermissionForm((current) => current || initialForm);
      setPermissionLanguage((current) => current || initialLanguage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load language management");
    } finally {
      setLoading(false);
    }
  }

  async function loadFormLanguage(cacheBust = false) {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const params = new URLSearchParams({
        site_id: String(selectedSite),
        language_code: selectedLanguage,
      });
      if (cacheBust) params.set("refresh", String(Date.now()));
      const data = await api.get<FormLanguageDetail>(
        `/form-language-management/forms/${selectedForm}?${params.toString()}`,
      );
      setElements(data.elements);
      setLoadedFormVersion(data.form_version || "");
      setLoadedFormChecksum(data.form_checksum || "");
      setTranslations(data.translations || {});
      setCanEdit(data.can_edit);
      setEditingElements(new Set());
      setEditingChoices(new Set());
      setImportPreviewRows([]);
      setImportTranslations(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load selected form language");
      setElements([]);
      setLoadedFormVersion("");
      setLoadedFormChecksum("");
      setTranslations({});
      setCanEdit(false);
    } finally {
      setLoading(false);
    }
  }

  function setQuestionTranslation(name: string, field: "title" | "description", value: string) {
    setTranslations((current) => ({
      ...current,
      [name]: {
        ...current[name],
        [field]: value,
      },
    }));
  }

  function setChoiceTranslation(name: string, choiceValue: string, value: string) {
    setTranslations((current) => ({
      ...current,
      [name]: {
        ...current[name],
        choices: {
          ...(current[name]?.choices || {}),
          [choiceValue]: value,
        },
      },
    }));
  }

  async function saveTranslations(closeElementName?: string, closeChoiceKey?: string) {
    if (!selectedForm || !selectedSite) return false;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.put(`/form-language-management/forms/${selectedForm}`, {
        site_id: selectedSite,
        language_code: selectedLanguage,
        translations: buildCleanTranslations(translations),
      });
      setMessage("Translations saved. Field devices will receive them after Sync Now.");
      await loadFormLanguage();
      if (closeElementName) {
        setEditingElements((current) => {
          const next = new Set(current);
          next.delete(closeElementName);
          return next;
        });
      }
      if (closeChoiceKey) {
        setEditingChoices((current) => {
          const next = new Set(current);
          next.delete(closeChoiceKey);
          return next;
        });
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save translations");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function startEditingElement(name: string) {
    if (!canEdit) return;
    setEditingElements((current) => new Set(current).add(name));
  }

  function stopEditingElement(name: string) {
    setEditingElements((current) => {
      const next = new Set(current);
      next.delete(name);
      return next;
    });
  }

  function startEditingChoice(name: string, choiceValue: string) {
    if (!canEdit) return;
    setEditingChoices((current) => new Set(current).add(choiceEditKey(name, choiceValue)));
  }

  function stopEditingChoice(name: string, choiceValue: string) {
    const key = choiceEditKey(name, choiceValue);
    setEditingChoices((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  async function setPermissionForSiteUsers(canEdit: boolean) {
    if (!selectedSite || !permissionForm || !permissionLanguage || usersForSelectedSite.length === 0) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const data = await api.put<{ permissions: Permission[] }>("/form-language-management/permissions", {
        permissions: usersForSelectedSite.map((siteUser) => ({
          site_id: selectedSite,
          user_id: siteUser.user_id,
          form_code: permissionForm,
          language_code: permissionLanguage,
          can_edit: canEdit,
        })),
      });
      setPermissions(data.permissions || []);
      setMessage(
        canEdit
          ? `Permission activated for ${usersForSelectedSite.length} non-field-worker site users.`
          : `Permission deactivated for ${usersForSelectedSite.length} non-field-worker site users.`,
      );
      if (
        selectedSite &&
        selectedForm === permissionForm &&
        selectedLanguage === permissionLanguage
      ) {
        await loadFormLanguage();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save permission");
    } finally {
      setSaving(false);
    }
  }

  function buildExportRows(): string[][] {
    const targetLanguageLabel =
      languages.find((language) => language.code === selectedLanguage)?.label || selectedLanguage;
    const rows = [
      [
        "order",
        "form_code",
        "variable_name",
        "row_type",
        "option_value",
        "default_language",
        "default_text",
        "target_language",
        "translated_text",
      ],
    ];

    let order = 1;
    for (const element of elements) {
      rows.push([
        order,
        selectedForm,
        element.name,
        "question",
        "",
        "English",
        element.title || element.name,
        targetLanguageLabel,
        translations[element.name]?.title || "",
      ].map(String));
      order += 1;

      if (element.description) {
        rows.push([
          order,
          selectedForm,
          element.name,
          "help",
          "",
          "English",
          element.description,
          targetLanguageLabel,
          translations[element.name]?.description || "",
        ].map(String));
        order += 1;
      }

      for (const choice of element.choices) {
        rows.push([
          order,
          selectedForm,
          element.name,
          "option",
          choice.value,
          "English",
          choice.text || choice.value,
          targetLanguageLabel,
          translations[element.name]?.choices?.[choice.value] || "",
        ].map(String));
        order += 1;
      }
    }

    return rows;
  }

  function exportTranslationCsv() {
    if (!selectedForm || !selectedSite || !selectedLanguage || elements.length === 0) return;
    const csv = `\uFEFF${buildExportRows().map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
    downloadTextFile(`${selectedForm}-${selectedLanguage}-translations.csv`, csv);
  }

  async function previewTranslationCsv(file: File | null) {
    setError("");
    setMessage("");
    setImportPreviewRows([]);
    setImportTranslations(null);
    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseCsv(text.replace(/^\uFEFF/, ""));
      if (rows.length < 2) {
        setError("CSV has no translation rows.");
        return;
      }

      const headers = rows[0].map(normalizeHeader);
      const columnIndex = (name: string) => headers.indexOf(name);
      const variableIndex = columnIndex("variable_name");
      const rowTypeIndex = columnIndex("row_type");
      const optionValueIndex = columnIndex("option_value");
      const defaultTextIndex = columnIndex("default_text");
      const translatedTextIndex = columnIndex("translated_text");

      if (variableIndex < 0 || rowTypeIndex < 0 || translatedTextIndex < 0) {
        setError("CSV must include variable_name, row_type, and translated_text columns.");
        return;
      }

      const elementLookup = new Map(elements.map((element) => [element.name, element]));
      const nextTranslations: TranslationMap = { ...translations };
      const previewRows: ImportPreviewRow[] = [];

      rows.slice(1).forEach((cells, index) => {
        const rowNumber = index + 2;
        const variableName = (cells[variableIndex] || "").trim();
        const rowType = (cells[rowTypeIndex] || "").trim().toLowerCase();
        const optionValue = optionValueIndex >= 0 ? (cells[optionValueIndex] || "").trim() : "";
        const defaultText = defaultTextIndex >= 0 ? cells[defaultTextIndex] || "" : "";
        const translatedText = (cells[translatedTextIndex] || "").trim();
        const element = elementLookup.get(variableName);

        let status: ImportPreviewRow["status"] = "ignored";
        let rowMessage = "";
        if (!element) {
          rowMessage = "Unknown variable, ignored";
        } else if (!translatedText) {
          rowMessage = "Blank translation, ignored";
        } else if (rowType === "question") {
          nextTranslations[variableName] = {
            ...nextTranslations[variableName],
            title: translatedText,
          };
          status = "matched";
          rowMessage = "Question translation will update";
        } else if (rowType === "help") {
          nextTranslations[variableName] = {
            ...nextTranslations[variableName],
            description: translatedText,
          };
          status = "matched";
          rowMessage = "Help text translation will update";
        } else if (rowType === "option") {
          const matchedOptionValue = canonicalChoiceValue(element, optionValue);
          if (!matchedOptionValue) {
            rowMessage = "Unknown option value, ignored";
          } else {
            nextTranslations[variableName] = {
              ...nextTranslations[variableName],
              choices: {
                ...(nextTranslations[variableName]?.choices || {}),
                [matchedOptionValue]: translatedText,
              },
            };
            status = "matched";
            rowMessage =
              matchedOptionValue === optionValue
                ? "Option translation will update"
                : `Option translation will update as ${matchedOptionValue}`;
          }
        } else {
          rowMessage = "Unknown row_type, ignored";
        }

        previewRows.push({
          rowNumber,
          variableName,
          rowType,
          optionValue,
          defaultText,
          translatedText,
          status,
          message: rowMessage,
        });
      });

      setImportPreviewRows(previewRows);
      setImportTranslations(nextTranslations);
      setMessage(`${previewRows.filter((row) => row.status === "matched").length} CSV rows matched. Review preview, then add imported translations.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read CSV file.");
    }
  }

  async function addImportedTranslations() {
    if (!importTranslations) return;
    const matchedRows = importPreviewRows.filter((row) => row.status === "matched").length;
    const confirmed = window.confirm(
      `Are you sure you want to save ${matchedRows} imported translation rows for this questionnaire language?`,
    );
    if (!confirmed) return;
    setTranslations(importTranslations);
    const previousTranslations = translations;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.put(`/form-language-management/forms/${selectedForm}`, {
        site_id: selectedSite,
        language_code: selectedLanguage,
        translations: buildCleanTranslations(importTranslations),
      });
      setMessage("Imported translations saved. Field devices will receive them after Sync Now.");
      setImportPreviewRows([]);
      setImportTranslations(null);
      await loadFormLanguage();
    } catch (err) {
      setTranslations(previousTranslations);
      setError(err instanceof Error ? err.message : "Failed to save imported translations");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.container}>
      <h1>Form Language Management</h1>
      <p className={styles.subtitle}>
        Manage global questionnaire translations. Site selection only controls who can edit the selected language.
      </p>

      {error ? <div className={`${styles.message} ${styles.error}`}>{error}</div> : null}
      {message ? <div className={`${styles.message} ${styles.success}`}>{message}</div> : null}

      <section className={styles.toolbar}>
        <div className={styles.field}>
          <label>Form</label>
          <select className={styles.select} value={selectedForm} onChange={(event) => setSelectedForm(event.target.value)}>
            {forms.map((form) => (
              <option key={form.form_code} value={form.form_code}>
                {form.form_code} - {form.title}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label>Permission Site</label>
          <select
            className={styles.select}
            value={selectedSite}
            onChange={(event) => setSelectedSite(Number(event.target.value))}
          >
            {sites.map((site) => (
              <option key={site.site_id} value={site.site_id}>
                {siteLabel(site)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label>Default Language</label>
          <input className={styles.input} value="English" readOnly />
        </div>
        <div className={styles.field}>
          <label>Target Language</label>
          <select
            className={styles.select}
            value={selectedLanguage}
            onChange={(event) => setSelectedLanguage(event.target.value)}
          >
            {languages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </div>
        <button className={styles.secondaryButton} type="button" onClick={() => void loadFormLanguage(true)} disabled={loading}>
          Refresh latest
        </button>
      </section>

      {canManagePermissions ? (
        <section className={styles.permissionPanel}>
          <div>
            <div className={styles.permissionTitle}>Permission ON/OFF for selected site</div>
            <p className={styles.permissionHelp}>
              ON allows all active non-field-worker users of this site to edit this form language.
              OFF makes it view-only. Field workers receive the saved global questionnaire language during mobile sync.
            </p>
            <div className={styles.permissionControls}>
              <input
                className={styles.input}
                value={
                  sites.find((site) => site.site_id === selectedSite)
                    ? siteLabel(sites.find((site) => site.site_id === selectedSite)!)
                    : "Select site above"
                }
                readOnly
              />
              <select className={styles.select} value={permissionForm} onChange={(event) => setPermissionForm(event.target.value)}>
                {forms.map((form) => (
                  <option key={form.form_code} value={form.form_code}>
                    {form.form_code}
                  </option>
                ))}
              </select>
              <select
                className={styles.select}
                value={permissionLanguage}
                onChange={(event) => setPermissionLanguage(event.target.value)}
              >
                {languages.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
              <div className={styles.permissionCount}>
                {usersForSelectedSite.length === 0
                  ? "No non-field-worker users in this site"
                  : `${grantedUsersForSelectedSite} of ${usersForSelectedSite.length} users have active permission`}
              </div>
            </div>
          </div>
          <div className={styles.permissionActions}>
            <button
              className={`${styles.toggleButton} ${permissionFullyOn ? styles.toggleActive : ""}`}
              type="button"
              onClick={() => setPermissionForSiteUsers(true)}
              disabled={saving || usersForSelectedSite.length === 0}
            >
              Permission ON
            </button>
            <button
              className={`${styles.toggleButton} ${!permissionFullyOn ? styles.toggleInactiveActive : ""}`}
              type="button"
              onClick={() => setPermissionForSiteUsers(false)}
              disabled={saving || usersForSelectedSite.length === 0}
            >
              Permission OFF
            </button>
          </div>
        </section>
      ) : null}

      <section className={styles.editorPanel}>
        <div className={styles.summaryRow}>
          <span>
            {loading
              ? "Loading latest questionnaire..."
              : `${elements.length} current fields loaded${loadedFormVersion ? ` • Version ${loadedFormVersion}` : ""}`}
          </span>
          <span>{canEdit ? "Editing allowed" : "Read only until permission is granted"}</span>
        </div>
        {!loading && loadedFormChecksum ? (
          <div className={styles.definitionStatus}>
            Latest bundled definition loaded • Checksum {loadedFormChecksum.slice(0, 12)}
          </div>
        ) : null}
        <div className={styles.csvPanel}>
          <div>
            <div className={styles.permissionTitle}>CSV import/export</div>
            <p className={styles.permissionHelp}>
              Export keeps the questionnaire order fixed. Sites can fill the translated_text column and send the CSV back for preview and import.
            </p>
          </div>
          <div className={styles.csvActions}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={exportTranslationCsv}
              disabled={loading || elements.length === 0}
            >
              Export CSV
            </button>
            <label className={styles.fileButton}>
              Import CSV
              <input
                accept=".csv,text/csv"
                type="file"
                onChange={(event) => {
                  void previewTranslationCsv(event.target.files?.[0] || null);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        </div>

        {importPreviewRows.length > 0 ? (
          <div className={styles.previewPanel}>
            <div className={styles.previewHeader}>
              <div>
                <strong>Import preview</strong>
                <span>
                  {`${importPreviewRows.filter((row) => row.status === "matched").length} matched, ${importPreviewRows.filter((row) => row.status === "ignored").length} ignored`}
                </span>
              </div>
              <div className={styles.rowActions}>
                <button
                  className={styles.button}
                  type="button"
                  onClick={() => void addImportedTranslations()}
                  disabled={!canEdit || saving || importPreviewRows.every((row) => row.status !== "matched")}
                >
                  Add imported translations
                </button>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => {
                    setImportPreviewRows([]);
                    setImportTranslations(null);
                  }}
                  disabled={saving}
                >
                  Clear preview
                </button>
              </div>
            </div>
            <div className={styles.previewTable}>
              <div className={styles.previewTableHeader}>
                <span>Row</span>
                <span>Variable</span>
                <span>Type</span>
                <span>Default text</span>
                <span>Translated text</span>
                <span>Status</span>
              </div>
              {importPreviewRows.slice(0, 80).map((row) => (
                <div className={styles.previewTableRow} key={`${row.rowNumber}-${row.variableName}-${row.rowType}-${row.optionValue}`}>
                  <span>{row.rowNumber}</span>
                  <span>{row.variableName}{row.optionValue ? ` / ${row.optionValue}` : ""}</span>
                  <span>{row.rowType}</span>
                  <span>{row.defaultText}</span>
                  <span lang={selectedLanguage}>{row.translatedText || "-"}</span>
                  <span className={row.status === "matched" ? styles.previewMatched : styles.previewIgnored}>
                    {row.message}
                  </span>
                </div>
              ))}
            </div>
            {importPreviewRows.length > 80 ? (
              <div className={styles.previewMore}>{`Showing first 80 of ${importPreviewRows.length} rows.`}</div>
            ) : null}
          </div>
        ) : null}

        {elements.length === 0 ? (
          <div className={styles.emptyState}>Select a form, site, and language to load questions.</div>
        ) : (
          <div className={styles.editorRows}>
            {elements.map((element) => (
              <article className={styles.questionCard} key={element.name}>
                <div className={styles.questionHeader}>
                  <div className={styles.questionIdentity}>
                    <div className={styles.questionCode}>{element.name}</div>
                    <div className={styles.questionMeta}>
                      {element.source_code ? <span>Q{element.source_code}</span> : null}
                      {element.page_title || element.page_name ? (
                        <span>{element.page_title || element.page_name}</span>
                      ) : null}
                      {element.type ? <span>{element.type}</span> : null}
                    </div>
                  </div>
                  <div>
                    <div className={styles.englishText}>{element.title || element.name}</div>
                    {element.description ? <div className={styles.hint}>{element.description}</div> : null}
                  </div>
                  <div className={styles.translationStack}>
                    {editingElements.has(element.name) ? (
                      <>
                        <textarea
                          className={styles.inlineTextarea}
                          lang={selectedLanguage}
                          dir="auto"
                          value={translations[element.name]?.title || ""}
                          disabled={saving}
                          onChange={(event) => setQuestionTranslation(element.name, "title", event.target.value)}
                          placeholder="Question text"
                        />
                        {element.description ? (
                          <textarea
                            className={styles.inlineTextarea}
                            lang={selectedLanguage}
                            dir="auto"
                            value={translations[element.name]?.description || ""}
                            disabled={saving}
                            onChange={(event) => setQuestionTranslation(element.name, "description", event.target.value)}
                            placeholder="Help text"
                          />
                        ) : null}
                      </>
                    ) : (
                      <>
                        <div className={styles.targetReadout} lang={selectedLanguage}>
                          <strong>{getTargetText(translations[element.name]?.title)}</strong>
                        </div>
                        {element.description ? (
                          <div className={styles.targetReadout} lang={selectedLanguage}>
                            <strong>{getTargetText(translations[element.name]?.description)}</strong>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                  <div className={styles.rowActions}>
                    {editingElements.has(element.name) ? (
                      <>
                        <button className={styles.button} type="button" onClick={() => void saveTranslations(element.name)} disabled={saving}>
                          Save
                        </button>
                        <button className={styles.secondaryButton} type="button" onClick={() => stopEditingElement(element.name)} disabled={saving}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className={styles.smallButton}
                        type="button"
                        onClick={() => startEditingElement(element.name)}
                        disabled={!canEdit || saving}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
                {element.choices.length > 0 ? (
                  <div className={styles.choiceRows}>
                    {element.choices.map((choice) => {
                      const editKey = choiceEditKey(element.name, choice.value);
                      return (
                        <div className={styles.choiceRow} key={`${element.name}-${choice.value}`}>
                          <div className={styles.choiceValue}>{choice.value}</div>
                          <div className={styles.englishText}>{choice.text || choice.value}</div>
                          {editingChoices.has(editKey) ? (
                            <input
                              className={styles.inlineInput}
                              lang={selectedLanguage}
                              dir="auto"
                              value={translations[element.name]?.choices?.[choice.value] || ""}
                              disabled={saving}
                              onChange={(event) => setChoiceTranslation(element.name, choice.value, event.target.value)}
                              placeholder="Option text"
                            />
                          ) : (
                            <div className={styles.targetReadout} lang={selectedLanguage}>
                              <strong>{getTargetText(translations[element.name]?.choices?.[choice.value])}</strong>
                            </div>
                          )}
                          <div className={styles.rowActions}>
                            {editingChoices.has(editKey) ? (
                              <>
                                <button
                                  className={styles.button}
                                  type="button"
                                  onClick={() => void saveTranslations(undefined, editKey)}
                                  disabled={saving}
                                >
                                  Save
                                </button>
                                <button
                                  className={styles.secondaryButton}
                                  type="button"
                                  onClick={() => stopEditingChoice(element.name, choice.value)}
                                  disabled={saving}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                className={styles.smallButton}
                                type="button"
                                onClick={() => startEditingChoice(element.name, choice.value)}
                                disabled={!canEdit || saving}
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}

        <div className={styles.editorFootnote}>
          Central admin can always edit. Site users need permission ON.
        </div>
      </section>
    </div>
  );
}
