import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkerAttendanceService } from './worker-attendance.service';

describe('WorkerAttendanceService stable failures', () => {
  let service: WorkerAttendanceService;

  beforeEach(() => {
    service = new WorkerAttendanceService({
      getOrThrow: (key: string) =>
        key === 'app.workerPythonDir'
          ? '/private/worker-path'
          : '/private/template-path.xls',
    } as ConfigService);
  });

  it.each([
    ['', 'WORKER_ATTENDANCE_EMPTY_OUTPUT'],
    ['not-json', 'WORKER_ATTENDANCE_INVALID_OUTPUT'],
  ])('returns only a stable code for unsafe stdout %#', (stdout, code) => {
    const invoke = () =>
      privateService(service).parseWorkerStdout(stdout);

    expect(invoke).toThrow(InternalServerErrorException);
    try {
      invoke();
    } catch (error) {
      const response = (error as InternalServerErrorException).getResponse();
      expect(response).toEqual({
        code,
        message: code,
        details: { stage: 'WORKER_STDOUT' },
      });
      expect(JSON.stringify(response)).not.toContain('/private/');
      expect(JSON.stringify(response)).not.toContain('not-json');
    }
  });

  it('distinguishes a timeout from a generic worker crash', () => {
    expect(
      privateService(service).workerInvocationCode({
        killed: true,
        code: 'SIGTERM',
      }),
    ).toBe('WORKER_ATTENDANCE_TIMEOUT');
    expect(
      privateService(service).workerInvocationCode({ code: 'ENOENT' }),
    ).toBe('WORKER_ATTENDANCE_INVOCATION_FAILED');
  });
});

function privateService(service: WorkerAttendanceService): {
  parseWorkerStdout(stdout: string): unknown;
  workerInvocationCode(error: unknown): string;
} {
  return service as unknown as {
    parseWorkerStdout(stdout: string): unknown;
    workerInvocationCode(error: unknown): string;
  };
}
