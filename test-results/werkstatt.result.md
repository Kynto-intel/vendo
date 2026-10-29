# Result: werkstatt

- Plugin ID: `werkstatt`
- Test: `werkstatt.test.js`
- Date: 2026-10-29
- Command: `node --test tests/werkstatt.test.js`
- Fixture: Synthetic plugin manifests and JavaScript files in a temporary OS directory, removed after the run. No real drafts, workshop data, credentials, or Vendo data are used.
- Result: PASS (4 tests passed, 0 failed)
- Observations: All eight versioned plugin manifests select an approved local sidebar symbol. The Werkstatt checker accepts valid symbols and rejects missing or unknown values; synthetic-draft permission and syntax checks still pass.
- Errors/corrections: The first icon-test run exposed a missing `readFile` import. The import was added and the final run passed 4/4.
- Not tested: The sidebar icons in a running Electron window, the locally ignored Rechnungen manifest as part of the shared test suite, plugin installation, and IPC behavior. Rechnungen remains a local-only plugin and is not required by shared tests.
