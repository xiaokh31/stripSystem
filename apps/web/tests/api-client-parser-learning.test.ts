import assert from "node:assert/strict";
import test from "node:test";
import {
  getParserLearningReplayArtifact,
  getParserLearningReplayJob,
  inspectParserLearningCase,
  previewParserLearningDraft,
  queueParserLearningReplay,
  saveParserLearningDraft,
  startParserLearningCase,
  submitParserLearningCandidate,
} from "../src/lib/api-client";

test("parser learning API client uses the protected inspect, draft, preview, replay, and submit contracts", async () => {
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push({
      body: init?.body ? JSON.parse(String(init.body)) : null,
      method: init?.method ?? "GET",
      url,
    });
    const response = url.endsWith("/inspect")
      ? {
          candidateMappings: [],
          caseId: "case-1",
          contractVersion: "workbook-inspection-v1",
          draftRevision: 0,
          inspection: {
            inputSha256: "a".repeat(64),
            issues: [],
            limits: {},
            sheets: [],
            workbookType: "OOXML_XLSX",
          },
          issues: [],
          source: {
            fileSha256: "a".repeat(64),
            importFileId: "import-1",
            originalFilename: "failed.xlsx",
          },
          workerVersion: "parser-profile-engine-v1",
        }
      : url.includes("/replay-jobs/")
        ? { id: "job-1", status: "succeeded" }
        : url.includes("/replays/")
          ? {
              artifactId: "artifact-1",
              blockingCodes: [],
              caseId: "case-1",
              contractVersion: "parser-profile-replay-v1",
              diff: {
                items: [],
                summary: {
                  blockers: 0,
                  compared: 0,
                  equal: 0,
                  materialDifferences: 0,
                },
              },
              draftRevision: 1,
              passed: true,
            }
          : url.endsWith("/preview")
            ? {
                caseId: "case-1",
                destinationSummaries: [],
                draftRevision: 1,
                errors: [],
                provenance: {},
                sampleRows: [],
                totalRows: 0,
                warnings: [],
              }
            : { draftRevision: 1, id: "case-1", status: "MAPPING" };
    return new Response(JSON.stringify(response), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };
  const options = { baseUrl: "http://api.local/api", fetcher };

  await startParserLearningCase("import 1", options);
  const inspection = await inspectParserLearningCase("case 1", options);
  await saveParserLearningDraft(
    "case 1",
    {
      expectedRevision: 0,
      fingerprintDefinition: { algorithmVersion: "workbook-fingerprint-v1" },
      mappingDefinition: { schemaVersion: "parser-profile-mapping-v1" },
    },
    options,
  );
  await previewParserLearningDraft("case 1", 1, options);
  await queueParserLearningReplay(
    "case 1",
    { idempotencyKey: "replay-web-0001", revision: 1 },
    options,
  );
  await getParserLearningReplayJob("case 1", "job 1", options);
  const artifact = await getParserLearningReplayArtifact(
    "case 1",
    "artifact 1",
    options,
  );
  await submitParserLearningCandidate(
    "case 1",
    {
      customerLabel: "Customer A",
      replayArtifactId: "artifact-1",
      revision: 1,
      stableName: "customer-a",
    },
    options,
  );

  assert.equal(JSON.stringify(inspection).includes("storagePath"), false);
  assert.equal(JSON.stringify(artifact).includes("storagePath"), false);
  assert.deepEqual(
    requests.map(({ method, url }) => ({ method, url })),
    [
      { method: "POST", url: "http://api.local/api/parser-learning-cases" },
      { method: "POST", url: "http://api.local/api/parser-learning-cases/case%201/inspect" },
      { method: "PUT", url: "http://api.local/api/parser-learning-cases/case%201/draft" },
      { method: "POST", url: "http://api.local/api/parser-learning-cases/case%201/preview" },
      { method: "POST", url: "http://api.local/api/parser-learning-cases/case%201/replay" },
      { method: "GET", url: "http://api.local/api/parser-learning-cases/case%201/replay-jobs/job%201" },
      { method: "GET", url: "http://api.local/api/parser-learning-cases/case%201/replays/artifact%201/download" },
      { method: "POST", url: "http://api.local/api/parser-learning-cases/case%201/submit" },
    ],
  );
  assert.deepEqual(requests[0]?.body, { importFileId: "import 1" });
  assert.deepEqual(requests[3]?.body, { revision: 1 });
});
