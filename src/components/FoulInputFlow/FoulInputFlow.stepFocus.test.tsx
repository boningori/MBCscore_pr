// ステップが切り替わったときのフォーカス。
//
// このダイアログは段ごとにブロックを丸ごと入れ替えるため、押したボタンは
// その場でアンマウントされ、フォーカスが body へ落ちる。
// Modal の Escape とフォーカストラップはオーバーレイの onKeyDown なので、
// モーダルの外へ落ちるとEscapeが効かず、Tabが暗幕の下の画面へ抜ける。
// closeOnOverlayClick={false} で背後を触らせない作りにしている意味が無くなる。
//
// 中断ブロックの行入れ替えで同じことを直したので（interrupt.test.tsx）、
// 同じ考え方をステップの切り替えにも通す。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FoulInputFlow } from './FoulInputFlow';
import { createPlayer } from '../../types/game';

afterEach(cleanup);

const OPPONENTS = [
    { ...createPlayer('b1', 10, '相手1'), isOnCourt: true },
    { ...createPlayer('b2', 11, '相手2'), isOnCourt: true },
];

function renderFlow(overrides: Partial<Parameters<typeof FoulInputFlow>[0]> = {}) {
    const onCancel = vi.fn();
    const onComplete = vi.fn();
    render(
        <FoulInputFlow
            hasSelectedPlayer
            playerName="佐藤 花子"
            playerNumber={5}
            // 4個目まで済み＝このファウルからペナルティ。Pの通常タップで
            // 直接シューター選択へ入るので、テストの導線が短くなる
            teamFouls={4}
            opponentTeamId="teamB"
            opponentTeamName="相手"
            opponentPlayers={OPPONENTS}
            onComplete={onComplete}
            onCancel={onCancel}
            {...overrides}
        />,
    );
    return { onCancel, onComplete };
}

/** Pファウルを通常タップ（キーボード経路）。ペナルティ中なのでシューター選択へ */
function tapPFoul() {
    fireEvent.keyDown(screen.getByText('パーソナルファウル').closest('button')!, { key: 'Enter' });
}

function clickText(text: string) {
    fireEvent.click(screen.getByText(text).closest('button')!);
}

/** フォーカスがダイアログ内に残っていること */
function expectFocusInsideDialog() {
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).not.toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);
}

/**
 * いまフォーカスのある要素へキーを送る。
 *
 * ダイアログ要素へ直接送ると、フォーカスが外へ落ちていても Modal の
 * onKeyDown まで届いてしまい、この不具合を素通りさせる。
 * 実際にキーを受けるのはフォーカス要素なので、そこから送る
 */
function pressKeyOnFocused(key: string) {
    fireEvent.keyDown(document.activeElement ?? document.body, { key });
}

describe('ステップ切り替え後のフォーカス', () => {
    it('ファウル種類 → シューター選択で残る', () => {
        renderFlow();
        tapPFoul();
        expect(screen.getByText('シューターを選択')).toBeTruthy();
        expectFocusInsideDialog();
    });

    it('ファウル種類 → FT本数選択（T）で残る', () => {
        renderFlow();
        clickText('テクニカルファウル');
        expect(screen.getByText('フリースロー本数を選択')).toBeTruthy();
        expectFocusInsideDialog();
    });

    it('ファウル種類 → シュート状況（Pの長押し相当）で残る', () => {
        renderFlow();
        fireEvent.keyDown(screen.getByText('パーソナルファウル').closest('button')!, { key: 'Enter', shiftKey: true });
        expect(screen.getByText('シュート状況を選択（シュートファウル）')).toBeTruthy();
        expectFocusInsideDialog();
    });

    it('シューター選択 → FT結果入力（次へ）で残る', () => {
        renderFlow();
        tapPFoul();
        clickText('相手1');
        clickText('次へ');
        expect(screen.getByText('フリースロー結果を入力')).toBeTruthy();
        expectFocusInsideDialog();
    });

    it('FT結果入力 →（← 戻る）シューター選択で残る', () => {
        renderFlow();
        tapPFoul();
        clickText('相手1');
        clickText('次へ');
        clickText('← 戻る');
        expect(screen.getByText('シューターを選択')).toBeTruthy();
        expectFocusInsideDialog();
    });

    it('シューター選択 →（← 戻る）ファウル種類で残る', () => {
        renderFlow();
        tapPFoul();
        clickText('← 戻る');
        expect(screen.getByText('ファウル種類を選択')).toBeTruthy();
        expectFocusInsideDialog();
    });

    it('FT本数選択 →（← 戻る）ファウル種類で残る', () => {
        renderFlow();
        clickText('テクニカルファウル');
        clickText('← 戻る');
        expect(screen.getByText('ファウル種類を選択')).toBeTruthy();
        expectFocusInsideDialog();
    });

    // コート上に候補が居ないと、シューター選択のブロックは空のリストと
    // 押せない「次へ」だけになる。移す先が無いからと諦めると body へ落ちる
    it('移す先のボタンが無いステップでも、ダイアログの外へは落ちない', () => {
        renderFlow({ opponentPlayers: [] });
        clickText('テクニカルファウル');
        clickText('1本');

        expect(screen.getByText('シューターを選択')).toBeTruthy();
        expectFocusInsideDialog();
    });

    // 初回表示は Modal 自身がフォーカスを当てる。ここで横取りすると
    // data-autofocus の指定（打ち消し側を既定にする作法）が効かなくなる
    it('開いた直後は Modal のフォーカスをそのまま使う', () => {
        renderFlow();
        expect(document.activeElement).toBe(screen.getByText('パーソナルファウル').closest('button'));
    });
});

// フォーカスがダイアログの外へ落ちていると、Modal のオーバーレイに付いた
// onKeyDown までイベントが届かない。ステップを切り替えた直後こそ
// 「間違えた、戻りたい」場面なので、そこで効かないのがいちばん困る
describe('ステップ切り替え後のEscape', () => {
    it('切り替えた直後のEscapeが1ステップ戻す', () => {
        const { onCancel } = renderFlow();
        clickText('テクニカルファウル');

        pressKeyOnFocused('Escape');

        expect(screen.getByText('ファウル種類を選択')).toBeTruthy();
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('最初のステップまで戻った後のEscapeは取り消しになる', () => {
        const { onCancel } = renderFlow();
        clickText('テクニカルファウル');
        clickText('← 戻る');

        pressKeyOnFocused('Escape');

        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('FT結果入力まで進んだ後のEscapeがシューター選択へ戻す', () => {
        const { onCancel } = renderFlow();
        tapPFoul();
        clickText('相手1');
        clickText('次へ');

        pressKeyOnFocused('Escape');

        expect(screen.getByText('シューターを選択')).toBeTruthy();
        expect(onCancel).not.toHaveBeenCalled();
    });
});
