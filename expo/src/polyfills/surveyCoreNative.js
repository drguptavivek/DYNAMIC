/**
 * Supplies the event-listener surface Survey Core probes on React Native's DOM-less window.
 */
if (typeof window !== "undefined") {
  if (typeof window.addEventListener !== "function") {
    window.addEventListener = () => {};
  }
  if (typeof window.removeEventListener !== "function") {
    window.removeEventListener = () => {};
  }
}
