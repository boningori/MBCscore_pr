// 更新の案内を出してよい場面かどうか。
//
// 更新はリロードを伴う。判定を phase だけで見ていたため、試合設定ウィザードの
// 途中（phase は 'setup' のまま）でバナーが出ていた。押すと入力が消える。
// かといって phase === 'setup' を一律で抑えると、ホーム画面の phase も 'setup'
// なので更新の案内が永久に出せなくなる。画面と phase の両方で決める。

import { describe, it, expect } from 'vitest';
import { suppressesAppUpdate } from './updateSuppression';

describe('suppressesAppUpdate', () => {
    it('記録中の画面では出さない（リロードで手が止まる）', () => {
        expect(suppressesAppUpdate('game', 'playing')).toBe(true);
        expect(suppressesAppUpdate('quarterLineup', 'quarterEnd')).toBe(true);
        expect(suppressesAppUpdate('scoresheet', 'playing')).toBe(true);
    });

    it('試合設定ウィザードでは出さない（入力が消える）', () => {
        expect(suppressesAppUpdate('gameSetup', 'setup')).toBe(true);
    });

    it('試合が進行中なら、ホームへ中断していても出さない', () => {
        expect(suppressesAppUpdate('home', 'playing')).toBe(true);
        expect(suppressesAppUpdate('home', 'paused')).toBe(true);
        expect(suppressesAppUpdate('home', 'quarterEnd')).toBe(true);
    });

    // チーム管理も未保存の入力を持つ画面で、失うものは設定ウィザードと変わらない。
    // 名簿を打ち込んでいる途中でリロードすると、選手の番号・氏名・JBA番号が
    // まとめて消える（保存は「保存」ボタンを押すまで走らない）。
    // 戻る操作については MyTeamManager / OpponentManager 側で既に確認を挟んで
    // いるのに、更新バーからだけ確認なしで消せる状態になっていた。
    it('チーム編集の画面では出さない（未保存の名簿が消える）', () => {
        expect(suppressesAppUpdate('myTeamManager', 'setup')).toBe(true);
        expect(suppressesAppUpdate('opponentManager', 'setup')).toBe(true);
    });

    it('ホームや閲覧系の画面では出す（ここで更新してもらう）', () => {
        expect(suppressesAppUpdate('home', 'setup')).toBe(false);
        expect(suppressesAppUpdate('home', 'finished')).toBe(false);
        expect(suppressesAppUpdate('history', 'setup')).toBe(false);
        expect(suppressesAppUpdate('playerStats', 'setup')).toBe(false);
    });
});
