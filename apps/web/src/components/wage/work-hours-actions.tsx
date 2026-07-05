"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ApiClientError,
  type AttendanceImportResponse,
  generateAttendanceWageRecord,
  parseAttendanceImport,
  uploadAttendanceImportFile,
} from "@/lib/api-client";
import {
  attendanceUploadError,
  canGenerateWageRecord,
  wageGenerationBlockReason,
} from "./attendance-flow";

interface ActionState {
  message: string;
  status: "error" | "idle" | "running" | "success";
}

const idleState: ActionState = { message: "", status: "idle" };

export function AttendanceUploadPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<ActionState>(idleState);

  async function upload() {
    const validationError = attendanceUploadError(file);
    if (validationError || !file) {
      setState({
        message: validationError ?? "Select one legacy .xls attendance workbook.",
        status: "error",
      });
      return;
    }

    setState({ message: "Uploading attendance workbook.", status: "running" });
    try {
      const result = await uploadAttendanceImportFile(file);
      setState({
        message: `Uploaded ${result.originalFilename}.`,
        status: "success",
      });
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      setFile(null);
      router.push(`/work-hours?attendanceImportId=${encodeURIComponent(result.id)}`);
      router.refresh();
    } catch (error) {
      setState({ message: apiErrorMessage(error), status: "error" });
    }
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            Upload attendance workbook
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Use the monthly time-clock .xls export. The API stores the original
            file and rejects duplicate SHA-256 content.
          </p>
        </div>
        <div className="grid gap-3">
          <input
            accept=".xls,application/vnd.ms-excel"
            className="block w-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 file:mr-3 file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-zinc-200"
            disabled={state.status === "running"}
            onChange={(event) => {
              const selectedFile = event.target.files?.[0] ?? null;
              setFile(selectedFile);
              const validationError = attendanceUploadError(selectedFile);
              setState(
                validationError
                  ? { message: validationError, status: "error" }
                  : idleState,
              );
            }}
            ref={inputRef}
            type="file"
          />
          <div className="flex flex-wrap gap-2">
            <button
              className="min-h-10 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
              disabled={state.status === "running"}
              onClick={() => void upload()}
              type="button"
            >
              {state.status === "running" ? "Uploading" : "Upload .xls"}
            </button>
            <button
              className="min-h-10 border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
              disabled={state.status === "running" || !file}
              onClick={() => {
                setFile(null);
                setState(idleState);
                if (inputRef.current) {
                  inputRef.current.value = "";
                }
              }}
              type="button"
            >
              Clear
            </button>
          </div>
          <ActionMessage state={state} />
        </div>
      </div>
    </section>
  );
}

export function AttendanceImportActions({
  attendanceImport,
}: {
  attendanceImport: AttendanceImportResponse;
}) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>(idleState);
  const canGenerate = canGenerateWageRecord(attendanceImport);
  const generateBlockReason = wageGenerationBlockReason(attendanceImport);

  async function runParse() {
    setState({ message: "Parsing attendance workbook.", status: "running" });
    try {
      const result = await parseAttendanceImport(attendanceImport.id);
      setState({
        message: `Parsed ${result.rows.length} employee-day row(s).`,
        status: "success",
      });
      router.refresh();
    } catch (error) {
      setState({ message: apiErrorMessage(error), status: "error" });
    }
  }

  async function generate() {
    if (!canGenerate) {
      setState({
        message:
          generateBlockReason ??
          "This attendance import cannot generate a wage record yet.",
        status: "error",
      });
      return;
    }

    setState({ message: "Generating wage record workbook.", status: "running" });
    try {
      await generateAttendanceWageRecord(attendanceImport.id);
      setState({
        message: "Wage record generated. File history refreshed.",
        status: "success",
      });
      router.refresh();
    } catch (error) {
      setState({ message: apiErrorMessage(error), status: "error" });
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          className="min-h-10 border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-900 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400"
          disabled={state.status === "running"}
          onClick={() => void runParse()}
          type="button"
        >
          Parse
        </button>
        <button
          className="min-h-10 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
          disabled={state.status === "running" || !canGenerate}
          onClick={() => void generate()}
          type="button"
          title={generateBlockReason ?? "Generate wage record workbook"}
        >
          Generate wage record
        </button>
      </div>
      {generateBlockReason ? (
        <p className="text-xs font-medium text-amber-800">
          {generateBlockReason}
        </p>
      ) : null}
      <ActionMessage state={state} />
    </div>
  );
}

function ActionMessage({ state }: { state: ActionState }) {
  if (!state.message) {
    return null;
  }

  const styles =
    state.status === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : state.status === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-zinc-200 bg-zinc-50 text-zinc-700";

  return (
    <p className={`border px-3 py-2 text-sm ${styles}`} role="status">
      {state.message}
    </p>
  );
}

function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}${error.status ? ` (${error.status})` : ""}: ${
      error.message
    }`;
  }

  return error instanceof Error ? error.message : "The request failed.";
}
