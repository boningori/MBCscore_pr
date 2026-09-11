// スナップショットの保持則。
//
// 旧実装は「新しい順に10世代」だけで、しかも判断が saveSnapshot の
// IndexedDB トランザクションに埋まっていた。試合中の自動保存は最短30秒間隔で
// 走るので、1試合録るだけで全世代がその試合の最後の5分で埋まり、
// 「誤って削除した」「不正なデータを取り込んで上書きした」——気づくのが
// 数時間〜数日後になる場面——をまったく救えなかった。
//
// 枠を2つに分けるのが新しい規則の要点。ここでは IndexedDB を使わずに
// 「どの世代を残すか」だけを検査する。

import { describe, it, expect } from 'vitest';
import {
    MAX_MILESTONES,
    MAX_PERIODIC,
    hasStartupSnapshotToday,
    isMilestone,
    selectExpiredSnapshots,
} from './mirrorBackupRetention';
import type { SnapshotMeta, SnapshotReason } from './mirrorBackupRetention';

const meta = (timestamp: number, reason?: SnapshotReason): SnapshotMeta => ({ timestamp, reason });

/** 現地時刻の日付・時刻から timestamp を作る（暦日の判定は現地時刻で行うため） */
const at = (y: number, m: number, d: number, h: number, min = 0): number =>
    new Date(y, m - 1, d, h, min).getTime();

describe('isMilestone', () => {
    it('gameEnd / startup / beforeRestore は区切り', () => {
        expect(isMilestone('gameEnd')).toBe(true);
        expect(isMilestone('startup')).toBe(true);
        expect(isMilestone('beforeRestore')).toBe(true);
    });

    it('periodic は定期', () => {
        expect(isMilestone('periodic')).toBe(false);
    });

    // v1 が書いた世代は reason を持たない。旧世代は試合中の自動保存が
    // ほとんどなので、保護せず定期として回す
    it('未設定（旧世代）は定期として扱う', () => {
        expect(isMilestone(undefined)).toBe(false);
    });
});

describe('selectExpiredSnapshots', () => {
    it('世代が枠に収まっていれば何も消さない', () => {
        const metas = [meta(3, 'periodic'), meta(2, 'gameEnd'), meta(1, 'startup')];
        expect(selectExpiredSnapshots(metas)).toEqual([]);
    });

    it('定期が枠を超えたら、古い定期だけが落ちる', () => {
        const metas = [1, 2, 3, 4, 5].map(t => meta(t * 1000, 'periodic'));
        expect(selectExpiredSnapshots(metas).sort()).toEqual([1000, 2000]);
    });

    // この設計の主眼。試合中の自動保存が区切りを押し出さないこと
    it('定期をいくら積んでも、区切りは落ちない', () => {
        const milestone = meta(1, 'gameEnd');
        const periodics = Array.from({ length: 20 }, (_, i) => meta((i + 2) * 1000, 'periodic'));
        const expired = selectExpiredSnapshots([milestone, ...periodics]);
        expect(expired).not.toContain(1);
        expect(expired).toHaveLength(20 - MAX_PERIODIC);
    });

    it('区切りが枠を超えたら、古い区切りが落ちる', () => {
        const metas = Array.from({ length: MAX_MILESTONES + 2 }, (_, i) => meta((i + 1) * 1000, 'gameEnd'));
        expect(selectExpiredSnapshots(metas).sort((a, b) => a - b)).toEqual([1000, 2000]);
    });

    it('区切りをいくら積んでも、直近の定期は落ちない', () => {
        const periodic = meta(999_000, 'periodic');
        const milestones = Array.from({ length: MAX_MILESTONES + 5 }, (_, i) => meta((i + 1) * 1000, 'startup'));
        expect(selectExpiredSnapshots([periodic, ...milestones])).not.toContain(999_000);
    });

    it('未設定の旧世代は定期の枠で数える', () => {
        const metas = [1, 2, 3, 4, 5].map(t => meta(t * 1000));
        expect(selectExpiredSnapshots(metas).sort()).toEqual([1000, 2000]);
    });

    it('渡した配列の順序に関係なく、新しいものから残す', () => {
        const metas = [meta(2000, 'periodic'), meta(5000, 'periodic'), meta(1000, 'periodic'), meta(4000, 'periodic')];
        expect(selectExpiredSnapshots(metas)).toEqual([1000]);
    });

    it('入力を書き換えない', () => {
        const metas = [meta(1000, 'periodic'), meta(3000, 'periodic'), meta(2000, 'periodic')];
        selectExpiredSnapshots(metas);
        expect(metas.map(m => m.timestamp)).toEqual([1000, 3000, 2000]);
    });

    it('世代が無ければ何も消さない', () => {
        expect(selectExpiredSnapshots([])).toEqual([]);
    });
});

describe('hasStartupSnapshotToday', () => {
    it('同じ暦日の startup があれば真', () => {
        const metas = [meta(at(2026, 9, 11, 8), 'startup')];
        expect(hasStartupSnapshotToday(metas, at(2026, 9, 11, 20))).toBe(true);
    });

    it('前日の startup しか無ければ偽', () => {
        const metas = [meta(at(2026, 9, 10, 23), 'startup')];
        expect(hasStartupSnapshotToday(metas, at(2026, 9, 11, 1))).toBe(false);
    });

    it('同じ日でも startup 以外は数えない', () => {
        const metas = [meta(at(2026, 9, 11, 8), 'gameEnd'), meta(at(2026, 9, 11, 9), 'periodic')];
        expect(hasStartupSnapshotToday(metas, at(2026, 9, 11, 20))).toBe(false);
    });

    it('世代が無ければ偽', () => {
        expect(hasStartupSnapshotToday([], at(2026, 9, 11, 9))).toBe(false);
    });

    // 暦日は現地時刻で切る。UTC で切ると日本では朝9時前が前日になり、
    // 9時開始・8時台受付のミニバスでは日常的に起きる（localDate.ts の既出の理由）
    it('現地時刻の朝8時は、同じ日の朝9時と同じ暦日として扱う', () => {
        const metas = [meta(at(2026, 9, 11, 8, 30), 'startup')];
        expect(hasStartupSnapshotToday(metas, at(2026, 9, 11, 9, 0))).toBe(true);
    });
});

describe('保持数', () => {
    // 数を変えるときはここが落ちる。設計上の判断（定期は最新1件しか使わない／
    // 区切りは週2試合＋週3日起動で約2.4週間分）を明示的に固定する
    it('定期3・区切り12', () => {
        expect(MAX_PERIODIC).toBe(3);
        expect(MAX_MILESTONES).toBe(12);
    });
});
