# ADR-0002: Printing Strategy

## Status

Accepted for P4 pilot.

P4-PRINT-03 review on 2026-07-08: keep PDF/manual printing and do not build a
local print agent prototype yet. The task was checked before pilot target
printing data was available, so the escalation condition has not been met.

## Context

The system generates pallet labels for warehouse loading. Each physical label
must be 150mm x 100mm, and the QR target size is 25mm x 25mm. The QR payload
must contain a unique pallet ID, and reprint activity must be auditable.

Phase 0 proved PDF label generation. P4 adds print-size verification and
reprint audit. The remaining architecture decision is whether the system should
continue with PDF/manual printing during pilot, use browser printing, package a
desktop app with Tauri, install a local print agent, or print directly through
ZPL/TSPL.

## Decision Drivers

- Keep labels physically accurate at 150mm x 100mm.
- Keep QR codes scannable at about 25mm x 25mm.
- Preserve auditability for generated labels and reprint requests.
- Avoid adding printer-specific infrastructure before warehouse printer models
  and driver behavior are known.
- Keep the pilot simple enough for office and warehouse operators to run.

## Options

### 1. PDF Manual Printing

Description:
- The web/API workflow generates a 150mm x 100mm PDF label file.
- Operators download or open the PDF and print it through the installed PDF
  viewer or browser PDF viewer.

Pros:
- Already matches the current label generation path.
- Easy to inspect before printing.
- Works without desktop packaging, local services, printer-language templates,
  or device-specific printer commands.
- Keeps generated label PDFs as durable business artifacts.

Cons:
- Operators can accidentally enable automatic scaling.
- PDF viewers and printer drivers may add margins or change page handling.
- Reprint audit depends on operators using the system workflow before printing.

Controls required:
- Use the print calibration PDF before pilot printing.
- Disable automatic scaling and print at actual size / 100%.
- Confirm the printed outer size is 150mm x 100mm.
- Confirm the printed QR area is about 25mm x 25mm and scans successfully.

### 2. Browser Printing

Description:
- The web app triggers browser print for labels or renders printable HTML/CSS.

Pros:
- Simple user flow from the web UI.
- No separate desktop app or local service.

Cons:
- Browser print dialogs still expose scaling and paper-size choices.
- CSS print behavior varies across browsers and operating systems.
- Direct printer selection and driver defaults are hard to control.
- Hidden auto-print flows would weaken audit unless every print request is
  recorded first.

Conclusion:
- Browser printing can remain a convenience around the PDF, but it should not be
  treated as a stronger control than PDF manual printing.

### 3. Tauri Local Printer Access

Description:
- Package the web UI in a Tauri desktop shell and use native code or plugins to
  access local printer capabilities.

Pros:
- Can provide a controlled desktop entry point for office PCs.
- Can integrate printer selection, saved settings, and local hardware checks.
- May reduce operator exposure to browser/PDF viewer differences.

Cons:
- Adds desktop packaging, installer, update, signing, and support work.
- Still depends on OS-specific printer drivers and label printer setup.
- Does not automatically solve physical scaling unless printer settings are
  controlled and verified.
- More operational burden than needed before the pilot proves the print volume
  and failure rate.

Conclusion:
- Do not implement Tauri in P4. Revisit only if the warehouse needs a managed
  desktop shell for more than printing.

### 4. Local Print Agent

Description:
- Install a small local service on the print workstation. The web app or API
  sends print jobs to localhost or the LAN agent, and the agent submits jobs to
  configured printers.

Pros:
- Better separation between web workflow and local printer control.
- Can centralize printer settings, printer discovery, job logging, and future
  hardware-specific behavior.
- Can require the API reprint audit before allowing a reprint job.
- Easier to evolve toward ZPL/TSPL or vendor SDKs than browser-only printing.

Cons:
- Adds another service to install, run, monitor, upgrade, and secure.
- Needs a localhost/LAN trust model and clear CORS/auth behavior.
- Can fail independently from the web/API stack.
- Requires operational runbooks and health checks.

Conclusion:
- This is the preferred escalation path if pilot PDF printing is unreliable.
  Do not build it until the pilot captures printer models, driver settings, and
  actual print failure modes.

### 5. ZPL/TSPL Direct Printing

Description:
- Generate printer-language commands for compatible label printers and submit
  them directly through a print agent, network socket, or printer queue.

Pros:
- Best control over physical label size on compatible label printers.
- Avoids PDF viewer scaling issues.
- Efficient for high-volume label printing.

Cons:
- Printer-language and model specific.
- Requires validating the actual warehouse printer fleet.
- Requires a second label layout implementation separate from PDF.
- Harder to support in mixed printer environments.

Conclusion:
- Do not implement ZPL/TSPL in P4. Evaluate after printer models and label
  stock are confirmed, and preferably through a local print agent rather than
  direct browser behavior.

## Decision

Use PDF manual printing as the current recommended P4 pilot approach, with two
mandatory controls:

1. Print-size verification must be available and used before pilot printing.
2. Reprint requests must be recorded through the API before labels are reprinted.

Do not build Tauri, a local print agent, or ZPL/TSPL direct printing in P4.

If pilot printing is unreliable even with scaling disabled and calibration
verified, the next recommended architecture is a local print agent. Tauri should
only be reconsidered if the project needs a managed desktop application for
broader workstation control, not only printing.

## P4-PRINT-03 Decision Record

Pilot print data available for this review:

| Input | Status | Notes |
| --- | --- | --- |
| Printer model | Not provided | Required before selecting PDF driver controls, ZPL/TSPL, or a print SDK. |
| Label stock and supplier | Not provided | Required before physical-size acceptance. |
| Driver version and default scaling | Not provided | Required before deciding whether manual PDF printing is unreliable. |
| PDF viewer or browser used for printing | Not provided | Required because scaling behavior can differ by viewer. |
| Failed print samples and frequency | Not provided | No evidence that PDF/manual printing is failing often enough to justify another local service. |
| Requirement for ZPL/TSPL vs PDF | Not provided | Keep PDF as the durable generated business artifact. |

Conclusion:

- `print agent not activated before pilot print evidence`
- Printer/platform blocker: pilot printer model, driver, PDF viewer, label
  stock, failed print samples, and failure frequency are missing, so a prototype
  would be premature.
- Continue PDF/manual printing with calibration and reprint audit.
- Do not implement hidden browser auto-print, Tauri, local print agent, ZPL/TSPL,
  or printer-vendor SDK in this task.
- Reopen the local print agent design only when the pilot issue log shows
  repeated print scaling errors, QR scan failures, high-volume manual-print
  bottlenecks, or a supervisor-approved need for direct printer control.

If the escalation condition is met later, the minimum local print agent design
must include:

| Area | Minimum requirement |
| --- | --- |
| Healthcheck | A local `/health` endpoint that reports agent version, configured printer, dry-run status, and last job state. |
| Dry-run mode | Accepts a job and validates the referenced generated label file or reprint token without sending anything to the printer. |
| Job input | Accepts only an API-issued generated file reference or audited reprint token; never accepts arbitrary client file paths as business evidence. |
| Audit | Requires generated-file or reprint audit to exist before print submission; print transport must not be the audit source of truth. |
| Security | Uses localhost or explicitly approved LAN binding, narrow CORS, operator authentication, and no database credentials. |
| Scope | Cannot update inventory, pallet status, load jobs, or historical scan events. |
| Failure handling | Returns clear errors for printer unavailable, file missing, token rejected, unsupported paper size, and driver failure. |
| Fallback | Keeps existing PDF download/manual print path available. |

## Rationale

- The current system already generates label PDFs and records generated label
  files.
- The immediate operational risk is incorrect print scaling, not missing print
  transport.
- A calibration PDF and operator checklist are cheaper and faster to validate
  than desktop packaging or a local service.
- Reprint audit can be handled at the API layer without changing the print
  transport.
- Printer models, driver defaults, label stock, and warehouse failure modes are
  not yet known enough to justify ZPL/TSPL or a print agent.

## Risks

- Operators may print with scaling enabled.
- Different PDF viewers may handle label paper differently.
- Printer drivers may add margins or override paper size.
- Operators may reprint old local PDFs without using the audited reprint flow.
- Manual PDF printing may be too slow or error-prone at higher volume.

## Mitigations

- Generate and print `storage/labels/print-calibration.pdf`.
- Disable automatic scaling and print at actual size / 100%.
- Verify the printed outer size is 150mm x 100mm.
- Verify the QR target is about 25mm x 25mm and scans with the warehouse scanner.
- Add pilot checklist entries for printer model, driver setting, label stock,
  PDF viewer, and QR scan result.
- Require reprint requests to go through the API workflow before operators
  receive the label file or reprint instruction.

## Migration Path

1. P4 pilot: keep PDF manual printing, calibration PDF, and reprint audit API.
2. Capture printer model, driver settings, label stock, PDF viewer, operating
   system, print failure rate, and scan failure rate during pilot.
3. If PDF printing is reliable, keep the PDF path and improve operator runbooks.
4. If scaling or printer settings remain unreliable, design a local print agent
   with explicit printer configuration, health checks, and audit integration.
5. If printer models are standardized and support ZPL/TSPL, add a printer
   language backend behind the local print agent.
6. Reconsider Tauri only if operators need a managed desktop shell for multiple
   workflows beyond printing.

## Not Doing Now

- No hidden browser auto-print flow.
- No Tauri desktop packaging in P4.
- No local print agent in P4.
- No ZPL/TSPL label renderer in P4.
- No printer-vendor SDK integration in P4.
- No direct printing that bypasses generated-file records or reprint audit.

## P4 Follow-Up Tasks

- Add or verify the print-size verification page/PDF workflow.
- Keep the reprint audit API mandatory before reprint actions.
- Add pilot checklist fields for printer model, driver settings, PDF viewer,
  label stock, scaling setting, measured label size, and QR scan result.
- Document operator print steps in the warehouse manual.
- After pilot, decide whether to keep PDF printing or open a local print-agent
  implementation task.
