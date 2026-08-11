// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createReplayNoteDocumentFromPlainText } from '@zinuto/shared/replayNoteDocument';

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), 'zinuto-replay-note-colors-'),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const [{ db }, replayNoteService] = await Promise.all([
  import('../../src/infrastructure/db/database.js'),
  import('../../src/application/replayNoteService.js'),
]);

const {
  createReplayNote,
  updateReplayNote,
  getReplayNoteById,
  deleteReplayNote,
  listReplayNotes,
  listRecentReplayNoteSummaries,
} = replayNoteService;

const noteDocument = (text: string) =>
  createReplayNoteDocumentFromPlainText(text);

test.after(async () => {
  db.close();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

test.beforeEach(() => {
  db.prepare('DELETE FROM sim_fills').run();
  db.prepare('DELETE FROM sim_orders').run();
  db.prepare('DELETE FROM replay_sessions').run();
  db.prepare("DELETE FROM instruments WHERE id = 'note-marker-instrument'").run();
  db.prepare('DELETE FROM replay_note_attachments').run();
  db.prepare('DELETE FROM replay_note_contents').run();
  db.prepare('DELETE FROM replay_note_colors').run();
  db.prepare('DELETE FROM replay_notes_fts').run();
  db.prepare('DELETE FROM replay_notes').run();
});

test('replay note compact document stores attachment refs and keeps list payload light', async () => {
  const created = await createReplayNote({
    id: 'note-document',
    title: 'Document Note',
    type: 'CUSTOM',
    contentDocument: {
      schemaVersion: 1,
      blocks: [
        {
          blockKind: 'H2',
          children: [{ inlineKind: 'TEXT', text: 'Opening Plan' }],
        },
        {
          blockKind: 'PARAGRAPH',
          children: [
            { inlineKind: 'TEXT', text: 'Wait for breakout confirmation ' },
            { inlineKind: 'CAPSULE', attachmentRefId: 'capsule-risk' },
          ],
        },
        {
          blockKind: 'EMBED',
          attachmentRefId: 'chart-view',
        },
      ],
    },
    attachments: [
      {
        attachmentRefId: 'capsule-risk',
        kind: 'CAPSULE',
        summary: { label: 'Risk', value: 'Low', tone: 'positive' },
        payload: { shouldStayOutOfList: true },
      },
      {
        attachmentRefId: 'chart-view',
        kind: 'CHART_VIEW',
        summary: { label: 'Chart', value: 'AAPL 1d' },
        ref: { kind: 'TRAINING_PROJECT', id: 'project-1' },
        payload: { viewport: { start: 10, end: 42 } },
      },
    ],
    colorTokens: ['BLUE'],
  });

  assert.equal(created.contentDocument.blocks.length, 3);
  assert.equal(created.contentPreview, 'Opening Plan Wait for breakout confirmation Risk Low Chart AAPL 1d');
  assert.equal(created.attachments.length, 2);
  assert.deepEqual(created.attachments[0]?.payload, { shouldStayOutOfList: true });

  const listed = listReplayNotes(20, undefined, { keyword: 'breakout' });
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0]?.id, 'note-document');
  assert.equal('contentDocument' in listed.items[0], false);
  assert.equal(listed.items[0]?.attachments?.[0]?.payload, undefined);

  const capsuleSearch = listReplayNotes(20, undefined, { keyword: 'risk' });
  assert.equal(capsuleSearch.items[0]?.id, 'note-document');

  const detail = await getReplayNoteById('note-document');
  assert.equal(detail?.contentDocument.blocks[1]?.blockKind, 'PARAGRAPH');
  assert.deepEqual(detail?.attachments?.[1]?.payload, { viewport: { start: 10, end: 42 } });

  await assert.rejects(
    updateReplayNote('note-document', {
      contentDocument: {
        schemaVersion: 1,
        blocks: [
          {
            blockKind: 'EMBED',
            attachmentRefId: 'missing-attachment',
          },
        ],
      },
    }),
    /INVALID_PARAMS/,
  );
});

test('replay note colors normalize on create and update without tag state', async () => {
  const created = await createReplayNote({
    id: 'note-colors',
    title: 'Replay Note',
    type: 'FREE_REPLAY',
    contentDocument: noteDocument('Initial content'),
    colorTokens: ['blue', 'RED', 'RED', 'invalid'] as never,
    createdAt: '2026-04-21T08:00:00.000Z',
    updatedAt: '2026-04-21T08:00:00.000Z',
  });

  assert.deepEqual(created.colorTokens, ['BLUE', 'RED']);

  const updated = await updateReplayNote('note-colors', {
    colorTokens: ['GREEN', 'yellow', 'GREEN'] as never,
  });
  assert.deepEqual(updated.colorTokens, ['GREEN', 'YELLOW']);

  const contentOnly = await updateReplayNote('note-colors', {
    contentDocument: noteDocument('Content-only updates keep colors'),
  });
  assert.deepEqual(contentOnly.colorTokens, ['GREEN', 'YELLOW']);

  const cleared = await updateReplayNote('note-colors', {
    colorTokens: [],
  });
  assert.deepEqual(cleared.colorTokens, []);
});

test('free replay note snapshots backfill all window fills from session truth', async () => {
  const now = '2026-04-21T08:00:00.000Z';
  const sessionId = 'note-marker-session';
  const instrumentId = 'note-marker-instrument';
  db.prepare(
    `INSERT OR IGNORE INTO users (id,name,created_at) VALUES (?,?,?)`,
  ).run('default-user', 'Default User', now);
  db.prepare(
    `INSERT INTO instruments (
       id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,time_start_ts,time_end_ts,bars_version_token,created_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    instrumentId,
    'NOTEFILL',
    '1d',
    'Note Fill',
    'LOCAL',
    'UTC',
    1,
    700,
    now,
    now,
    'v1',
    now,
  );
  db.prepare(
    `INSERT INTO replay_sessions (
       id,user_id,instrument_id,sample_pool_id,trading_settings_json,access_grant_json,timeframe,minimum_base_timeframe,
       start_index,entry_index,history_bars,cursor_index,cash_balance,autoplay_interval_ms,is_paused,session_scope,created_at,updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    sessionId,
    'default-user',
    instrumentId,
    'pool',
    '{}',
    'null',
    '1d',
    '1d',
    100,
    100,
    500,
    599,
    100000,
    1000,
    1,
    'SIMULATION_ONLY',
    now,
    now,
  );
  db.prepare(
    `INSERT INTO sim_orders (
       id,session_id,instrument_id,side,qty,amount,price_mode,submit_index,status,auto_step_next,created_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run('note-marker-order-buy', sessionId, instrumentId, 'BUY', 1, null, 'CUR_CLOSE', 100, 'FILLED', 1, now);
  db.prepare(
    `INSERT INTO sim_orders (
       id,session_id,instrument_id,side,qty,amount,price_mode,submit_index,status,auto_step_next,created_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run('note-marker-order-sell', sessionId, instrumentId, 'SELL', 1, null, 'CUR_CLOSE', 100, 'FILLED', 1, now);

  const insertFill = db.prepare(
    `INSERT INTO sim_fills (
       id,order_id,session_id,instrument_id,side,fill_index,fill_time,fill_trade_day,fill_price,fill_qty,
       contract_multiplier,fee,tax,slippage,created_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const fills = Array.from({ length: 620 }, (_, index) => {
    const side = index % 2 === 0 ? 'BUY' : 'SELL';
    const rawIndex = 100 + Math.floor(index / 2);
    return {
      id: `note-window-fill-${index}`,
      orderId: side === 'BUY' ? 'note-marker-order-buy' : 'note-marker-order-sell',
      side,
      rawIndex,
      ts: new Date(Date.UTC(2026, 3, 21 + (rawIndex - 100))).toISOString(),
    };
  });
  db.transaction(() => {
    fills.forEach((fill, index) => {
      insertFill.run(
        fill.id,
        fill.orderId,
        sessionId,
        instrumentId,
        fill.side,
        fill.rawIndex,
        fill.ts,
        fill.ts.slice(0, 10),
        10 + index / 100,
        1,
        1,
        0,
        0,
        0,
        fill.ts,
      );
    });
  })();

  const bars = Array.from({ length: 500 }, (_, index) => ({
    ts: new Date(Date.UTC(2026, 3, 21 + index)).toISOString(),
    open: 10 + index,
    high: 11 + index,
    low: 9 + index,
    close: 10.5 + index,
    volume: 1000,
  }));
  const tailResidentFills = fills.slice(-500).map((fill, index) => ({
    id: fill.id,
    order_id: fill.orderId,
    session_id: sessionId,
    instrument_id: instrumentId,
    symbol: 'NOTEFILL',
    side: fill.side,
    fill_index: fill.rawIndex - 100,
    fill_time: fill.ts,
    fill_price: 10 + index / 100,
    fill_qty: 1,
    contract_multiplier: 1,
    fee: 0,
    tax: 0,
    slippage: 0,
    created_at: fill.ts,
  }));
  const contextReplay = {
    bars,
    barWindow: {
      startRawIndex: 100,
      endRawIndex: 599,
      totalBars: 700,
      limited: true,
    },
    snapshot: {
      session: {
        id: sessionId,
        instrument_id: instrumentId,
        symbol: 'NOTEFILL',
        start_index: 0,
        entry_index: 0,
        cursor_index: 499,
      },
      accounts: [],
      positions: [],
      fills: tailResidentFills,
      fillsTotal: 620,
      residentFillsStartIndex: 120,
      nextFillCursor: null,
      drawings: [],
    },
    baseTimeframe: '1d',
    displayPeriod: '1d',
  };

  await createReplayNote({
    id: 'note-snapshot-fills',
    title: 'Snapshot fills',
    type: 'FREE_REPLAY',
    contentDocument: noteDocument('Snapshot fill content'),
    trainingProjectId: sessionId,
    contextSessionId: sessionId,
    contextCursorIndex: 599,
    contextDisplayPeriod: '1d',
    contextReplay,
  });

  const createdDetail = await getReplayNoteById('note-snapshot-fills');
  const createdSnapshot = (createdDetail?.contextReplay as Record<string, any>)
    ?.snapshot as Record<string, any>;
  assert.equal(createdSnapshot.fills.length, 620);
  assert.equal(createdSnapshot.fillsTotal, 620);
  assert.equal(createdSnapshot.residentFillsStartIndex, 0);
  assert.equal(createdSnapshot.fills[0]?.id, 'note-window-fill-0');
  assert.equal(createdSnapshot.fills[0]?.fill_index, 0);
  assert.equal(createdSnapshot.fills.at(-1)?.id, 'note-window-fill-619');
  assert.equal(createdSnapshot.fills.at(-1)?.fill_index, 309);

  await updateReplayNote('note-snapshot-fills', {
    title: 'Snapshot fills updated',
    contextSessionId: sessionId,
    contextCursorIndex: 599,
    contextReplay,
  });

  const updatedDetail = await getReplayNoteById('note-snapshot-fills');
  const updatedSnapshot = (updatedDetail?.contextReplay as Record<string, any>)
    ?.snapshot as Record<string, any>;
  assert.equal(updatedSnapshot.fills.length, 620);
  assert.equal(updatedSnapshot.fills[0]?.id, 'note-window-fill-0');
  assert.equal(updatedSnapshot.fills.at(-1)?.id, 'note-window-fill-619');
});

test('replay note list filters by the three note types and color tokens with OR matching', async () => {
  await createReplayNote({
    id: 'note-free-replay',
    title: 'Free Replay Note',
    type: 'FREE_REPLAY',
    contentDocument: noteDocument('free replay body'),
    colorTokens: ['RED', 'ORANGE'],
    createdAt: '2026-04-21T08:00:00.000Z',
    updatedAt: '2026-04-21T08:00:00.000Z',
  });
  await createReplayNote({
    id: 'note-challenge',
    title: 'Challenge Note',
    type: 'CHALLENGE',
    contentDocument: noteDocument('challenge body'),
    colorTokens: ['BLUE'],
    createdAt: '2026-04-21T09:00:00.000Z',
    updatedAt: '2026-04-21T09:00:00.000Z',
  });
  await createReplayNote({
    id: 'note-custom',
    title: 'Custom Note',
    type: 'CUSTOM',
    contentDocument: noteDocument('custom body'),
    colorTokens: [],
    createdAt: '2026-04-21T10:00:00.000Z',
    updatedAt: '2026-04-21T10:00:00.000Z',
  });

  const colored = listReplayNotes(20, undefined, {
    colorTokens: ['RED', 'BLUE'],
  });
  assert.deepEqual(
    colored.items.map((item) => item.id),
    ['note-challenge', 'note-free-replay'],
  );

  const challenge = listReplayNotes(20, undefined, { scope: 'CHALLENGE' });
  assert.deepEqual(challenge.items.map((item) => item.id), ['note-challenge']);

  const custom = listReplayNotes(20, undefined, { type: 'CUSTOM' });
  assert.deepEqual(custom.items.map((item) => item.id), ['note-custom']);

  const noGreen = listReplayNotes(20, undefined, { colorTokens: ['GREEN'] });
  assert.equal(noGreen.total, 0);

  const recent = listRecentReplayNoteSummaries(2);
  assert.deepEqual(
    recent.map((item) => [item.id, item.type, item.colorTokens]),
    [
      ['note-custom', 'CUSTOM', []],
      ['note-challenge', 'CHALLENGE', ['BLUE']],
    ],
  );
});

test('deleting a replay note cascades note-owned colors', async () => {
  await createReplayNote({
    id: 'note-delete',
    title: 'Delete Note',
    type: 'CUSTOM',
    contentDocument: noteDocument('delete me'),
    colorTokens: ['RED', 'BLUE'],
  });

  const before = db
    .prepare('SELECT COUNT(*) AS count FROM replay_note_colors WHERE note_id = ?')
    .get('note-delete') as { count: number };
  assert.equal(before.count, 2);

  assert.deepEqual(deleteReplayNote('note-delete'), { deleted: 1 });

  const after = db
    .prepare('SELECT COUNT(*) AS count FROM replay_note_colors WHERE note_id = ?')
    .get('note-delete') as { count: number };
  assert.equal(after.count, 0);
});

test('non-canonical replay note types are rejected instead of mapped into the current model', async () => {
  await assert.rejects(
    createReplayNote({
      id: 'non-canonical-note',
      title: 'Non-canonical Note',
      type: 'TRAINING_RECORD',
      contentDocument: noteDocument(''),
    } as never),
    /INVALID_REPLAY_NOTE_TYPE/,
  );
});

test('replay note storage rejects non-canonical note types', () => {
  assert.throws(
    () => {
      db.prepare(
        `INSERT INTO replay_notes (
          id,title,type,content_preview,created_at,updated_at
        ) VALUES (?,?,?,?,?,?)`,
      ).run(
        'non-canonical-storage-note',
        'Non-canonical Storage Note',
        'TRAINING_RECORD',
        '',
        '2026-04-21T08:00:00.000Z',
        '2026-04-21T08:00:00.000Z',
      );
    },
    /CHECK constraint failed/i,
  );
});
