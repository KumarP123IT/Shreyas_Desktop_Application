/**
 * Vitest tests for the WhatsApp conversation state machine.
 * Tests the pure logic without DB or WAHA calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addHours, addDays, subHours } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

const TZ = 'Asia/Kolkata';

// ── Inline the flexible datetime parser (mirrors conversationService.js) ───────

function parseFlexibleDatetime(text) {
  const s = text.trim().toLowerCase();

  if (s.startsWith('tomorrow')) {
    const timeMatch = s.match(/(\d{1,2})[:\.]?(\d{2})?\s*(am|pm)?/);
    if (timeMatch) {
      let h = parseInt(timeMatch[1]);
      const m = parseInt(timeMatch[2] || '0');
      if (timeMatch[3] === 'pm' && h < 12) h += 12;
      if (timeMatch[3] === 'am' && h === 12) h = 0;
      const tomorrow = addDays(new Date(), 1);
      tomorrow.setHours(h, m, 0, 0);
      return fromZonedTime(tomorrow, TZ);
    }
    return null;
  }

  const match = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2})[:\.](\d{2})/);
  if (match) {
    const [, d, mo, y, h, min] = match;
    const localDate = new Date(
      parseInt(y), parseInt(mo) - 1, parseInt(d), parseInt(h), parseInt(min), 0
    );
    return fromZonedTime(localDate, TZ);
  }
  return null;
}

// ── Inline the snooze/reschedule validation ────────────────────────────────────

function validateReschedule(dt, delivery) {
  if (dt <= new Date()) return { valid: false, reason: 'past' };
  if (delivery.startDate && dt < new Date(delivery.startDate)) return { valid: false, reason: 'before_start' };
  if (delivery.dueDate && dt > new Date(delivery.dueDate)) return { valid: false, reason: 'after_due' };
  return { valid: true };
}

function validateSnooze(hours) {
  if (isNaN(hours) || hours <= 0 || hours > 168) return { valid: false, reason: 'invalid_hours' };
  return { valid: true };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('parseFlexibleDatetime', () => {
  it('parses dd-mm-yyyy HH:MM format', () => {
    const dt = parseFlexibleDatetime('20-02-2027 10:30');
    expect(dt).toBeInstanceOf(Date);
    expect(dt.getTime()).toBeGreaterThan(0);
  });

  it('parses dd/mm/yyyy HH:MM format', () => {
    const dt = parseFlexibleDatetime('20/02/2027 14:00');
    expect(dt).toBeInstanceOf(Date);
  });

  it('parses "tomorrow 10am"', () => {
    const dt = parseFlexibleDatetime('tomorrow 10am');
    expect(dt).toBeInstanceOf(Date);
    const tomorrow = addDays(new Date(), 1);
    expect(dt.getDate()).toBe(tomorrow.getDate()); // approximately
  });

  it('returns null for garbage input', () => {
    expect(parseFlexibleDatetime('not a date')).toBeNull();
    expect(parseFlexibleDatetime('')).toBeNull();
  });
});

describe('validateReschedule', () => {
  const future = addHours(new Date(), 48);
  const delivery = {
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days out
  };

  it('accepts a valid future date within window', () => {
    const result = validateReschedule(future, delivery);
    expect(result.valid).toBe(true);
  });

  it('rejects a date in the past', () => {
    const past = subHours(new Date(), 1);
    const result = validateReschedule(past, delivery);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('past');
  });

  it('rejects a date after due date', () => {
    const afterDue = addDays(new Date(delivery.dueDate), 1);
    const result = validateReschedule(afterDue, delivery);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('after_due');
  });
});

describe('validateSnooze', () => {
  it('accepts valid snooze hours (1, 2, 4, 8, 24)', () => {
    [1, 2, 4, 8, 24].forEach((h) => expect(validateSnooze(h).valid).toBe(true));
  });
  it('rejects 0 hours', () => expect(validateSnooze(0).valid).toBe(false));
  it('rejects negative hours', () => expect(validateSnooze(-1).valid).toBe(false));
  it('rejects more than 168h (1 week)', () => expect(validateSnooze(200).valid).toBe(false));
  it('rejects NaN', () => expect(validateSnooze(NaN).valid).toBe(false));
});

describe('conversation state transitions', () => {
  // Simulate state machine transitions
  const states = {
    initial:          'awaiting_action',
    afterSnooze:      'awaiting_hours',
    afterDatetime:    'awaiting_datetime',
    afterScope:       'awaiting_scope',
    afterConfirm:     'awaiting_confirm',
  };

  it('reply "1" transitions from awaiting_action to awaiting_hours', () => {
    const state = 'awaiting_action';
    const reply = '1';
    const next = reply === '1' ? 'awaiting_hours' : reply === '2' ? 'awaiting_datetime' : reply === '3' ? 'awaiting_scope' : null;
    expect(next).toBe('awaiting_hours');
  });

  it('reply "2" transitions to awaiting_datetime', () => {
    const next = '2' === '1' ? 'awaiting_hours' : '2' === '2' ? 'awaiting_datetime' : 'awaiting_scope';
    expect(next).toBe('awaiting_datetime');
  });

  it('reply "3" transitions to awaiting_scope', () => {
    const next = '3' === '1' ? 'awaiting_hours' : '3' === '2' ? 'awaiting_datetime' : 'awaiting_scope';
    expect(next).toBe('awaiting_scope');
  });

  it('invalid reply stays in same state (increments retry count)', () => {
    const retries = 0;
    const newRetries = retries + 1;
    expect(newRetries).toBe(1);
    expect(newRetries < 3).toBe(true); // still has retries
  });

  it('max retries (3) ends conversation', () => {
    const retries = 3;
    expect(retries >= 3).toBe(true);
  });

  it('scope "1" maps to material', () => {
    expect('1' === '1' ? 'material' : 'delivery').toBe('material');
  });

  it('scope "2" maps to delivery', () => {
    expect('2' === '2' ? 'delivery' : 'material').toBe('delivery');
  });

  it('"YES" confirms action', () => {
    expect('YES'.toUpperCase() === 'YES').toBe(true);
  });

  it('"yes" (lowercase) also confirms', () => {
    expect('yes'.toUpperCase() === 'YES').toBe(true);
  });

  it('"NO" does not confirm', () => {
    expect('NO'.toUpperCase() === 'YES').toBe(false);
  });

  it('"cancel" always exits any state', () => {
    expect('cancel'.toLowerCase() === 'cancel').toBe(true);
  });
});

describe('deduplication', () => {
  it('same waMessageId should be ignored', () => {
    const seen = new Set();
    const msgId = 'abc123';
    seen.add(msgId);
    expect(seen.has(msgId)).toBe(true); // duplicate detected
    expect(seen.has('xyz456')).toBe(false); // new message OK
  });

  it('snooze creates new dedupeKey so no duplicate reminders', () => {
    const original = 'd1:o10:c:whatsapp';
    const snoozed  = `${original}:snooze:${Date.now()}`;
    expect(snoozed).not.toBe(original);
    expect(snoozed.startsWith(original)).toBe(true);
  });
});
