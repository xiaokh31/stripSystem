"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ApiClientError,
  updateContainerDestination,
  type ContainerDetailDestinationResponse,
} from "@/lib/api-client";
import {
  buildDestinationCorrectionRequest,
  draftFromDestination,
  formatNullable,
  issueList,
  type DestinationCorrectionDraft,
} from "./container-detail-flow";

interface DestinationSaveState {
  message: string;
  status: "error" | "idle" | "saved" | "saving";
}

export function ContainerDestinationCorrections({
  destinations,
}: {
  destinations: ContainerDetailDestinationResponse[];
}) {
  const router = useRouter();
  const initialDrafts = useMemo(() => {
    return Object.fromEntries(
      destinations.map((destination) => [
        destination.id,
        draftFromDestination(destination),
      ]),
    );
  }, [destinations]);
  const [drafts, setDrafts] =
    useState<Record<string, DestinationCorrectionDraft>>(initialDrafts);
  const [saveStates, setSaveStates] = useState<
    Record<string, DestinationSaveState>
  >({});

  function updateDraft(
    destinationId: string,
    field: keyof DestinationCorrectionDraft,
    value: string,
  ) {
    setDrafts((current) => ({
      ...current,
      [destinationId]: {
        ...(current[destinationId] ?? {
          correctionNote: "",
          destinationCode: "",
          destinationType: "",
          manualPallets: "",
        }),
        [field]: value,
      },
    }));
  }

  function setSaveState(destinationId: string, state: DestinationSaveState) {
    setSaveStates((current) => ({ ...current, [destinationId]: state }));
  }

  async function saveDestination(
    destination: ContainerDetailDestinationResponse,
  ) {
    const draft = drafts[destination.id] ?? draftFromDestination(destination);
    const request = buildDestinationCorrectionRequest(destination, draft);

    if (!request.ok) {
      setSaveState(destination.id, {
        message: request.error,
        status: "error",
      });
      return;
    }

    setSaveState(destination.id, {
      message: "Saving correction.",
      status: "saving",
    });

    try {
      const result = await updateContainerDestination(
        destination.id,
        request.payload,
      );
      setSaveState(destination.id, {
        message: `Saved ${result.corrections.length} correction record(s).`,
        status: "saved",
      });
      router.refresh();
    } catch (error) {
      setSaveState(destination.id, {
        message: correctionErrorMessage(error),
        status: "error",
      });
    }
  }

  if (destinations.length === 0) {
    return (
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">Destinations</h2>
        <p className="mt-3 text-sm text-zinc-600">
          This container has no parsed destinations.
        </p>
      </section>
    );
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            Destinations
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Save writes destination corrections through the API and reloads the
            persisted container data.
          </p>
        </div>
        <span className="text-sm font-semibold text-zinc-600">
          {destinations.length} destination(s)
        </span>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-[1120px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <th className="px-3 py-3 font-semibold">Destination</th>
              <th className="px-3 py-3 font-semibold">Type</th>
              <th className="px-3 py-3 text-right font-semibold">Cartons</th>
              <th className="px-3 py-3 text-right font-semibold">CBM</th>
              <th className="px-3 py-3 text-right font-semibold">Calc.</th>
              <th className="px-3 py-3 text-right font-semibold">Manual</th>
              <th className="px-3 py-3 text-right font-semibold">Final</th>
              <th className="px-3 py-3 font-semibold">Warnings</th>
              <th className="px-3 py-3 font-semibold">Correction note</th>
              <th className="px-3 py-3 font-semibold">Save</th>
            </tr>
          </thead>
          <tbody>
            {destinations.map((destination) => {
              const draft =
                drafts[destination.id] ?? draftFromDestination(destination);
              const saveState = saveStates[destination.id] ?? {
                message: "",
                status: "idle",
              };
              const warnings = [
                ...issueList(destination.warnings),
                ...issueList(destination.errors),
              ];

              return (
                <tr className="border-b border-zinc-100" key={destination.id}>
                  <td className="px-3 py-4 align-top">
                    <input
                      aria-label={`Destination code for ${destination.destinationCode}`}
                      className="min-h-10 w-36 border border-zinc-300 bg-white px-2 text-sm font-semibold text-zinc-950 focus:border-teal-700 focus:outline-none"
                      onChange={(event) =>
                        updateDraft(
                          destination.id,
                          "destinationCode",
                          event.target.value,
                        )
                      }
                      value={draft.destinationCode}
                    />
                  </td>
                  <td className="px-3 py-4 align-top">
                    <input
                      aria-label={`Destination type for ${destination.destinationCode}`}
                      className="min-h-10 w-40 border border-zinc-300 bg-white px-2 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none"
                      onChange={(event) =>
                        updateDraft(
                          destination.id,
                          "destinationType",
                          event.target.value,
                        )
                      }
                      placeholder="No type"
                      value={draft.destinationType}
                    />
                  </td>
                  <td className="px-3 py-4 text-right align-top font-medium">
                    {destination.totalCartons}
                  </td>
                  <td className="px-3 py-4 text-right align-top font-medium">
                    {destination.totalVolumeCbm}
                  </td>
                  <td className="px-3 py-4 text-right align-top font-medium">
                    {destination.calculatedPallets}
                  </td>
                  <td className="px-3 py-4 align-top">
                    <input
                      aria-label={`Manual pallets for ${destination.destinationCode}`}
                      className="min-h-10 w-24 border border-zinc-300 bg-white px-2 text-right text-sm font-semibold text-zinc-950 focus:border-teal-700 focus:outline-none"
                      inputMode="numeric"
                      min={0}
                      onChange={(event) =>
                        updateDraft(
                          destination.id,
                          "manualPallets",
                          event.target.value,
                        )
                      }
                      placeholder="Auto"
                      type="number"
                      value={draft.manualPallets}
                    />
                  </td>
                  <td className="px-3 py-4 text-right align-top font-semibold">
                    {destination.finalPallets}
                  </td>
                  <td className="max-w-64 px-3 py-4 align-top text-xs text-zinc-600">
                    {warnings.length > 0 ? (
                      <ul className="space-y-1">
                        {warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ) : (
                      <span>{formatNullable(null)}</span>
                    )}
                  </td>
                  <td className="px-3 py-4 align-top">
                    <textarea
                      aria-label={`Correction note for ${destination.destinationCode}`}
                      className="min-h-20 w-56 resize-y border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none"
                      onChange={(event) =>
                        updateDraft(
                          destination.id,
                          "correctionNote",
                          event.target.value,
                        )
                      }
                      placeholder="Audit note"
                      value={draft.correctionNote}
                    />
                  </td>
                  <td className="px-3 py-4 align-top">
                    <button
                      className="min-h-10 w-32 border border-teal-700 bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
                      disabled={saveState.status === "saving"}
                      onClick={() => void saveDestination(destination)}
                      type="button"
                    >
                      {saveState.status === "saving"
                        ? "Saving"
                        : "Save correction"}
                    </button>
                    {saveState.message ? (
                      <p
                        className={`mt-2 w-32 text-xs ${
                          saveState.status === "error"
                            ? "text-red-700"
                            : "text-emerald-700"
                        }`}
                        role={saveState.status === "error" ? "alert" : "status"}
                      >
                        {saveState.message}
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function correctionErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }

  return error instanceof Error ? error.message : "Correction failed.";
}
