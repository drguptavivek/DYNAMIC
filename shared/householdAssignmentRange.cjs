function integer(value, label) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new RangeError(`${label} must be a whole number.`);
  }
  return Number(value);
}

function locality(value) {
  const text = String(value).trim();
  const number = integer(text, 'Locality code');
  if (text.length > 2) throw new RangeError('Locality code must contain at most two digits.');
  return String(number).padStart(2, '0');
}

function structure(value) {
  const text = String(value).trim().toUpperCase();
  if (!/^[A-Z0-9]{1,6}$/.test(text)) throw new RangeError('Invalid structure/map ID.');
  return /^\d+$/.test(text) ? text.padStart(4, '0') : text;
}

function bound(value) {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  if (/^\d+$/.test(text)) return { number: integer(text, 'Household number') };
  const parts = text.split('-');
  if (parts.length !== 4) {
    throw new RangeError('Enter a household number or a full ID such as 2-02-0010-10.');
  }
  const siteId = integer(parts[0], 'Site ID');
  if (siteId < 1) throw new RangeError('Site ID must be positive.');
  return {
    number: integer(parts[3], 'Household number'), siteId,
    localityCode: locality(parts[1]), structureMapId: structure(parts[2]),
  };
}

function parseHouseholdAssignmentRange(start, end, scope = {}) {
  const first = bound(start);
  const last = bound(end);
  const range = {};
  if (scope.siteId !== undefined) {
    range.siteId = integer(String(scope.siteId), 'Site ID');
    if (range.siteId < 1) throw new RangeError('Site ID must be positive.');
  }
  if (scope.localityCode?.trim()) range.localityCode = locality(scope.localityCode);
  if (first && last && (first.siteId !== undefined) !== (last.siteId !== undefined)) {
    throw new RangeError('Use household numbers for both bounds, or full household IDs for both bounds.');
  }
  for (const item of [first, last]) {
    if (item?.siteId === undefined) continue;
    for (const key of ['siteId', 'localityCode', 'structureMapId']) {
      if (range[key] !== undefined && range[key] !== item[key]) {
        throw new RangeError('Household range must use the same site, locality and structure, matching the selected filters.');
      }
      range[key] = item[key];
    }
  }
  if (first) range.start = first.number;
  if (last) range.end = last.number;
  if (first && last && first.number > last.number) {
    throw new RangeError('Household range start must not exceed the end.');
  }
  return range;
}

function isHouseholdInAssignmentRange(household, range) {
  const parts = String(household.household_id ?? '').split('-');
  try {
    if (range.siteId !== undefined && integer(String(household.site_id ?? parts[0]), 'Site ID') !== range.siteId) return false;
    if (range.localityCode !== undefined && locality(household.locality_code ?? parts[1]) !== range.localityCode) return false;
    if (range.structureMapId !== undefined && structure(household.structure_map_id ?? parts[2]) !== range.structureMapId) return false;
    if (range.start === undefined && range.end === undefined) return true;
    const number = integer(String(household.household_number ?? parts[3]).trim(), 'Household number');
    return (range.start === undefined || number >= range.start) && (range.end === undefined || number <= range.end);
  } catch {
    return false;
  }
}

module.exports = { parseHouseholdAssignmentRange, isHouseholdInAssignmentRange };
