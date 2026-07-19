---
status: accepted
date: 2026-07-18
---

# Use approved deterministic parser profiles instead of self-modifying parsing

Customer workbooks vary too much for one hardcoded header detector, but one manual unloading report does not contain enough evidence to safely train an unconstrained parser. The system will therefore learn versioned deterministic parser profiles from an explicitly linked failed import, field mapping and completed manual outcome. The first profile version requires authorized approval and enters review-required mode; only three consecutive distinct-SHA accepted imports with no material parser correction promote it to trusted automatic parsing. A material parser correction resets the current evidence streak, and a later material correction demotes a trusted version back to review-required. Unloading completion is evidence timing, not mapping approval, and no model may silently rewrite or activate production parsing rules.
