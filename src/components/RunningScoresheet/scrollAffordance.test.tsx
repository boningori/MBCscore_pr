// スコアシートが横に続いていることを、影で示す。
//
// 本体はA4固定幅(210mm=794px)。実測375pxでは枠343pxに対して43%しか見えず、
// 右半分（ランニングスコア欄・ファウル欄）は横スクロールしないと到達できない。
// ところが白い紙が画面の端まで続いているだけなので、切れていること自体が
// 分からない。端に影を出して「まだ続く」と示す。
//
// 影は枠（scoresheet-scroll-frame）の擬似要素で、スクロールする側
// （scoresheet-scroller）の外側に置く。中に置くと影も内容と一緒に流れる。
// 出力（PDF/JPEG）が写すのは本体（running-scoresheet）だけなので、
// 枠の擬似要素は出力物には入らない。
//
// jsdom はレイアウトを計算しないため、幅は差し替えて位置の判定だけを見る
// （判定そのものの境界は scrollEdges.test.ts）。

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import type { Game } from '../../types/game';
import { createInitialGame, createTeam, createPlayer } from '../../types/game';
import { RunningScoresheet } from './RunningScoresheet';

vi.mock('../../utils/pdfExport', () => ({
    exportElement: vi.fn(),
    generateScoresheetFilename: () => 'sheet',
}));
vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

function makeGame(): Game {
    const game = createInitialGame();
    const teamA = createTeam('teamA', 'ホーム', 'コーチA');
    teamA.players = [createPlayer('a1', 4, '選手A1', true)];
    const teamB = createTeam('teamB', 'ビジター', 'コーチB');
    teamB.players = [createPlayer('b1', 5, '選手B1', true)];
    return { ...game, teamA, teamB };
}

/** jsdom は幅を持たないので、実測（枠343px・本体794px）を差し込む */
function giveWidth(scroller: HTMLElement, scrollLeft: number) {
    Object.defineProperty(scroller, 'clientWidth', { value: 343, configurable: true });
    Object.defineProperty(scroller, 'scrollWidth', { value: 794, configurable: true });
    Object.defineProperty(scroller, 'scrollLeft', { value: scrollLeft, writable: true, configurable: true });
}

const frame = () => document.querySelector('.scoresheet-scroll-frame') as HTMLElement;
const scroller = () => document.querySelector('.scoresheet-scroller') as HTMLElement;

afterEach(cleanup);

describe('スコアシートの横スクロールの目印', () => {
    it('本体はスクロールする枠の中にある', () => {
        render(<RunningScoresheet game={makeGame()} />);

        const sheet = document.querySelector('.running-scoresheet');
        expect(scroller()).toBeTruthy();
        expect(scroller().contains(sheet)).toBe(true);
    });

    // 影を出す枠は、スクロールする要素の外側でなければならない。
    // 中に置くと影も内容と一緒に流れて、端に留まらない
    it('影を出す枠は、スクロールする要素を包んでいる', () => {
        render(<RunningScoresheet game={makeGame()} />);

        expect(frame()).toBeTruthy();
        expect(frame().contains(scroller())).toBe(true);
        expect(scroller().contains(frame())).toBe(false);
    });

    // ツールバーが枠の中に入ると、横スクロールで「閉じる」が流れて戻れなくなる
    it('ツールバーはスクロールする要素の外にある', () => {
        render(<RunningScoresheet game={makeGame()} />);

        const toolbar = document.querySelector('.scoresheet-toolbar');
        expect(toolbar).toBeTruthy();
        expect(scroller().contains(toolbar)).toBe(false);
    });

    it('左端では右にだけ影を出す', () => {
        render(<RunningScoresheet game={makeGame()} />);
        giveWidth(scroller(), 0);
        fireEvent.scroll(scroller());

        expect(frame().dataset.edgeLeft).toBe('false');
        expect(frame().dataset.edgeRight).toBe('true');
    });

    it('途中では両側に影を出す', () => {
        render(<RunningScoresheet game={makeGame()} />);
        giveWidth(scroller(), 200);
        fireEvent.scroll(scroller());

        expect(frame().dataset.edgeLeft).toBe('true');
        expect(frame().dataset.edgeRight).toBe('true');
    });

    // スクロールを待ってから測ると、一度も送らなかった人には目印が出ない。
    // 「切れていることに気づかせる」のが目的なので、開いた時点で出す必要がある
    it('開いた時点で、送る前から右に影を出す', () => {
        const { unmount } = render(<RunningScoresheet game={makeGame()} />);
        unmount();

        // 幅を持たせた状態でマウントし直し、scroll を起こさずに見る
        const restore = HTMLDivElement.prototype;
        Object.defineProperty(restore, 'clientWidth', { value: 343, configurable: true });
        Object.defineProperty(restore, 'scrollWidth', { value: 794, configurable: true });
        try {
            render(<RunningScoresheet game={makeGame()} />);
            expect(frame().dataset.edgeRight).toBe('true');
        } finally {
            delete (restore as unknown as Record<string, unknown>).clientWidth;
            delete (restore as unknown as Record<string, unknown>).scrollWidth;
        }
    });

    // 回転や分割表示で幅が変わると「収まっているか」も変わる。
    // 測り直さないと、横向きで収まったあとも影が出たままになる
    it('画面幅が変わったら測り直す', () => {
        render(<RunningScoresheet game={makeGame()} />);
        giveWidth(scroller(), 0);
        fireEvent.scroll(scroller());
        expect(frame().dataset.edgeRight).toBe('true');

        // 収まる幅になった（本体より広い枠）
        Object.defineProperty(scroller(), 'clientWidth', { value: 900, configurable: true });
        fireEvent(window, new Event('resize'));

        expect(frame().dataset.edgeRight).toBe('false');
    });

    it('右端まで送ると右の影は消える', () => {
        render(<RunningScoresheet game={makeGame()} />);
        giveWidth(scroller(), 794 - 343);
        fireEvent.scroll(scroller());

        expect(frame().dataset.edgeLeft).toBe('true');
        expect(frame().dataset.edgeRight).toBe('false');
    });
});
