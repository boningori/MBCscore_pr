// 写真読込の結果の通知が、成功したときにも画面に出ること。
//
// 読み取りに成功すると setIsCreating(true) で OpponentEditor を返して
// 早期リターンするため、その手前にある ocrError の描画に辿り着かなかった。
// 「15人まで」で溢れた分も「背番号が読めなかった」分も、セットはされるのに
// 誰にも見えない状態だった。失敗したときだけ見えるので気づきにくい。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { OpponentSelect } from './OpponentSelect';
import { recognizePlayerList } from '../../utils/imageOCR';
import { MAX_PLAYERS_PER_TEAM } from '../TeamShared/playerLimit';
import type { SavedPlayer } from '../../utils/teamStorage';

vi.mock('../../utils/imageOCR', () => ({
    recognizePlayerList: vi.fn(),
    isOCRAvailable: () => true,
}));
vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

const mockRecognize = vi.mocked(recognizePlayerList);

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
});

function players(count: number): SavedPlayer[] {
    return Array.from({ length: count }, (_, i) => ({
        number: i + 1,
        name: `選手${i + 1}`,
        isCaptain: false,
    }));
}

/** 写真を1枚読み込ませる。input は隠してあるので直接 change を起こす */
function importPhoto(container: HTMLElement) {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
        target: { files: [new File([new Uint8Array(10)], 'roster.jpg', { type: 'image/jpeg' })] },
    });
}

describe('読み取りに成功したとき', () => {
    it('上限で入り切らなかった人数が画面に出る', async () => {
        mockRecognize.mockResolvedValue({
            success: true,
            players: players(MAX_PLAYERS_PER_TEAM + 3),
            usedEngine: 'Gemini',
        });

        const { container } = render(<OpponentSelect onSelect={vi.fn()} />);
        importPhoto(container);

        expect(await screen.findByText(/3人は取り込みませんでした/)).toBeTruthy();
    });

    it('背番号を読み取れなかった人数が画面に出る', async () => {
        mockRecognize.mockResolvedValue({
            success: true,
            players: players(5),
            usedEngine: 'Gemini',
            invalidNumberCount: 2,
        });

        const { container } = render(<OpponentSelect onSelect={vi.fn()} />);
        importPhoto(container);

        expect(await screen.findByText(/2人は背番号を読み取れなかった/)).toBeTruthy();
    });

    it('通知が無いときは何も出さない', async () => {
        mockRecognize.mockResolvedValue({
            success: true,
            players: players(5),
            usedEngine: 'Gemini',
        });

        const { container } = render(<OpponentSelect onSelect={vi.fn()} />);
        importPhoto(container);

        // 編集画面へ進んだことを確かめてから、通知が無いことを見る。
        // 選手はチップで出るので、取り消しボタンの読み上げ名で待つ
        expect(await screen.findByRole('button', { name: /#1 選手1 を削除/ })).toBeTruthy();
        expect(screen.queryByText(/取り込みませんでした/)).toBeNull();
        expect(screen.queryByText(/読み取れなかった/)).toBeNull();
    });
});

describe('読み取りに失敗したとき', () => {
    it('従来どおり一覧の画面に理由が出る（回帰）', async () => {
        mockRecognize.mockResolvedValue({
            success: false,
            players: [],
            error: '選手情報を認識できませんでした',
            usedEngine: 'Tesseract',
        });

        const { container } = render(<OpponentSelect onSelect={vi.fn()} />);
        importPhoto(container);

        expect(await screen.findByText(/選手情報を認識できませんでした/)).toBeTruthy();
    });
});
