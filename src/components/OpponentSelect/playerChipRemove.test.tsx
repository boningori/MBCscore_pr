// 対戦チーム名簿の、選手を1人取り消す「×」。
//
// 実測(375px): 9.3 x 16px。padding も min-width/min-height も無く、字の大きさが
// そのまま当たり判定だった。チップは gap:8px で横に密に並ぶので、隣の選手を
// 消しやすい —— しかも取り消しは確認を挟まない破壊的な操作である。
// このアプリは --touch-target（下限44px / WCAG 2.5.8）を他のボタンすべてに
// 効かせている（index.css）ので、ここだけが例外になっていた。
//
// 読み上げ名も「×」だけで、どの選手を消すボタンなのか分からなかった。
// 画像取り込みで15人まとめて入れたあとに1人だけ外す、というのが主な使い方なので、
// 名前が読めないと目視に頼るしかない。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OpponentSelect } from './OpponentSelect';

vi.mock('../../utils/imageOCR', () => ({
    recognizePlayerList: vi.fn(),
    isOCRAvailable: () => false,
}));
vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

afterEach(cleanup);

/** 未登録チームの入力フォームを開いて、選手を1人だけ足す */
function openEditorWithPlayer(number: string, name: string) {
    render(<OpponentSelect onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /未登録チームと対戦/ }));

    fireEvent.change(screen.getByPlaceholderText('No.'), { target: { value: number } });
    fireEvent.change(screen.getByPlaceholderText('名前 (任意)'), { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));
}

describe('対戦チーム名簿の選手取り消しボタン', () => {
    it('どの選手を取り消すのかが読み上げ名から分かる', () => {
        openEditorWithPlayer('7', '高橋 湊');

        expect(screen.getByRole('button', { name: /#7 高橋 湊 を削除/ })).toBeTruthy();
    });

    // 名前を空のまま追加すると「選手7」が自動で入る（handleAddPlayer）。
    // 読み上げ名もその表示どおりにして、チップの見た目と食い違わせない
    it('名前を入れていない選手でも、背番号から始まる名前で見分けられる', () => {
        openEditorWithPlayer('7', '');

        expect(screen.getByRole('button', { name: /^#7 .+ を削除$/ })).toBeTruthy();
    });
});

// jsdomはレイアウトを計算しないのでCSSの記述を直接見る
// （src/components/ActionButtons/foulGroupWidth.test.ts と同じ方針）
const css = readFileSync(
    resolve(process.cwd(), 'src/components/OpponentSelect/OpponentSelect.css'),
    'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function ruleBody(selector: string): string {
    const index = css.indexOf(selector);
    if (index === -1) return '';
    const start = css.indexOf('{', index);
    const end = css.indexOf('}', start);
    return css.slice(start + 1, end);
}

describe('選手取り消しボタンの当たり判定', () => {
    it('アプリ共通のタップ領域（--touch-target）を下回らない', () => {
        const body = ruleBody(':is(.opponent-select, .opponent-editor) .remove-btn');

        expect(/min-width:\s*var\(--touch-target\)\s*;/.test(body)).toBe(true);
        expect(/min-height:\s*var\(--touch-target\)\s*;/.test(body)).toBe(true);
    });
});
