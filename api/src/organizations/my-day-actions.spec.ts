import { JobStatus } from '../generated/prisma/client.js';
import {
  myDayJobActions,
  pickCurrentJobId,
  formatSiteAddress,
} from './my-day-actions.js';

describe('myDayJobActions', () => {
  it('enables clock in only when assigned and not already clocked', () => {
    const actions = myDayJobActions({
      jobId: 'job-1',
      status: JobStatus.DISPATCHED,
      assigned: true,
      clockedIn: false,
      clockJobId: null,
      hasSignature: false,
      requireClientSignOff: true,
    });
    expect(actions.canClockIn).toBe(true);
    expect(actions.canClockOut).toBe(false);
    expect(actions.canAddWorkUpdate).toBe(true);
    expect(actions.canSignOff).toBe(false);
  });

  it('enables clock out for the open session job or a day clock', () => {
    const onJob = myDayJobActions({
      jobId: 'job-1',
      status: JobStatus.IN_PROGRESS,
      assigned: true,
      clockedIn: true,
      clockJobId: 'job-1',
      hasSignature: false,
      requireClientSignOff: true,
    });
    expect(onJob.canClockIn).toBe(false);
    expect(onJob.canClockOut).toBe(true);
    expect(onJob.canSignOff).toBe(true);

    const otherJob = myDayJobActions({
      jobId: 'job-2',
      status: JobStatus.DISPATCHED,
      assigned: true,
      clockedIn: true,
      clockJobId: 'job-1',
      hasSignature: false,
      requireClientSignOff: true,
    });
    expect(otherJob.canClockOut).toBe(false);
  });

  it('blocks capture on draft or unassigned work', () => {
    const draft = myDayJobActions({
      jobId: 'job-1',
      status: JobStatus.DRAFT,
      assigned: true,
      clockedIn: false,
      clockJobId: null,
      hasSignature: false,
      requireClientSignOff: true,
    });
    expect(draft.canClockIn).toBe(false);
    expect(draft.canAddPhoto).toBe(false);

    const foreign = myDayJobActions({
      jobId: 'job-1',
      status: JobStatus.IN_PROGRESS,
      assigned: false,
      clockedIn: false,
      clockJobId: null,
      hasSignature: false,
      requireClientSignOff: true,
    });
    expect(foreign.canAddMaterial).toBe(false);
    expect(foreign.canSignOff).toBe(false);
  });
});

describe('pickCurrentJobId', () => {
  it('prefers the clocked job, then in-progress, then dispatched', () => {
    const jobs = [
      { id: 'a', status: JobStatus.DISPATCHED, scheduledStart: new Date('2026-09-23T14:00:00Z') },
      { id: 'b', status: JobStatus.IN_PROGRESS, scheduledStart: new Date('2026-09-23T16:00:00Z') },
    ];
    expect(pickCurrentJobId(jobs, 'a')).toBe('a');
    expect(pickCurrentJobId(jobs, null)).toBe('b');
    expect(
      pickCurrentJobId(
        [{ id: 'a', status: JobStatus.DISPATCHED, scheduledStart: new Date('2026-09-23T14:00:00Z') }],
        null,
      ),
    ).toBe('a');
  });
});

describe('formatSiteAddress', () => {
  it('joins present address parts', () => {
    expect(
      formatSiteAddress({
        addressLine1: '100 Lake Shore',
        city: 'Chicago',
        region: 'IL',
        postalCode: '60601',
        country: 'US',
      }),
    ).toBe('100 Lake Shore, Chicago, IL, 60601, US');
  });
});
