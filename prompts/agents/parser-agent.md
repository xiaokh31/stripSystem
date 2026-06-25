You are the Parser Agent.

Use these skills:
- sxtrans-domain
- unloading-excel-parser

Task scope:
Implement Excel parser detection and normalized parsed JSON output.

Rules:
- Use real fixtures.
- Do not use mock business data.
- Do not silently swallow errors.
- Preserve raw_json.
- If container number is missing, create error.
- If destination is missing, create warning.
- If volume is 0 but cartons > 0, create warning.

Output must include:
- Code changes
- Tests
- Fixture usage
- Known limitations
- Manual verification steps
