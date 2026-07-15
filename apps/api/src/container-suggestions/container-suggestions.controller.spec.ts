import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/permissions';
import {
  ContainerSuggestionsController,
  InventoryContainerSuggestionsController,
} from './container-suggestions.controller';

describe('Container suggestion controller permissions', () => {
  it('keeps the containers and inventory permission contracts independent', () => {
    const containersList = Object.getOwnPropertyDescriptor(
      ContainerSuggestionsController.prototype,
      'list',
    )?.value as object;
    const inventoryList = Object.getOwnPropertyDescriptor(
      InventoryContainerSuggestionsController.prototype,
      'list',
    )?.value as object;

    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        containersList,
      ),
    ).toEqual([PERMISSIONS.containers.read]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        inventoryList,
      ),
    ).toEqual([PERMISSIONS.inventory.read]);
  });
});
