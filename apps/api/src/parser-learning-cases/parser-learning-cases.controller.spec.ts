import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/permissions';
import { ParserLearningCasesController } from './parser-learning-cases.controller';

describe('ParserLearningCasesController permissions', () => {
  it('uses read for lookup and train for every state-changing route', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, routeHandler('get')),
    ).toEqual([PERMISSIONS.parserProfiles.read]);

    for (const route of [
      routeHandler('start'),
      routeHandler('linkContainer'),
      routeHandler('unlinkContainer'),
      routeHandler('close'),
    ]) {
      expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, route)).toEqual([
        PERMISSIONS.parserProfiles.train,
      ]);
    }
  });
});

function routeHandler(name: keyof ParserLearningCasesController): object {
  const handler = Object.getOwnPropertyDescriptor(
    ParserLearningCasesController.prototype,
    name,
  )?.value;
  if (typeof handler !== 'function') {
    throw new Error(`Controller route handler is missing: ${String(name)}`);
  }
  return handler;
}
