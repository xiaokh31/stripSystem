export class ContainerSuggestionItemDto {
  containerId!: string;
  containerNo!: string;
}

export class ContainerSuggestionListResponseDto {
  items!: ContainerSuggestionItemDto[];
}
