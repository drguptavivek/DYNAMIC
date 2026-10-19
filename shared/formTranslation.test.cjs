const assert = require('node:assert/strict');
const test = require('node:test');
const { flattenFormText, extractFormTextTranslations, applyFormTextTranslations } = require('./formTranslation.cjs');

test('all presentation text is inventoried and translated without changing logic or values', () => {
  const form = { title: 'Survey', description: 'Instructions', completeText: 'Finish', nativeText: { camera: 'Camera' }, pages: [{ name: 'one', title: 'Heading', description: 'Section help', elements: [{ name: 'q', type: 'paneldynamic', title: 'Member', description: 'Help', visibleIf: '{x}=1', addPanelText: 'Add member', templateTitle: 'Member {panelIndex}', templateElements: [{ name: 'name', type: 'text', title: 'Name', placeholder: 'Enter name', validators: [{ type: 'regex', regex: '^ok$', text: 'Try again' }] }, { name: 'options', type: 'dropdown', choices: [1, { value: 2, text: { default: 'Two', hi: 'Existing two' } }], items: [{ name: 'name', title: 'Distinct item', text: 'Item text' }] }, { name: 'note', type: 'html', html: '<p>Instructions</p>' }] }] }] };
  const original = structuredClone(form);
  const rows = flattenFormText(form);
  assert.equal(new Set(rows.map(row => row.name)).size, rows.length);
  assert.ok(rows.some(row => row.name === '@form' && row.title === 'Survey'));
  assert.ok(rows.some(row => row.name === '@page:one' && row.title === 'Heading'));
  assert.ok(rows.some(row => row.title === 'Try again'));
  assert.ok(rows.some(row => row.title === 'Distinct item' && row.name !== 'name'));
  const dictionary = Object.fromEntries(rows.map(row => [row.name, { title: `HI:${row.title}`, ...(row.description && { description: `HI:${row.description}` }), ...(row.choices.length && { choices: Object.fromEntries(row.choices.map(choice => [choice.value, `HI:${choice.text}`])) }) }]));
  const translated = applyFormTextTranslations(form, 'hi', dictionary);
  const extracted = extractFormTextTranslations(translated, 'hi');
  assert.deepEqual(extracted, dictionary);
  assert.deepEqual(form, original);
  assert.equal(translated.pages[0].elements[0].visibleIf, '{x}=1');
  assert.equal(translated.pages[0].elements[0].templateElements[0].validators[0].regex, '^ok$');
  assert.equal(translated.pages[0].elements[0].templateElements[1].choices[0].value, 1);
  assert.deepEqual(translated.nativeText.camera, { default: 'Camera', hi: 'HI:Camera' });
});

test('raw and prepared overlay preserve exactly one source-code prefix and bundled locales', () => {
  const raw = { pages: [{ name: 'p', elements: [{ name: 'name', type: 'text', sourceCode: '2_i', title: { default: 'Name', ta: 'Tamil' } }] }] };
  const prepared = { pages: [{ name: 'p', elements: [{ name: 'name', type: 'text', title: { default: '2_i. Name', ta: '2_i. Tamil' } }] }] };
  const dictionary = { name: { title: 'Hindi' } };
  assert.equal(applyFormTextTranslations(prepared, 'hi', dictionary, raw).pages[0].elements[0].title.hi, '2_i. Hindi');
  assert.equal(applyFormTextTranslations(prepared, 'hi', { name: { title: '2_i. Hindi' } }, raw).pages[0].elements[0].title.hi, '2_i. Hindi');
  const rawTranslated = applyFormTextTranslations(raw, 'hi', { name: { title: '2_i. Hindi' } });
  assert.equal(rawTranslated.pages[0].elements[0].title.hi, 'Hindi');
  assert.equal(rawTranslated.pages[0].elements[0].title.ta, 'Tamil');
  assert.equal(extractFormTextTranslations(raw, 'ta').name.title, 'Tamil');
});


test('duplicate named fields translate only their exact inventory key and clear independently', () => {
  const form = { pages: [{ name: 'p', elements: [{ name: 'same', type: 'text', title: 'First question' }, { name: 'same', type: 'text', title: 'Different question' }] }] };
  const rows = flattenFormText(form);
  const secondKey = rows.find(row => row.title === 'Different question').name;
  assert.notEqual(secondKey, 'same');
  const legacyOnly = applyFormTextTranslations(form, 'hi', { same: { title: 'First Hindi' } });
  assert.equal(legacyOnly.pages[0].elements[0].title.hi, 'First Hindi');
  assert.equal(legacyOnly.pages[0].elements[1].title, 'Different question');
  const both = applyFormTextTranslations(form, 'hi', { same: { title: 'First Hindi' }, [secondKey]: { title: 'Second Hindi' } });
  assert.equal(both.pages[0].elements[1].title.hi, 'Second Hindi');
  const cleared = applyFormTextTranslations(form, 'hi', { same: { title: 'First Hindi' }, [secondKey]: {} });
  assert.equal(cleared.pages[0].elements[0].title.hi, 'First Hindi');
  assert.equal(cleared.pages[0].elements[1].title, 'Different question');
});


test('prepared overlays do not resurrect intentionally removed descriptions', () => {
  const raw = { pages: [{ name: 'p', elements: [{ name: 'removed', type: 'text', title: 'Question', description: { default: 'Retired help', hi: 'Retired Hindi' } }, { name: 'retained', type: 'text', title: 'Question two', description: 'Current help' }] }] };
  const prepared = structuredClone(raw);
  delete prepared.pages[0].elements[0].description;
  const dictionary = { ...extractFormTextTranslations(raw, 'hi'), retained: { description: 'Current Hindi' } };
  const translated = applyFormTextTranslations(prepared, 'hi', dictionary, raw);
  assert.equal(Object.hasOwn(translated.pages[0].elements[0], 'description'), false);
  assert.deepEqual(translated.pages[0].elements[1].description, { default: 'Current help', hi: 'Current Hindi' });
  prepared.pages[0].elements[0].description = '';
  assert.equal(applyFormTextTranslations(prepared, 'hi', dictionary, raw).pages[0].elements[0].description, '');
});
