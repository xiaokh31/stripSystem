import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/permissions';
import { ParserProfileReviewsController } from './parser-profile-reviews.controller';

describe('ParserProfileReviewsController permissions', () => {
  it('requires both read permissions for the staged panel', () => {
    expect(metadata('get')).toEqual([
      PERMISSIONS.imports.read,
      PERMISSIONS.parserProfiles.read,
    ]);
  });

  it('requires review and existing correction authority for every decision', () => {
    for (const action of ['accept', 'correct', 'reject'] as const) {
      expect(metadata(action)).toEqual([
        PERMISSIONS.parserProfiles.review,
        PERMISSIONS.containers.update,
        PERMISSIONS.corrections.create,
      ]);
    }
  });
});

function metadata(name: keyof ParserProfileReviewsController): string[] {
  const handler = Object.getOwnPropertyDescriptor(
    ParserProfileReviewsController.prototype,
    name,
  )?.value;
  if (typeof handler !== 'function') throw new Error(`Missing route ${name}`);
  return Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler);
}
