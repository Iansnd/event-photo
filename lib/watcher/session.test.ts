import { describe, it, expect } from 'vitest';
import { reduce } from './session';
import { emptyState } from './types';
import type { WatcherState } from './types';

/** Helper: create a minimal File stub */
function fakeFile(name: string, size = 5_000_000, lastModified = 1000): File {
  return { name, size, lastModified, type: 'image/jpeg' } as unknown as File;
}

/** Helper: seed state with an active session */
function stateWithSession(code: string, now: number): WatcherState {
  const state = emptyState();
  // Detect a file, then decode QR to start a session
  const s1 = reduce(state, {
    type: 'FILES_DETECTED',
    files: [{ id: 'binding:1:100', file: fakeFile('binding.jpg', 5_000_000, now) }],
    now,
  });
  const s2 = reduce(s1, { type: 'QR_DECODED', fileId: 'binding:1:100', code });
  return s2;
}

describe('session reducer', () => {
  // ── Initial state ──────────────────────────────────────────
  it('starts with empty state — no session, no files', () => {
    const state = emptyState();
    expect(state.currentSession).toBeNull();
    expect(state.unclaimed).toHaveLength(0);
    expect(state.recentSessions).toHaveLength(0);
  });

  // ── FILES_DETECTED ─────────────────────────────────────────
  it('FILES_DETECTED with no session → files go to unclaimed', () => {
    const state = emptyState();
    const next = reduce(state, {
      type: 'FILES_DETECTED',
      files: [
        { id: 'a:1:100', file: fakeFile('a.jpg') },
        { id: 'b:2:200', file: fakeFile('b.jpg') },
      ],
      now: 1000,
    });
    expect(next.unclaimed).toHaveLength(2);
    expect(next.currentSession).toBeNull();
    expect(next.seenFileIds.has('a:1:100')).toBe(true);
    expect(next.seenFileIds.has('b:2:200')).toBe(true);
    expect(next.lastPhotoSeenAt).toBe(1000);
  });

  it('FILES_DETECTED with active session → appended to session photos', () => {
    const now = 5000;
    const state = stateWithSession('ABC123', now);
    expect(state.currentSession).not.toBeNull();

    const next = reduce(state, {
      type: 'FILES_DETECTED',
      files: [{ id: 'photo:3:300', file: fakeFile('photo.jpg') }],
      now: now + 1000,
    });
    expect(next.currentSession!.photos).toHaveLength(1);
    expect(next.currentSession!.photos[0].id).toBe('photo:3:300');
    expect(next.currentSession!.lastPhotoAt).toBe(now + 1000);
  });

  // ── QR_DECODED ─────────────────────────────────────────────
  it('QR_DECODED with valid code and no session → new session starts', () => {
    const state = emptyState();
    const s1 = reduce(state, {
      type: 'FILES_DETECTED',
      files: [{ id: 'qr:1:100', file: fakeFile('qr.jpg') }],
      now: 1000,
    });
    expect(s1.unclaimed).toHaveLength(1);

    const s2 = reduce(s1, { type: 'QR_DECODED', fileId: 'qr:1:100', code: 'ABCD12' });
    expect(s2.currentSession).not.toBeNull();
    expect(s2.currentSession!.code).toBe('ABCD12');
    expect(s2.currentSession!.bindingPhotoId).toBe('qr:1:100');
    expect(s2.unclaimed).toHaveLength(0);
  });

  it('QR_DECODED with same code as current session → updates binding, no restart', () => {
    const now = 5000;
    const state = stateWithSession('ABC123', now);
    // Add another file that also has the same QR
    const s1 = reduce(state, {
      type: 'FILES_DETECTED',
      files: [{ id: 'qr2:2:200', file: fakeFile('qr2.jpg') }],
      now: now + 500,
    });
    const s2 = reduce(s1, { type: 'QR_DECODED', fileId: 'qr2:2:200', code: 'ABC123' });

    expect(s2.currentSession!.code).toBe('ABC123');
    expect(s2.currentSession!.bindingPhotoId).toBe('qr2:2:200');
    expect(s2.recentSessions).toHaveLength(0); // old session NOT closed
  });

  it('QR_DECODED with different valid code → old session closes, new starts', () => {
    const now = 5000;
    const state = stateWithSession('ABC123', now);
    // Add a new file with different QR
    const s1 = reduce(state, {
      type: 'FILES_DETECTED',
      files: [{ id: 'newqr:3:300', file: fakeFile('newqr.jpg') }],
      now: now + 1000,
    });
    const s2 = reduce(s1, { type: 'QR_DECODED', fileId: 'newqr:3:300', code: 'XYZ789' });

    expect(s2.currentSession!.code).toBe('XYZ789');
    expect(s2.recentSessions).toHaveLength(1);
    expect(s2.recentSessions[0].code).toBe('ABC123');
    expect(s2.recentSessions[0].status).toBe('timed_out');
  });

  it('QR_DECODED with null code → file stays in unclaimed/photos', () => {
    const state = emptyState();
    const s1 = reduce(state, {
      type: 'FILES_DETECTED',
      files: [{ id: 'noqr:1:100', file: fakeFile('noqr.jpg') }],
      now: 1000,
    });
    const s2 = reduce(s1, { type: 'QR_DECODED', fileId: 'noqr:1:100', code: null });

    expect(s2.currentSession).toBeNull();
    expect(s2.unclaimed).toHaveLength(1);
    expect(s2.unclaimed[0].qrCode).toBeNull();
  });

  // ── TICK ───────────────────────────────────────────────────
  it('TICK with no activity for 10 min → session STAYS active', () => {
    const now = 5000;
    const state = stateWithSession('ABC123', now);

    const next = reduce(state, { type: 'TICK', now: now + 600_000 });
    expect(next.currentSession).not.toBeNull();
    expect(next.currentSession!.code).toBe('ABC123');
    expect(next.currentSession!.status).toBe('active');
    expect(next.recentSessions).toHaveLength(0);
  });

  it('TICK with camera silence > 60s → cameraDisconnectedAt set', () => {
    const state: WatcherState = { ...emptyState(), lastPhotoSeenAt: 1000 };
    const next = reduce(state, { type: 'TICK', now: 62_000 });
    expect(next.cameraDisconnectedAt).toBe(62_000);
  });

  it('TICK with recent activity → cameraDisconnectedAt cleared', () => {
    const state: WatcherState = {
      ...emptyState(),
      lastPhotoSeenAt: 60_000,
      cameraDisconnectedAt: 50_000,
    };
    const next = reduce(state, { type: 'TICK', now: 61_000 });
    expect(next.cameraDisconnectedAt).toBeNull();
  });

  // ── SESSION_SENT ───────────────────────────────────────────
  it('SESSION_SENT → moves to recentSessions, currentSession cleared', () => {
    const now = 5000;
    const state = stateWithSession('ABC123', now);

    const next = reduce(state, { type: 'SESSION_SENT', code: 'ABC123' });
    expect(next.currentSession).toBeNull();
    expect(next.recentSessions).toHaveLength(1);
    expect(next.recentSessions[0].status).toBe('sent');
    expect(next.recentSessions[0].sentAt).toBeDefined();
  });

  // ── SESSION_FAILED ─────────────────────────────────────────
  it('SESSION_FAILED → stays in currentSession, marked failed', () => {
    const now = 5000;
    const state = stateWithSession('ABC123', now);

    const next = reduce(state, { type: 'SESSION_FAILED', code: 'ABC123', error: 'mail timeout' });
    expect(next.currentSession).not.toBeNull();
    expect(next.currentSession!.status).toBe('failed');
    expect(next.currentSession!.errorMessage).toBe('mail timeout');
  });

  // ── MANUAL_CLOSE_SESSION ───────────────────────────────────
  it('MANUAL_CLOSE_SESSION → moves to recentSessions as timed_out', () => {
    const now = 5000;
    const state = stateWithSession('ABC123', now);

    const next = reduce(state, { type: 'MANUAL_CLOSE_SESSION' });
    expect(next.currentSession).toBeNull();
    expect(next.recentSessions).toHaveLength(1);
    expect(next.recentSessions[0].status).toBe('timed_out');
  });

  // ── MANUAL_ASSIGN_UNCLAIMED ────────────────────────────────
  it('MANUAL_ASSIGN_UNCLAIMED → file moves from unclaimed to session', () => {
    const now = 5000;
    // Start with an unclaimed file and an active session
    let state = stateWithSession('ABC123', now);
    // Add an unclaimed file by creating it before the session existed
    // Simpler: manually add to unclaimed
    const file = {
      id: 'orphan:1:100',
      name: 'orphan.jpg',
      createdAt: now,
      sizeBytes: 5_000_000,
      thumbnailDataUrl: '',
      qrCode: null,
      processed: false,
      fileHandle: undefined as unknown as FileSystemFileHandle,
    };
    state = { ...state, unclaimed: [file] };

    const next = reduce(state, {
      type: 'MANUAL_ASSIGN_UNCLAIMED',
      fileIds: ['orphan:1:100'],
      code: 'ABC123',
    });
    expect(next.unclaimed).toHaveLength(0);
    expect(next.currentSession!.photos).toContainEqual(expect.objectContaining({ id: 'orphan:1:100' }));
  });

  // ── GUEST_LOOKUP_RESULT ────────────────────────────────────
  it('GUEST_LOOKUP_RESULT sets name and email on current session', () => {
    const now = 5000;
    const state = stateWithSession('ABC123', now);

    const next = reduce(state, {
      type: 'GUEST_LOOKUP_RESULT',
      code: 'ABC123',
      name: 'Sarina',
      email: 'sarina@test.com',
    });
    expect(next.currentSession!.guestName).toBe('Sarina');
    expect(next.currentSession!.guestEmail).toBe('sarina@test.com');
  });

  // ── THUMBNAIL_READY ────────────────────────────────────────
  it('THUMBNAIL_READY sets dataUrl on matching file', () => {
    const state = emptyState();
    const s1 = reduce(state, {
      type: 'FILES_DETECTED',
      files: [{ id: 'img:1:100', file: fakeFile('img.jpg') }],
      now: 1000,
    });
    const s2 = reduce(s1, { type: 'THUMBNAIL_READY', fileId: 'img:1:100', dataUrl: 'data:image/jpeg;base64,abc' });
    expect(s2.unclaimed[0].thumbnailDataUrl).toBe('data:image/jpeg;base64,abc');
  });

  // ── TOGGLE_AUTO_MODE ────────────────────────────────────────
  it('TOGGLE_AUTO_MODE flips autoModeEnabled', () => {
    const state = emptyState();
    expect(state.autoModeEnabled).toBe(true);
    const s1 = reduce(state, { type: 'TOGGLE_AUTO_MODE' });
    expect(s1.autoModeEnabled).toBe(false);
    const s2 = reduce(s1, { type: 'TOGGLE_AUTO_MODE' });
    expect(s2.autoModeEnabled).toBe(true);
  });

  // ── Auto-send on QR switch ─────────────────────────────────
  it('auto ON + different QR + session has photos → sending + pendingAutoSend', () => {
    const now = 5000;
    let state = stateWithSession('ABC123', now);
    // Add a portrait photo
    state = reduce(state, {
      type: 'FILES_DETECTED',
      files: [{ id: 'portrait:1:100', file: fakeFile('portrait.jpg', 5_000_000, now) }],
      now: now + 1000,
    });
    expect(state.autoModeEnabled).toBe(true);
    expect(state.currentSession!.photos).toHaveLength(1);

    // New QR arrives
    state = reduce(state, {
      type: 'FILES_DETECTED',
      files: [{ id: 'newqr:2:200', file: fakeFile('newqr.jpg', 5_000_000, now + 2000) }],
      now: now + 2000,
    });
    state = reduce(state, { type: 'QR_DECODED', fileId: 'newqr:2:200', code: 'XYZ789' });

    expect(state.currentSession!.code).toBe('XYZ789');
    expect(state.recentSessions[0].code).toBe('ABC123');
    expect(state.recentSessions[0].status).toBe('sending');
    expect(state.pendingAutoSend).not.toBeNull();
    expect(state.pendingAutoSend!.sessionCode).toBe('ABC123');
    expect(state.pendingAutoSend!.photos).toHaveLength(1);
  });

  it('auto OFF + different QR + session has photos → timed_out, no pendingAutoSend', () => {
    const now = 5000;
    let state = stateWithSession('ABC123', now);
    state = reduce(state, { type: 'TOGGLE_AUTO_MODE' }); // turn off
    state = reduce(state, {
      type: 'FILES_DETECTED',
      files: [{ id: 'portrait:1:100', file: fakeFile('portrait.jpg', 5_000_000, now) }],
      now: now + 1000,
    });

    state = reduce(state, {
      type: 'FILES_DETECTED',
      files: [{ id: 'newqr:2:200', file: fakeFile('newqr.jpg', 5_000_000, now + 2000) }],
      now: now + 2000,
    });
    state = reduce(state, { type: 'QR_DECODED', fileId: 'newqr:2:200', code: 'XYZ789' });

    expect(state.recentSessions[0].status).toBe('timed_out');
    expect(state.pendingAutoSend).toBeNull();
  });

  it('auto ON + different QR + session has NO photos → timed_out', () => {
    const now = 5000;
    let state = stateWithSession('ABC123', now);
    // No portrait photos added — session only has binding

    state = reduce(state, {
      type: 'FILES_DETECTED',
      files: [{ id: 'newqr:2:200', file: fakeFile('newqr.jpg', 5_000_000, now + 1000) }],
      now: now + 1000,
    });
    state = reduce(state, { type: 'QR_DECODED', fileId: 'newqr:2:200', code: 'XYZ789' });

    expect(state.recentSessions[0].status).toBe('timed_out');
    expect(state.pendingAutoSend).toBeNull();
  });

  // ── EXCLUDE_PHOTO ──────────────────────────────────────────
  it('EXCLUDE_PHOTO marks photo as excluded but keeps it in photos array', () => {
    const now = 5000;
    let state = stateWithSession('ABC123', now);
    state = reduce(state, {
      type: 'FILES_DETECTED',
      files: [
        { id: 'p1:1:100', file: fakeFile('p1.jpg', 5_000_000, now) },
        { id: 'p2:2:100', file: fakeFile('p2.jpg', 5_000_000, now) },
      ],
      now: now + 500,
    });
    expect(state.currentSession!.photos).toHaveLength(2);

    const next = reduce(state, { type: 'EXCLUDE_PHOTO', fileId: 'p1:1:100' });
    expect(next.currentSession!.photos).toHaveLength(2);
    expect(next.currentSession!.photos[0].excluded).toBe(true);
    expect(next.currentSession!.photos[1].excluded).toBeUndefined();
    expect(next.currentSession!.status).toBe('active');
  });

  it('EXCLUDE_PHOTO with no current session is a no-op', () => {
    const state = emptyState();
    const next = reduce(state, { type: 'EXCLUDE_PHOTO', fileId: 'anything' });
    expect(next).toEqual(state);
  });

  it('EXCLUDE_PHOTO with non-existent fileId is a no-op on photos', () => {
    const now = 5000;
    let state = stateWithSession('ABC123', now);
    state = reduce(state, {
      type: 'FILES_DETECTED',
      files: [{ id: 'p1:1:100', file: fakeFile('p1.jpg', 5_000_000, now) }],
      now: now + 500,
    });
    const before = state.currentSession!.photos;
    const next = reduce(state, { type: 'EXCLUDE_PHOTO', fileId: 'ghost:9:9' });
    expect(next.currentSession!.photos).toHaveLength(before.length);
    expect(next.currentSession!.photos.every((p) => !p.excluded)).toBe(true);
  });

  it('auto-send filters excluded photos from pendingAutoSend', () => {
    const now = 5000;
    let state = stateWithSession('ABC123', now);
    state = reduce(state, {
      type: 'FILES_DETECTED',
      files: [
        { id: 'p1:1:100', file: fakeFile('p1.jpg', 5_000_000, now) },
        { id: 'p2:2:100', file: fakeFile('p2.jpg', 5_000_000, now) },
        { id: 'p3:3:100', file: fakeFile('p3.jpg', 5_000_000, now) },
      ],
      now: now + 500,
    });
    state = reduce(state, { type: 'EXCLUDE_PHOTO', fileId: 'p2:2:100' });

    state = reduce(state, {
      type: 'FILES_DETECTED',
      files: [{ id: 'newqr:9:100', file: fakeFile('newqr.jpg', 5_000_000, now + 2000) }],
      now: now + 2000,
    });
    state = reduce(state, { type: 'QR_DECODED', fileId: 'newqr:9:100', code: 'XYZ789' });

    expect(state.pendingAutoSend).not.toBeNull();
    expect(state.pendingAutoSend!.photos).toHaveLength(2);
    expect(state.pendingAutoSend!.photos.map((p) => p.id)).toEqual(['p1:1:100', 'p3:3:100']);
  });

  it('auto-send does not fire when all photos are excluded', () => {
    const now = 5000;
    let state = stateWithSession('ABC123', now);
    state = reduce(state, {
      type: 'FILES_DETECTED',
      files: [{ id: 'p1:1:100', file: fakeFile('p1.jpg', 5_000_000, now) }],
      now: now + 500,
    });
    state = reduce(state, { type: 'EXCLUDE_PHOTO', fileId: 'p1:1:100' });

    state = reduce(state, {
      type: 'FILES_DETECTED',
      files: [{ id: 'newqr:9:100', file: fakeFile('newqr.jpg', 5_000_000, now + 2000) }],
      now: now + 2000,
    });
    state = reduce(state, { type: 'QR_DECODED', fileId: 'newqr:9:100', code: 'XYZ789' });

    expect(state.pendingAutoSend).toBeNull();
    expect(state.recentSessions[0].status).toBe('timed_out');
  });

  // ── Edge: recentSessions capped at 20 ─────────────────────
  it('recentSessions is capped at 20', () => {
    let state = emptyState();
    for (let i = 0; i < 25; i++) {
      const code = `CODE${String(i).padStart(2, '0')}`;
      const fileId = `f:${i}:100`;
      state = reduce(state, {
        type: 'FILES_DETECTED',
        files: [{ id: fileId, file: fakeFile(`${code}.jpg`) }],
        now: i * 1000,
      });
      state = reduce(state, { type: 'QR_DECODED', fileId, code });
      state = reduce(state, { type: 'MANUAL_CLOSE_SESSION' });
    }
    expect(state.recentSessions).toHaveLength(20);
  });
});
