import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { AttendanceRowResponse } from "../src/lib/api-client";
import {
  attendanceCalculationMethodLabel,
  attendanceParserVersionLabel,
  buildEmployeeAttendanceGroups,
  employeeAttendanceIdentityKey,
  summarizeEmployeeAttendance,
} from "../src/components/wage/employee-attendance-review";

test("groups employees by stable identity without merging duplicate names across ids", () => {
  const rows = [
    attendanceRow({ employeeId: "E-002", employeeName: "Alex", workDate: "2026-06-02" }),
    attendanceRow({ employeeId: "E-001", employeeName: "Alex", workDate: "2026-06-03" }),
    attendanceRow({ employeeId: "E-001", employeeName: "Alex", workDate: "2026-06-01" }),
    attendanceRow({
      department: " Warehouse ",
      employeeId: null,
      employeeName: "  Sam Lee ",
      workDate: "2026-06-02",
    }),
    attendanceRow({
      department: "warehouse",
      employeeId: null,
      employeeName: "sam   lee",
      workDate: "2026-06-01",
    }),
    attendanceRow({ department: "Office", employeeId: "E-003", employeeName: null }),
  ];

  const groups = buildEmployeeAttendanceGroups(rows);

  assert.equal(groups.length, 4);
  assert.deepEqual(
    groups.map((group) => group.identityKey),
    ["id:e-001", "id:e-002", "name:sam lee|department:warehouse", "id:e-003"],
  );
  assert.deepEqual(
    groups[0].rows.map((row) => row.workDate),
    ["2026-06-01", "2026-06-03"],
  );
  assert.equal(groups[2].rows.length, 2);
  assert.equal(groups[3].employeeName, null);
});

test("missing employee id falls back to normalized name and department", () => {
  assert.equal(
    employeeAttendanceIdentityKey({
      department: "  Dock  Team ",
      employeeId: null,
      employeeName: " Renée  Chen ",
    }),
    "name:renée chen|department:dock team",
  );
  assert.equal(
    employeeAttendanceIdentityKey({
      department: "Night",
      employeeId: null,
      employeeName: null,
    }),
    "name:unknown|department:night",
  );
});

test("keeps a complete 31-day employee month in stable work-date order", () => {
  const rows = Array.from({ length: 31 }, (_, index) =>
    attendanceRow({
      employeeId: "E-031",
      employeeName: "Month Employee",
      workDate: `2026-07-${String(31 - index).padStart(2, "0")}`,
    }),
  );

  const [group] = buildEmployeeAttendanceGroups(rows);

  assert.equal(group.rows.length, 31);
  assert.equal(group.rows[0].workDate, "2026-07-01");
  assert.equal(group.rows[30].workDate, "2026-07-31");
  assert.equal(group.summary.rowCount, 31);
});

test("summarizes stored calculated hours and issue days without recomputing punches", () => {
  const rows = [
    attendanceRow({ calculatedHours: "7.67", warnings: [{ code: "ODD_PUNCH_COUNT" }] }),
    attendanceRow({ calculatedHours: "8.50", errors: [{ code: "TEST_ERROR" }] }),
    attendanceRow({ calculatedHours: "0.00", warnings: [{ code: "MISSING_PUNCH_TIMES" }] }),
    attendanceRow({ calculatedHours: null, punchTimes: ["08:00", "17:00"] }),
  ];

  assert.deepEqual(summarizeEmployeeAttendance(rows), {
    reviewDays: 3,
    rowCount: 4,
    totalCalculatedHours: 16.17,
    workedDays: 2,
  });
});

test("maps calculation methods and parser versions through both locale catalogs", () => {
  assert.equal(attendanceCalculationMethodLabel("NO_PUNCHES", "en"), "No punches");
  assert.equal(
    attendanceCalculationMethodLabel("FIRST_LAST_FALLBACK", "zh-CN"),
    "首末打卡回退计算",
  );
  assert.equal(
    attendanceCalculationMethodLabel("PAIRED_INTERVALS", "en"),
    "Paired punch intervals",
  );
  assert.equal(
    attendanceCalculationMethodLabel("UNRECOGNIZED", "zh-CN"),
    "未知计算方式",
  );
  assert.equal(
    attendanceParserVersionLabel("wage-attendance-v2", "zh-CN"),
    "考勤计算规则第二版",
  );
  assert.equal(attendanceParserVersionLabel("legacy-v1", "en"), "Legacy attendance calculation");
});

test("work hours source exposes every selected employee row and localizes visible metadata", () => {
  const webRoot = fs.existsSync(path.join(process.cwd(), "src"))
    ? process.cwd()
    : path.join(process.cwd(), "apps", "web");
  const source = fs.readFileSync(
    path.join(webRoot, "src/app/work-hours/page.tsx"),
    "utf8",
  );

  assert.doesNotMatch(source, /rows\.slice\(0,\s*100\)/);
  assert.doesNotMatch(source, /i18n\.workHours\.firstRows/);
  assert.match(source, /buildEmployeeAttendanceGroups\(rows\)/);
  assert.match(source, /selectedEmployee\.rows\.map/);
  assert.match(source, /attendanceCalculationMethodLabel\(method, locale\)/);
  assert.match(source, /attendanceImportId=.*employeeKey=/);
  assert.match(source, /aria-current=\{isSelected \? "page" : undefined\}/);
  assert.match(source, /aria-live="polite"/);
});

function attendanceRow(
  overrides: Partial<AttendanceRowResponse> = {},
): AttendanceRowResponse {
  const sequence = rowSequence++;
  return {
    calculatedHours: "8.00",
    calculationMethod: "PAIRED_INTERVALS",
    dayNumber: 1,
    department: "Operations",
    employeeId: "E-001",
    employeeName: "Employee",
    errors: [],
    firstPunch: "08:00",
    id: `row-${sequence}`,
    lastPunch: "16:30",
    lunchHours: "0.50",
    pairedGrossHours: "8.50",
    punchTimes: ["08:00", "16:30"],
    rawJson: {},
    rowKey: `row-key-${sequence}`,
    warnings: [],
    workDate: "2026-06-01",
    workIntervals: [{ end: "16:30", minutes: 510, start: "08:00" }],
    ...overrides,
  };
}

let rowSequence = 1;
