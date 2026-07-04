# Phase 0 Real Excel Fixtures

Phase 0 uses real unloading plan Excel files from `samples/unloading-plans`.
These files are the fixture source of truth for parser discovery and regression
tests. They must not be replaced by hand-written mock spreadsheets.

WAGE-P0 also uses real legacy Excel files from `samples/wage` for attendance
record parsing and wage record generation. These files are `.xls` BIFF
workbooks and must stay byte-preserved.

UNLOAD-WAGE-P0 uses a small reviewed JSON fixture from `samples/unloading-wage`
for settlement rule validation. It references real container numbers from
`samples/unloading-plans`; prototype worker IDs and assignments are not real
payroll data.

## Fixture Policy

- Keep original fixture filenames and file bytes unchanged.
- Register every fixture with SHA-256 so duplicate content can be detected.
- Treat files in this directory as real unloading plan samples. If sensitive
  information is found later, replace the file only with a structurally
  equivalent redacted fixture and update this manifest in the same change.
- Do not store generated parsed JSON, reports, labels, or task reports in this
  directory.

## Unloading Manifest

Generated on 2026-06-25 from `samples/unloading-plans`.

| Path | Bytes | SHA-256 | Source type |
| --- | ---: | --- | --- |
| samples/unloading-plans/BEAU5601716 UNLOADING PLAN.xlsx | 22749 | f78fd5aa9d792598a0aea27987baa05f816f645d5e75b22d4ed352e2a79cba93 | real unloading plan |
| samples/unloading-plans/EGSU1196743-收货派送计划.xlsx | 14623 | 8e9b0ae6450649faced32dc929a8305130325ee7aff33649a8a2d348df36fad9 | real unloading plan |
| samples/unloading-plans/ZCSU9025988B unloading plan.xlsx | 28673 | 62e3c5ab1938fb32ceb3c47b84d3746ab99217b2d8f643d77559be49ce355adc | real unloading plan |
| samples/unloading-plans/OOCU8917173 UNLOADING PLAN.xlsx | 16166 | c5bd1a536ce51ce8296d0de90e8df71da7c249b010c74090500a6fe08fe5ba6a | real unloading plan |
| samples/unloading-plans/EGSU1196743 UNLOADING PLAN.xlsx | 14579 | b17861f691d0de3fa282121a1852a2360b6fcd3aaaf0b83884fcb9eb4f7c9714 | real unloading plan |
| samples/unloading-plans/CSNU8404122 UNLOADING PLAN(1).xlsx | 12495 | a85e78da2eb25f67bebbb7a6d35e3022cfd270cb431c288e79fdb8e33c0c1a61 | real unloading plan |
| samples/unloading-plans/TEMU8049804 UNLOADING PLAN.xlsx | 29508 | 75eadcc47f9364764fc1f20ae58b554961d6e22b2b7045a342e9faca023627b2 | real unloading plan |
| samples/unloading-plans/EGSU0078026 UNLOADING PLAN.xlsx | 13328 | 2fb70e738f8513df8fd0378737f9383e02437af2958c35fe98c152a7b70a348b | real unloading plan |
| samples/unloading-plans/TEMU7148593 UNLOADING PLAN.xlsx | 14435 | 7f86669c10dc2cb071283344e0bb4033b1839d978dfdc0cf1bc976485e4a2434 | real unloading plan |
| samples/unloading-plans/CSNU7156192 UNLOADING PLAN.xlsx | 25332 | 5a07c569fd20d01171313f0a940cbc09c19d330798bcab5446ba6e6a9dc32720 | real unloading plan |
| samples/unloading-plans/GCXU5438477 UNLOADING PLAN.xlsx | 19855 | 2c96cf5b703437356e54b429cf0e3cad15848ac688a64dd81f2ed9e9cdb907e7 | real unloading plan |
| samples/unloading-plans/DRYU9800413 - Unloading Plan.xlsx | 18247 | 2219f032a56566ac1bcd855b67e1d7197beb53097927e725d71215bec4071aea | real unloading plan |
| samples/unloading-plans/TXGU8484260 UNLOADING PLAN.xlsx | 17493 | 808c3ef56e6de03c6ba6a608c1d7ac88cf11f511fc71d8216f4ee5f1ac2485f3 | real unloading plan |
| samples/unloading-plans/UETU7421343 UNLOADING PLAN.xlsx | 26755 | cea8e7af3617c9f20e5f1dca7634d4927c7f9e13aa989b0f22f043b5d0bb1ff7 | real unloading plan |
| samples/unloading-plans/MATU2777886 UNLOADING PLAN.xlsx | 20120 | 2d7c46706417549b1cc5c887986a405bdb2a833a394b2fe496f265db0f93727f | real unloading plan |
| samples/unloading-plans/TXGU5580229 UNLOADING PLAN.xlsx | 14964 | c61457ee4298bfad633fbf56c71bffa193ff5e566a2b5e0bbfaf493a98f38dfc | real unloading plan |
| samples/unloading-plans/Unloading Plan CSNU8404122.xlsx | 12572 | ae8c076836dc6ee30aab468c935d76bc186d6afd3730d3b6fc17465016030e3d | real unloading plan |
| samples/unloading-plans/SMCU1257519 UNLOADING PLAN.xlsx | 22341 | 60c01610cdd38e42639127c66d31e7d66a91f9fe1ec6b4fba23568872e2d856f | real unloading plan |
| samples/unloading-plans/TIIU5743831 UNLOADING PLAN.xlsx | 17020 | 587e2144bbc8b2d7303aa967d2daf1025c7ca9227ab84edef9701f1598a68a2c | real unloading plan |
| samples/unloading-plans/CAAU8011090 UNLOADING PLAN.xlsx | 15647 | a30b0373c0dbcd46ab55fe98016058e6479aea7c6bb12a4bc4e5766f1f89450e | real unloading plan |
| samples/unloading-plans/MATU4645066 unloading plan.xlsx | 27353 | b8de3f4336de9bf641fab22ac4c9723077862453e990588816bc4b6414fc1091 | real unloading plan |
| samples/unloading-plans/MATU2613753 UNLOADING PLAN.xlsx | 31226 | 7765cf8146e0630a324bbb7c73ba5ec4f43d076375a89760b1c825883299b7d8 | real unloading plan |
| samples/unloading-plans/137675 JXJU3246131  PO#3404  BESTAR.xlsx | 15668 | c468e29e37fcbd250f1611777c6bb3b6a3f2b9d6c73f560866c171cea7034da4 | real unloading plan |
| samples/unloading-plans/CA-卡尔加里分仓单-CAIU9927541(1).xlsx | 22192 | 770a366f126fafb5f7a2b6695c107749c977d00e0de635b61f44a432f28b081e | real unloading plan |
| samples/unloading-plans/EGSU9226633 UNLOADING PLAN.xlsx | 14828 | acdef04fc302bc3af9ba55233bf1bd09f863db28c45385e42da11594411cfa78 | real unloading plan |
| samples/unloading-plans/Unloading Plan CAIU4555930.xlsx | 26132 | 7ea223e8c08cb0ebc7959444f01f086bebd25b03f67f899aa978ef3e322ea746 | real unloading plan |
| samples/unloading-plans/Unloading Plan SMCU1012780.xlsx | 17152 | 31f6756796ea973db666c15771b427c82a1f760ad3aa347adeb8e475d1a51ef9 | real unloading plan |
| samples/unloading-plans/Unloading Plan CSNU8877228.xlsx | 21731 | 9eaf828ba815faabf34dd8808737129c28a9e78691ab545633283a64537d6308 | real unloading plan |

## Acceptance Notes

- Registered fixture count: 28.
- Duplicate SHA-256 count: 0.
- Parser implementation starts after this manifest is covered by tests.

## Wage Manifest

Generated on 2026-07-04 from `samples/wage`.

| Path | Bytes | SHA-256 | Source type |
| --- | ---: | --- | --- |
| samples/wage/workAttendanceRecordForm_June.xls | 45056 | 4c3a5c0750e04f99cd614da033d54d948b5fd1b72e0ffec4f19a3d35c9f682b3 | real attendance record |
| samples/wage/20260601-0630_wageRecords.xls | 76288 | 6f2fb31f54e7cca39e696c11e8891f0a6e36041c28b98f1d287f703f9ecf375a | real wage record template |

## Wage Acceptance Notes

- Registered wage fixture count: 2.
- Duplicate wage SHA-256 count: 0.
- Wage parser and generator implementation starts after this manifest is covered by tests.

## Unloading Wage Manifest

Generated on 2026-07-04 from `samples/unloading-wage`.

| Path | Bytes | SHA-256 | Source type |
| --- | ---: | --- | --- |
| samples/unloading-wage/unload_wage_p0.json | 2606 | ce0b03113ead110b314c44a1bd822964b56bde737eb626646e39e7bd8a01806e | reviewed unloading wage prototype fixture |

## Unloading Wage Acceptance Notes

- Registered unloading wage fixture count: 1.
- The fixture references real container numbers from the unloading plan manifest.
- Worker IDs and assignments are prototype data for rule validation, not real payroll data.
