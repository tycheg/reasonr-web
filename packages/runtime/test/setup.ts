// jsdom: what it lacks and Ant Design needs.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
});
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

// jsdom cannot do getComputedStyle with a pseudo-element: Ant Design
// measures the scrollbar with it.
const computed = window.getComputedStyle.bind(window);
window.getComputedStyle = (elt: Element) => computed(elt);
