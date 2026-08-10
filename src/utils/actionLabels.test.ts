import { describe, it, expect } from 'vitest';
import { statLabel, actionLabel } from './actionLabels';

describe('statLabel', () => {
    it('スタッツの内部コードを日本語にする', () => {
        expect(statLabel('OREB')).toBe('オフェンスリバウンド');
        expect(statLabel('AST')).toBe('アシスト');
        expect(statLabel('2PA')).toBe('2Pミス');
    });

    // スワイプで入れるターンオーバーの細目。辞書に無いと画面に「TO:DD」と出る
    it('ターンオーバーの細目も日本語にする', () => {
        expect(statLabel('TO')).toBe('ターンオーバー');
        expect(statLabel('TO:DD')).toBe('ターンオーバー(ダブドリ)');
        expect(statLabel('TO:TR')).toBe('ターンオーバー(トラベリング)');
        expect(statLabel('TO:PM')).toBe('ターンオーバー(パスミス)');
        expect(statLabel('TO:CM')).toBe('ターンオーバー(キャッチミス)');
    });

    // 知らない値でも空欄にはしない。内部コードでも出たほうが手掛かりになる
    it('知らない値はそのまま返す', () => {
        expect(statLabel('XYZ')).toBe('XYZ');
    });
});

describe('actionLabel', () => {
    it('得点・スタッツ・ファウルを1つの入口で日本語にする', () => {
        expect(actionLabel('SCORE', '2P')).toBe('2P成功');
        expect(actionLabel('STAT', 'TO:DD')).toBe('ターンオーバー(ダブドリ)');
        expect(actionLabel('MISS', '3PA')).toBe('3Pミス');
        expect(actionLabel('FOUL', 'P')).toBe('パーソナルファウル');
    });

    // ファウルは種類が決まる前に保留化されることがある（App の pendingAction は value を持たない）
    it('種類が決まっていないファウルは「ファウル」', () => {
        expect(actionLabel('FOUL', '')).toBe('ファウル');
    });
});
