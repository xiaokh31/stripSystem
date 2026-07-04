import {
  CompletePayContainerPanel,
  ContainerPayClassificationForm,
  CreatePayContainerPanel,
} from "./unloading-wage-actions";
import { statusStyle } from "./wage-display";

export function ContainerWageControls({
  containerId,
  containerNo,
  payClassification,
  payContainers,
  payTrailerNumber,
}: {
  containerId: string;
  containerNo: string;
  payClassification: string | null;
  payContainers: Array<{
    id: string;
    payContainerId: string;
    payContainerNo: string;
    status: string;
  }>;
  payTrailerNumber: string | null;
}) {
  const defaultClassification =
    payClassification === "US_TO_CANADA_TRANSFER"
      ? "US_TO_CANADA_TRANSFER"
      : "OCEAN_CONTAINER";
  const firstPayContainer = payContainers[0] ?? null;

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="grid gap-4">
        <ContainerPayClassificationForm
          containerId={containerId}
          currentClassification={payClassification}
          currentTrailerNumber={payTrailerNumber}
        />
        <section className="border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-950">
            Pay container links
          </h2>
          {payContainers.length === 0 ? (
            <p className="mt-3 border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
              No pay container has been created for {containerNo}.
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              {payContainers.map((payContainer) => (
                <div
                  className="border border-zinc-200 bg-zinc-50 p-3"
                  key={payContainer.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="break-all text-sm font-semibold text-zinc-950">
                        {payContainer.payContainerNo}
                      </p>
                      <p className="mt-1 break-all text-xs text-zinc-500">
                        {payContainer.payContainerId}
                      </p>
                    </div>
                    <StatusBadge status={payContainer.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <div className="grid gap-4">
        <CreatePayContainerPanel
          defaultClassification={defaultClassification}
          defaultContainerIdsText={containerId}
          defaultTrailerNumber={payTrailerNumber ?? ""}
          title="Create pay container for this container"
        />
        <CompletePayContainerPanel
          defaultPayContainerId={firstPayContainer?.payContainerId ?? ""}
          title="Complete unloading for pay container"
        />
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style = statusStyle(status);
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded border px-2.5 text-xs font-semibold uppercase ${style.styles}`}
    >
      {style.label}
    </span>
  );
}
