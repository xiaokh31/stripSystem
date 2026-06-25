---
name: unloading-report-generator
description: Use for writing parsed unloading data into the Excel unloading report template.
---

# Unloading Report Generator Skill

## Template

Primary template:
- samples/templates/卸柜报告-En.xlsx

## Known Cells

- Sheet1 is the main report.
- C1 is DATE label area.
- G1 is Time label area.
- I1 is Container/T # label area.
- K1 is used for container number in sample output.
- D2 is company name.
- O column is PLT.
- P column is CTN.
- P20 is total carton count.

## Rules

- Copy the template; never modify the template directly.
- Generated file path must include container number.
- Generated workbook must be openable by Excel.
- Generated report must include container number, date, destination, pallet count, carton count, and total carton count.
- Cell mappings must have tests.
- If a required value is missing, write a warning into task report instead of silently generating wrong output.
