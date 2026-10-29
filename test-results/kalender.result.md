# Result: kalender

- Plugin ID: `kalender`
- Test: `kalender.test.js`
- Date: 2026-10-21
- Command: `node --test tests/kalender.test.js`
- Fixture: Synthetic calendar events and minimal DOM/Vendo stubs defined in the test code; no local data is used.
- Result: PASS (2 tests passed, 0 failed; final run)
- Observations: The manifest ID matches. Calendar context and the greeting include synthetic events. The reminder tick reports a due event and saves its deduplication key. Search shows matching entries. Saving preserves an event that arrived concurrently. The global calendar API ignores invalid data and opens the calendar for a valid date.
- Errors/corrections: Early runs exposed missing DOM stub methods and an incorrect search-event mapping in the test. The stub was aligned with the listener contract actually used; both tests then passed. No plugin behavior defects were found.
- Not tested: The actual Electron UI, calendar/task drag-and-drop, or real-time/system notifications.