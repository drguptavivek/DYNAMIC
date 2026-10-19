function normalizeHdssHouseNumber(value) {
  const source = String(value ?? "");
  const digits = source.trim();
  return /^\d{1,3}$/.test(digits) ? digits.padStart(4, "0") : source;
}

module.exports = { normalizeHdssHouseNumber };
