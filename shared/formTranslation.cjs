const TEXT_PROPERTIES = new Set([
  'html', 'placeholder', 'text', 'templateTitle', 'addPanelText', 'removePanelText',
  'panelAddText', 'panelRemoveText', 'addRowText', 'removeRowText', 'confirmDeleteText',
  'completeText', 'pageNextText', 'pagePrevText', 'startSurveyText', 'requiredErrorText',
  'otherText', 'noneText', 'selectAllText', 'otherPlaceholder', 'otherErrorText',
  'commentText', 'commentPlaceholder', 'label', 'caption', 'emptyText', 'noRowsText',
]);
const CHILD_ARRAYS = ['elements', 'templateElements', 'items', 'columns', 'rows', 'validators', 'specialChoices'];
const LANGUAGE_LABELS = { hi: 'Hindi', kn: 'Kannada', mr: 'Marathi', ta: 'Tamil', te: 'Telugu', en: 'English' };
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const english = value => typeof value === 'string' ? value : isObject(value) ? String(value.default ?? value.en ?? value.english ?? '') : '';
const localized = (value, locale) => isObject(value) ? value[locale] ?? value[LANGUAGE_LABELS[locale]] ?? value[LANGUAGE_LABELS[locale]?.toLowerCase()] : undefined;
const localizedObject = value => isObject(value) ? { ...value } : { default: value == null ? '' : String(value) };

// One inventory drives editor rows, embedded translations and mobile application.
function visitFormText(form, visit) {
  let order = 0;
  const seenNames = new Set();
  function walk(node, owner, page, kind, allowLegacy = true) {
    if (!isObject(node)) return;
    const legacyName = allowLegacy && typeof node.name === 'string' ? node.name : '';
    const name = kind === 'form' || kind === 'page' ? owner : legacyName && !seenNames.has(legacyName) ? legacyName : `@text:${owner}:title`;
    if (legacyName) seenNames.add(legacyName);
    const choices = Array.isArray(node.choices) ? node.choices : [];
    if (node.title != null || node.description != null || legacyName || choices.length) {
      visit({ name, legacyName, node, titleProp: 'title', descriptionProp: 'description', choices, page, kind, order: order++ });
    }
    for (const property of TEXT_PROPERTIES) {
      if (node[property] == null || !english(node[property])) continue;
      visit({ name: `@text:${owner}:${property}`, node, titleProp: property, choices: [], page, kind: 'text', order: order++ });
    }
    for (const key of CHILD_ARRAYS) {
      if (!Array.isArray(node[key])) continue;
      const siblingNames = new Set();
      node[key].forEach((child, index) => {
        const childName = isObject(child) && child.name ? child.name : String(index);
        const suffix = siblingNames.has(childName) ? `~${index}` : '';
        siblingNames.add(childName);
        const childOwner = `${owner}/${key}/${encodeURIComponent(childName)}${suffix}`;
        walk(child, childOwner, page, 'element', key === 'elements' || key === 'templateElements');
      });
    }
    walk(node.unknownChoice, `${owner}/unknownChoice`, page, 'element', false);
  }
  walk(form, '@form', undefined, 'form', false);
  (form.pages || []).forEach((page, index) => {
    if (isObject(page)) walk(page, `@page:${page.name || index}`, page, 'page', false);
  });
  for (const [key, value] of Object.entries(form.nativeText || {})) {
    visit({ name: `@native:${key}`, node: form.nativeText, titleProp: key, choices: [], kind: 'native', order: order++ });
  }
}

function flattenFormText(form) {
  const rows = [];
  visitFormText(form, entry => {
    const { node, page, titleProp, descriptionProp } = entry;
    const row = {
      name: entry.name, type: typeof node.type === 'string' ? node.type : undefined,
      title: english(node[titleProp] ?? (entry.kind === 'element' ? node.name : '')),
      description: descriptionProp ? english(node[descriptionProp]) : '',
      page_name: page?.name, page_title: english(page?.title),
      source_code: typeof node.sourceCode === 'string' ? node.sourceCode : undefined,
      order: typeof node.order === 'number' ? node.order : entry.order,
      section_order: typeof node.section_order === 'number' ? node.section_order : undefined,
      choices: entry.choices.map(choice => ({ value: String(isObject(choice) ? choice.value ?? '' : choice ?? ''), text: english(isObject(choice) ? choice.text ?? choice.value : String(choice ?? '')) })),
    };
    if (entry.kind !== 'element') row.kind = entry.kind;
    rows.push(row);
  });
  return rows;
}

function extractFormTextTranslations(form, locale) {
  const result = {};
  visitFormText(form, entry => {
    const item = {};
    const title = localized(entry.node[entry.titleProp], locale);
    const description = entry.descriptionProp && localized(entry.node[entry.descriptionProp], locale);
    if (typeof title === 'string' && title.trim()) item.title = title.trim();
    if (typeof description === 'string' && description.trim()) item.description = description.trim();
    const choices = {};
    for (const choice of entry.choices) {
      const text = isObject(choice) && localized(choice.text, locale);
      if (typeof text === 'string' && text.trim()) choices[String(choice.value ?? '')] = text.trim();
    }
    if (Object.keys(choices).length) item.choices = choices;
    if (Object.keys(item).length) result[entry.name] = item;
  });
  return result;
}

function applyFormTextTranslations(form, locale, translations, sourceForm) {
  const result = JSON.parse(JSON.stringify(form));
  const sourceCodes = new Map();
  if (sourceForm) visitFormText(sourceForm, entry => {
    if (entry.node.sourceCode && entry.node.sourceType !== 'text_other_specify') sourceCodes.set(entry.name, String(entry.node.sourceCode));
  });
  visitFormText(result, entry => {
    const item = translations[entry.name];
    if (!item) return;
    if (typeof item.title === 'string' && item.title.trim()) {
      let title = item.title;
      const code = sourceCodes.get(entry.name) || sourceCodes.get(entry.legacyName) || entry.node.sourceCode;
      if (code && entry.titleProp === 'title') {
        const prefix = `${code}. `;
        const preparedHasPrefix = english(entry.node.title).startsWith(prefix);
        if (sourceForm && preparedHasPrefix && !title.startsWith(prefix)) title = prefix + title;
        if (!sourceForm && !preparedHasPrefix && title.startsWith(prefix)) title = title.slice(prefix.length);
      }
      entry.node[entry.titleProp] = { ...localizedObject(entry.node[entry.titleProp]), [locale]: title };
    }
    if (entry.descriptionProp && english(entry.node[entry.descriptionProp]).trim() && typeof item.description === 'string' && item.description.trim()) {
      entry.node[entry.descriptionProp] = { ...localizedObject(entry.node[entry.descriptionProp]), [locale]: item.description };
    }
    entry.choices.forEach((choice, index) => {
      const value = String(isObject(choice) ? choice.value ?? '' : choice ?? '');
      const text = item.choices?.[value];
      if (typeof text !== 'string' || !text.trim()) return;
      const next = isObject(choice) ? choice : { value: choice, text: String(choice ?? '') };
      next.text = { ...localizedObject(next.text ?? next.value), [locale]: text };
      entry.node.choices[index] = next;
    });
  });
  return result;
}
module.exports = { flattenFormText, extractFormTextTranslations, applyFormTextTranslations };
