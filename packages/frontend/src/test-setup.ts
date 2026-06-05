import '@testing-library/jest-dom/vitest';

// jsdom has no layout engine, so window.scrollTo is unimplemented and logs a
// noisy "Not implemented" line. Components legitimately call it on navigation;
// stub it to a no-op to keep test output clean.
window.scrollTo = (): void => {};
