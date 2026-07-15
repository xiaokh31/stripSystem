import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/permissions';
import { ContainersController } from './containers.controller';

describe('ContainersController permissions', () => {
  it('protects the dedicated index with containers.read', () => {
    const listContainers = Object.getOwnPropertyDescriptor(
      ContainersController.prototype,
      'listContainers',
    )?.value as object;

    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, listContainers),
    ).toEqual([PERMISSIONS.containers.read]);
  });
});
