# WEB-OPS-04 Operational Clock Performance Assessment

Date: 2026-07-14 (America/Edmonton)

## Conclusion

The live operational clock has fixed-size runtime state and stays inside one client leaf. At desktop width it maintains one
self-correcting timeout and renders the clock once per second. Across two consecutive 60-second dynamic windows, timer count
stayed at 1, the two relevant listeners stayed at 2, DOM node/document counts stayed fixed, and no non-clock header mutation was
observed. The retained heap reached a warm plateau: the first active window added 161,348 bytes after formatter/JIT warm-up, while
the second added only 1,912 bytes (about 1.2% of the first-window change), with no timer, listener, node, document, or render-scope
growth. This is consistent with fixed cache/runtime objects rather than a per-tick leak.

## Implementation boundary

- `OfficeShell` remains a Server Component. It passes one server-generated ISO value into `OperationalClock`; the client first
  render therefore matches SSR without clock-level `suppressHydrationWarning`.
- Only the `<time>` leaf and its local running/update state change. The element exposes a machine-readable `dateTime` value and no
  `aria-live` attribute.
- Each callback reads `Date.now()` and schedules the next timeout against the next real second boundary. Delayed callbacks realign
  instead of adding 1,000 ms to prior state.
- A module-level lazy `Intl.DateTimeFormat` cache constructs one formatter per JS runtime. Unit coverage reuses that instance for
  60 ticks and retains Edmonton MDT/MST, invalid-date, and invalid-timezone fallback cases.
- `visibilitychange` and `(min-width: 1280px)` media-query listeners are installed once and removed with the timeout on cleanup.
  Cleanup does not invoke a React state update.

## Docker Chromium method

`web-ops-clock.spec.ts` ran through nginx against the Docker production stack. Before every CDP sample it requested
`HeapProfiler.collectGarbage`, then captured `Performance.getMetrics` plus a browser probe for timeout/listener count, clock leaf
updates, clock instances, and non-clock header mutations. The static baseline used 1279px, immediately below the visible `xl`
header breakpoint. Two consecutive active windows used 1366px. Hidden visibility, 390px, and 768px each ran for 60 seconds before
one final desktop resume sample.

| 60-second window | Clock updates | Active timeouts | Relevant listeners | Nodes / documents | GC heap delta | Script time delta | Task time delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Static 1279px baseline | 0 | 0 | 2 | 2354 / 2 | +14,592 B | 0 ms | 56.670 ms |
| Dynamic window 1 | 60 | 1 | 2 | 2354 / 2 | +161,348 B | 33.592 ms | 211.891 ms |
| Dynamic window 2 | 60 | 1 | 2 | 2354 / 2 | +1,912 B | 27.552 ms | 212.962 ms |

The second active window retained only 1,912 additional bytes after GC while all structural counts remained unchanged. CPU cost
was about 0.46-0.56 ms of script time per visible clock update; total task time included Playwright/CDP sampling and other page
work. No absolute MB threshold was used.

## Pause, isolation, and i18n evidence

- The 60-second hidden-visibility window had zero clock updates. Returning to visible produced exactly one immediate correction.
- Both 390px and 768px had zero clock updates for their full 60-second windows. Returning to 1366px restored one timeout and a
  current value within 1.1 seconds of `Date.now()`.
- Both dynamic windows had exactly 60 leaf updates and zero non-clock header mutations. Timer/listener counts did not increase.
- Theme, route, and en -> zh-CN reload checks retained exactly one clock, one source/timezone, and no hydration, console, page, or
  mixed-language error. A 2.2-second request probe observed no `/api/` request from clock ticks.
- Unit tests cover one timer after 60 ticks, delayed-callback realignment, hidden/narrow pause, immediate resume, Strict Mode-safe
  teardown behavior, and zero timer/listener/callback activity after cleanup.

Raw sampled values are written to `test-results/web-ops-04/clock-performance.json`; no long trace is committed.

## Limitations and manual verification

Headless Chromium and Xvfb do not naturally mark Playwright-created background targets hidden. The repeatable Docker check therefore
sets that page's `document.visibilityState` contract to `hidden`/`visible` and dispatches the native `visibilitychange` event; this
exercises the production listener and scheduler without freezing all browser timers. Unit tests independently verify cleanup and
timer cardinality. An optional manual smoke is to leave a desktop tab open for 60 seconds, background it for 60 seconds, then return
and confirm the clock corrects immediately; no external sign-off is required for this repository task.
