const MANUAL_DESTINATION = 'NEED_MANUAL_DESTINATION';

export interface PalletIdentityContainer {
  id: string;
  containerNo: string;
}

export interface PalletIdentityDestination {
  id: string;
  destinationCode: string;
  destinationType: string | null;
  finalPallets: number;
}

export interface PalletIdentityDraft {
  containerId: string;
  containerDestinationId: string;
  destinationCode: string;
  destinationType: string | null;
  palletNo: number;
  displayPalletNo: string;
  palletId: string;
  qrPayload: string;
}

export function buildPalletIdentityDrafts(
  container: PalletIdentityContainer,
  destinations: PalletIdentityDestination[],
  labelDate: string,
): PalletIdentityDraft[] {
  const drafts: PalletIdentityDraft[] = [];

  destinations.forEach((destination, destinationIndex) => {
    const finalPallets = Math.max(0, Number(destination.finalPallets ?? 0));
    for (let palletNo = 1; palletNo <= finalPallets; palletNo += 1) {
      drafts.push(
        buildPalletIdentityDraft({
          container,
          destination,
          destinationIndex: destinationIndex + 1,
          labelDate,
          palletNo,
        }),
      );
    }
  });

  return drafts;
}

export function buildPalletIdentityDraft(input: {
  container: PalletIdentityContainer;
  destination: PalletIdentityDestination;
  destinationIndex: number;
  labelDate: string;
  palletNo: number;
}): PalletIdentityDraft {
  const destinationCode =
    input.destination.destinationCode || MANUAL_DESTINATION;
  const displayPalletNo = String(input.palletNo);
  const palletId = [
    slug(input.container.containerNo),
    `D${String(input.destinationIndex).padStart(3, '0')}`,
    slug(destinationCode),
    `P${String(input.palletNo).padStart(3, '0')}`,
    slug(input.container.id).slice(-16),
  ].join('-');

  return {
    containerId: input.container.id,
    containerDestinationId: input.destination.id,
    destinationCode,
    destinationType: input.destination.destinationType,
    palletNo: input.palletNo,
    displayPalletNo,
    palletId,
    qrPayload: [
      'SSP1',
      'PALLET',
      input.labelDate,
      payloadSegment(input.container.containerNo),
      payloadSegment(destinationCode),
      displayPalletNo,
      palletId,
    ].join('|'),
  };
}

function payloadSegment(value: string): string {
  return value.replace(/\|/g, '/').trim() || 'UNKNOWN';
}

function slug(value: string): string {
  return (
    value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'UNKNOWN'
  );
}
