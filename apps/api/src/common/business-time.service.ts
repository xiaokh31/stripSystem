import { BadRequestException, Injectable } from '@nestjs/common';
import {
  operationalMonth,
  operationalMonthRangeUtc,
  operationalTimeZone,
} from './operational-time';

export const COMPLETION_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

@Injectable()
export class ServerClock {
  now(): Date {
    return new Date();
  }
}

@Injectable()
export class BusinessTimeService {
  constructor(private readonly clock: ServerClock) {}

  now(): Date {
    return this.clock.now();
  }

  nowIso(): string {
    return this.now().toISOString();
  }

  operationalMonth(now = this.now()): string {
    return operationalMonth(now);
  }

  monthRange(month: string): { gte: Date; lt: Date } {
    return operationalMonthRangeUtc(month);
  }

  completionCutoff(now = this.now()): Date {
    return new Date(now.getTime() + COMPLETION_FUTURE_TOLERANCE_MS);
  }

  validCompletionRangeForMonth(
    month: string,
    now = this.now(),
  ): { gte: Date; lt: Date; lte: Date } {
    const range = this.monthRange(month);
    return {
      ...range,
      lte: this.completionCutoff(now),
    };
  }

  validCompletionUpperBound(now = this.now()): {
    lt: Date;
    lte: Date;
  } {
    const currentMonthRange = this.monthRange(this.operationalMonth(now));
    return {
      lt: currentMonthRange.lt,
      lte: this.completionCutoff(now),
    };
  }

  assertMonthNotFuture(
    month: string,
    code = 'DASHBOARD_MONTH_IN_FUTURE',
    now = this.now(),
  ): void {
    const currentMonth = this.operationalMonth(now);
    if (month <= currentMonth) {
      return;
    }
    throw new BadRequestException({
      code,
      details: {
        month,
        currentMonth,
        timeZone: operationalTimeZone(),
      },
    });
  }

  assertCompletionNotFuture(completedAt: Date, now = this.now()): void {
    const maximumCompletedAt = this.completionCutoff(now);
    if (completedAt.getTime() <= maximumCompletedAt.getTime()) {
      return;
    }
    throw new BadRequestException({
      code: 'UNLOADING_COMPLETION_DATE_IN_FUTURE',
      details: {
        completedAt: completedAt.toISOString(),
        maximumCompletedAt: maximumCompletedAt.toISOString(),
        serverNow: now.toISOString(),
        timeZone: operationalTimeZone(),
        toleranceSeconds: COMPLETION_FUTURE_TOLERANCE_MS / 1000,
      },
    });
  }
}
