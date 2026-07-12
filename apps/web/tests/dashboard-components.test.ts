import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DashboardPanel,
  DockLaneStrip,
  ExceptionList,
  LifecycleDockStrip,
  MetricTile,
  PressureBar,
  ProgressBar,
  StatusPill,
} from "../src/components/dashboard";

test("dashboard panel and metric tile render stable shell classes and links", () => {
  const Panel = DashboardPanel as (props: {
    children?: ReactNode;
    eyebrow?: string;
    title: string;
  }) => ReactElement;
  const html = renderToStaticMarkup(
    createElement(
      Panel,
      { eyebrow: "Operations", title: "Work Queue" },
      createElement(MetricTile, {
        detail: "Needs review",
        href: "/imports",
        label: "Imports",
        tone: "warning",
        value: 3,
      }),
    ),
  );

  assert.match(html, /dashboard-panel/);
  assert.match(html, /metric-tile/);
  assert.match(html, /href="\/imports"/);
  assert.match(html, /data-tone="warning"/);
  assert.match(html, />Work Queue</);
});

test("status pill and progress bar expose accessible status text", () => {
  const html = renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement(StatusPill, { label: "OK", tone: "success" }),
      createElement(StatusPill, { label: "Info", tone: "info" }),
      createElement(ProgressBar, {
        label: "Loaded",
        max: 10,
        tone: "success",
        value: 7,
      }),
    ),
  );

  assert.match(html, /status-pill/);
  assert.match(html, /data-tone="success"/);
  assert.match(html, /--info-surface/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="7"/);
  assert.match(html, /aria-valuemax="10"/);
});

test("dock lane strip, pressure bar, and exception list render labels and counts", () => {
  const html = renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement(DockLaneStrip, {
        ariaLabel: "Dock lane strip",
        lanes: [
          {
            code: "D1",
            dockNo: "D1",
            href: "/load-jobs",
            loadedPallets: 4,
            remainingPallets: 2,
            statusLabel: "In progress",
            tone: "warning",
            totalPallets: 6,
            truckNo: "TRK-1",
          },
        ],
      }),
      createElement(PressureBar, {
        segments: [
          { label: "Loaded", tone: "success", value: 4 },
          { label: "Remaining", tone: "warning", value: 2 },
        ],
      }),
      createElement(ExceptionList, {
        items: [{ count: 2, href: "/imports", label: "Parser errors" }],
      }),
    ),
  );

  assert.match(html, /aria-label="Dock lane strip"/);
  assert.match(html, /TRK-1/);
  assert.match(html, /Parser errors/);
  assert.match(html, /href="\/imports"/);
});

test("lifecycle dock strip renders status lanes with counts and links", () => {
  const html = renderToStaticMarkup(
    createElement(LifecycleDockStrip, {
      ariaLabel: "Dock lane strip",
      lanes: [
        {
          code: "UNLOADED",
          count: 2,
          href: "/unloading-summary",
          label: "Unloaded",
          tone: "success",
        },
        {
          code: "LOADED",
          count: 1,
          href: "/reports/inventory?status=LOADED",
          label: "Delivered to destination",
          tone: "warning",
        },
      ],
      total: 3,
    }),
  );

  assert.match(html, /lifecycle-dock-strip/);
  assert.match(html, /href="\/unloading-summary"/);
  assert.match(html, /Delivered to destination/);
  assert.match(html, />1\/3</);
});

test("dashboard shared components render Chinese defaults without document rewriting", () => {
  const html = renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement(DockLaneStrip, {
        lanes: [
          {
            code: "D1",
            dockNo: "D1",
            loadedPallets: 2,
            remainingPallets: 1,
            statusLabel: "进行中",
            totalPallets: 3,
            truckNo: "TRK-1",
          },
        ],
        locale: "zh-CN",
      }),
      createElement(LifecycleDockStrip, {
        lanes: [
          {
            code: "UNLOADED",
            count: 1,
            href: "/unloading-summary",
            label: "已拆完",
          },
        ],
        locale: "zh-CN",
        total: 1,
      }),
      createElement(ExceptionList, { items: [], locale: "zh-CN" }),
    ),
  );

  assert.match(html, /aria-label="月台作业条"/);
  assert.match(html, />月台</);
  assert.match(html, />车辆</);
  assert.match(html, />剩余</);
  assert.match(html, />已装车</);
  assert.match(html, />无问题</);
});
