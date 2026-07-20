import {
  PARSER_LEARNING_CASE_STATES,
  parseListParserLearningCasesQuery,
  parseQueueParserProfileReplayDto,
  parseSaveParserProfileDraftDto,
  parseSubmitParserProfileCandidateDto,
} from './parser-profile-learning.dto';

describe('parser profile learning DTO contracts', () => {
  it('accepts every documented state and applies bounded pagination', () => {
    for (const status of PARSER_LEARNING_CASE_STATES) {
      expect(parseListParserLearningCasesQuery({ status })).toEqual({
        status,
        limit: 50,
        offset: 0,
      });
    }
    expect(
      parseListParserLearningCasesQuery({ limit: '100', offset: '5' }),
    ).toEqual({
      limit: 100,
      offset: 5,
    });
  });

  it('rejects unknown fields and weak replay idempotency keys with one stable code', () => {
    for (const input of [
      () => parseSaveParserProfileDraftDto({ unexpected: true }),
      () =>
        parseQueueParserProfileReplayDto({
          revision: 1,
          idempotencyKey: 'short',
        }),
      () =>
        parseSubmitParserProfileCandidateDto({
          revision: 1,
          replayArtifactId: 'artifact-1',
          stableName: 'has spaces',
        }),
    ]) {
      expect(input).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: 'PARSER_PROFILE_REQUEST_VALIDATION_FAILED',
          }),
        }),
      );
    }
  });
});
