// 取り込みは version の存在しか見ていなかった。
//
// 今日の実害はゼロである。直す理由は「次に形式を変えたとき、既に配られている
// アプリが新しいファイルを拒めるようにしておく」一点。あとから足しても、その
// 時点で世に出ている版には効かない。registerType: 'prompt' なので、更新を
// 断り続けた古いアプリは長く残る。
//
// 1.x と 2.x はいままでどおり読む。e590901 が 1.x を作り、e6b064c が
// フィールドを足して 2.0 にした——追加だけの変更だったので古いファイルも
// 読める。その互換性は壊さない。

import { describe, it, expect } from 'vitest';
import { parseImportJSON } from './dataBackup';

/** version だけを差し替えた最小のバックアップ */
function backupWith(version: unknown): string {
    return JSON.stringify({
        version,
        exportDate: new Date().toISOString(),
        appName: 'MBCscore',
        data: { myTeams: [{ id: 't1', name: 'テストミニバス', players: [] }] },
    });
}

describe('バックアップの version', () => {
    it('1.0 は受け付ける（古い形式の互換を壊さない）', () => {
        expect(parseImportJSON(backupWith('1.0')).type).not.toBe('unknown');
    });

    it('2.0 と 2.5 は受け付ける', () => {
        expect(parseImportJSON(backupWith('2.0')).type).not.toBe('unknown');
        expect(parseImportJSON(backupWith('2.5')).type).not.toBe('unknown');
    });

    it('3.0 は断り、ファイルの版を案内に入れる', () => {
        const parsed = parseImportJSON(backupWith('3.0'));
        expect(parsed.type).toBe('unknown');
        expect(parsed.summary).toContain('3.0');
        expect(parsed.summary).toMatch(/更新/);
    });

    it('10.0 も断る（文字列ではなく数として見る）', () => {
        expect(parseImportJSON(backupWith('10.0')).type).toBe('unknown');
    });

    it('version が無ければ、いままでどおり「エクスポートデータではない」', () => {
        const parsed = parseImportJSON(backupWith(undefined));
        expect(parsed.type).toBe('unknown');
        expect(parsed.summary).toMatch(/バージョン情報が見つかりません/);
    });

    it('読めない版は、いままでどおり受け付ける（断る条件をはっきりしたものに絞る）', () => {
        expect(parseImportJSON(backupWith('abc')).type).not.toBe('unknown');
    });
});
