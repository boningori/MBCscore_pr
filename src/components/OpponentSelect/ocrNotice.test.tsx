// 写真読込の結果の通知が、成功したときにも画面に出ること。
//
// 読み取りに成功すると setIsCreating(true) で OpponentEditor を返して
// 早期リターンするため、その手前にある ocrError の描画に辿り着かなかった。
// 「15人まで」で溢れた分も「背番号が読めなかった」分も、セットはされるのに
// 誰にも見えない状態だった。失敗したときだけ見えるので気づきにくい。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { OpponentSelect } from './OpponentSelect';
import { recognizePlayerList } from '../../utils/imageOCR';
import type { ImageOCRResult } from '../../utils/imageOCR';
import { MAX_PLAYERS_PER_TEAM } from '../TeamShared/playerLimit';
import type { SavedPlayer } from '../../utils/teamStorage';
import { setAiOcrDiagnosticsEnabled } from '../../utils/appSettings';

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

describe('編集画面を開き直したとき', () => {
    it('写真を読み込んだあと編集画面を閉じ、新しい編集画面を開くと前回の通知が残っていない', async () => {
        mockRecognize.mockResolvedValue({
            success: true,
            players: players(MAX_PLAYERS_PER_TEAM + 3),
            usedEngine: 'Gemini',
        });

        const { container } = render(<OpponentSelect onSelect={vi.fn()} />);
        importPhoto(container);

        // 上限超過の通知が編集画面に出ていることを確認してから閉じる
        expect(await screen.findByText(/3人は取り込みませんでした/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /キャンセル/ }));

        // 別チームを手入力するために、空の編集画面を開き直す
        fireEvent.click(screen.getByRole('button', { name: /\+ 未登録チームと対戦/ }));

        expect(screen.queryByText(/取り込みませんでした/)).toBeNull();
    });

    it('同じ操作で、前回の読み取り結果のパネルも残っていない（他チームの選手名を漏らさない）', async () => {
        setAiOcrDiagnosticsEnabled(true);
        mockRecognize.mockResolvedValue({
            success: true,
            players: players(5),
            usedEngine: 'Gemini',
            diagnostics: {
                geminiModel: 'gemini-test-model',
                geminiRawText: '{"players":[{"number":1,"name":"山田太郎"}]}',
            },
        });

        const { container } = render(<OpponentSelect onSelect={vi.fn()} />);
        importPhoto(container);

        // パネルが今回の読み取り結果を持っていることを確かめてから閉じる
        const toggle = await screen.findByRole('button', { name: /読み取り結果の詳細/ });
        fireEvent.click(toggle);
        expect(await screen.findByText(/山田太郎/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /キャンセル/ }));

        // 別チームを手入力するために、空の編集画面を開き直す
        fireEvent.click(screen.getByRole('button', { name: /\+ 未登録チームと対戦/ }));

        // 設定はONのままなので、パネル自体が出ないなら診断情報が消えている証拠。
        // 万一パネルだけ残っていても、前チームの選手名は絶対に見えてはいけない
        expect(screen.queryByRole('button', { name: /読み取り結果の詳細/ })).toBeNull();
        expect(screen.queryByText(/山田太郎/)).toBeNull();
    });

    it('同じ編集画面でもう一枚読み込ませると、結果が返る前に前回のパネルの中身が消える', async () => {
        setAiOcrDiagnosticsEnabled(true);
        let resolveSecond: (value: ImageOCRResult) => void = () => { };
        mockRecognize
            .mockResolvedValueOnce({
                success: true,
                players: players(5),
                usedEngine: 'Gemini',
                diagnostics: {
                    geminiModel: 'gemini-test-model',
                    geminiRawText: '{"players":[{"number":1,"name":"山田太郎"}]}',
                },
            })
            .mockImplementationOnce(() => new Promise<ImageOCRResult>((resolve) => { resolveSecond = resolve; }));

        const { container } = render(<OpponentSelect onSelect={vi.fn()} />);
        importPhoto(container);

        const toggle = await screen.findByRole('button', { name: /読み取り結果の詳細/ });
        fireEvent.click(toggle);
        expect(await screen.findByText(/山田太郎/)).toBeTruthy();

        // 差し替えのつもりで同じ編集画面からもう一枚読み込ませる。結果はまだ返っていない
        importPhoto(container);

        // 読み込み中は「今回の読み取り」を語る約束（OpponentSelect.tsx 44行目）が
        // あるので、前チームの通知と同じく前回分は即座に消えていないといけない
        expect(screen.queryByText(/山田太郎/)).toBeNull();

        resolveSecond({ success: true, players: players(5), usedEngine: 'Gemini' });
        await waitFor(() => expect(mockRecognize).toHaveBeenCalledTimes(2));
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
