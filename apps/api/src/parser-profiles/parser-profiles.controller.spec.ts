import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/permissions';
import { ParserProfilesController } from './parser-profiles.controller';

describe('ParserProfilesController permissions', () => {
  it('enforces read, train, and approve at the API route', () => {
    for (const name of ['list', 'family', 'version'] as const) {
      expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, route(name))).toEqual([
        PERMISSIONS.parserProfiles.read,
      ]);
    }
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, route('fork'))).toEqual([
      PERMISSIONS.parserProfiles.train,
    ]);
    for (const name of ['approve', 'pause', 'resume', 'retire'] as const) {
      expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, route(name))).toEqual([
        PERMISSIONS.parserProfiles.approve,
      ]);
    }
  });
});

function route(name: keyof ParserProfilesController): object {
  const handler = Object.getOwnPropertyDescriptor(
    ParserProfilesController.prototype,
    name,
  )?.value;
  if (typeof handler !== 'function') throw new Error(`Missing route ${String(name)}`);
  return handler;
}
