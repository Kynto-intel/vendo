# Weather test report

- Date: 2026-10-21
- Command: `node --test tests/wetter.test.js`
- Fixture: Synthetic forecast data from `wetter.test.js`; `fetch`, the DOM/Vendo API, and renderer timers are stubbed. No real location, user, or runtime data is used.
- Result: PASS (4 tests)

## Observations

- The manifest, daily weather summary, context, greeting, and weather card are checked against synthetic forecast data.
- The unavailable-forecast error state is rendered; context and greeting remain empty.
- Main-process search limits input and maps synthetic location data. Forecast parameters, caching, and HTTP errors are checked.
- The first run remained open after printing its results because `ansicht.js` registers a 20-minute interval. The test now stubs `setInterval` and restores the original global value, allowing Node to exit normally.
- The final run passed 4/4 tests. Node emitted a warning because the package does not explicitly declare its module type; this did not affect the result.

## Not run

- BLOCKED: Interactive use in the real Vendo/Electron window, including location search/selection, chart hover, tab/day changes, and resizing. The test uses DOM stubs and does not exercise these events through actual user interaction.
- BLOCKED: Live Open-Meteo requests and the real 20-minute refresh. Network requests and timers are intentionally synthetic so the test remains reproducible and does not require external services.

## Errors

- No errors in the final run. Earlier failures were in the test setup: missing event methods in the SVG stub, an overly broad URL filter, and an imprecise expectation for “Light rain.” These test assumptions were corrected.