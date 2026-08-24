import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { TeamComparison } from './TeamComparison';
import { createPlayer, createTeam } from '../../types/game';

const exportElement = vi.fn().mockResolvedValue(undefined);
vi.mock('../../utils/pdfExport', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../utils/pdfExport')>()),
    exportElement: (...args: unknown[]) => exportElement(...args),
}));

afterEach(() => { cleanup(); exportElement.mockClear(); });

function renderExportable(exportable = true, exportName = '県大会') {
    const teamA = createTeam('teamA', '白チーム', '');
    teamA.players = [createPlayer('a1', 4, '一郎')];
    const teamB = createTeam('teamB', '青チーム', '');
    teamB.color = 'blue';
    teamB.players = [createPlayer('b1', 7, '三郎')];

    return render(
        <TeamComparison
            teamA={teamA} teamB={teamB}
            scoreHistory={[]} statHistory={[]} foulHistory={[]}
            showThreePoint
            caption=""
            exportable={exportable}
            exportName={exportName}
        />,
    );
}

describe('比較画面の出力', () => {
    it('exportable が false ならボタンを出さない', () => {
        renderExportable(false);

        expect(screen.queryByRole('button', { name: /JPEG/ })).toBeNull();
    });

    it('JPEGボタンで出力を呼ぶ', async () => {
        renderExportable();

        fireEvent.click(screen.getByRole('button', { name: /JPEG/ }));

        await waitFor(() => expect(exportElement).toHaveBeenCalledTimes(1));
        expect(exportElement.mock.calls[0][1].format).toBe('jpeg');
    });

    it('PDFボタンで出力を呼ぶ', async () => {
        renderExportable();

        fireEvent.click(screen.getByRole('button', { name: /PDF/ }));

        await waitFor(() => expect(exportElement).toHaveBeenCalledTimes(1));
        expect(exportElement.mock.calls[0][1].format).toBe('pdf');
    });

    it('出力対象は比較画面のルート要素', async () => {
        renderExportable();

        fireEvent.click(screen.getByRole('button', { name: /JPEG/ }));

        await waitFor(() => expect(exportElement).toHaveBeenCalled());
        expect((exportElement.mock.calls[0][0] as HTMLElement).classList.contains('team-comparison')).toBe(true);
    });

    it('出力ボタン自体は画像に含めない', () => {
        renderExportable();

        expect(document.querySelector('.comparison-export')?.classList.contains('no-export')).toBe(true);
    });

    it('exportName（試合名）にファイル名で使えない文字が入っていても除かれる', async () => {
        // 次のタスクで exportName には試合名（利用者の自由入力）が渡る。
        // '/' がそのまま結合されるとパス区切りとして壊れるため、
        // sanitizeFilename を通ったファイル名になっていることを確認する
        renderExportable(true, '6/5 練習試合');

        fireEvent.click(screen.getByRole('button', { name: /JPEG/ }));

        await waitFor(() => expect(exportElement).toHaveBeenCalled());
        const filename = exportElement.mock.calls[0][1].filename as string;
        expect(filename).not.toContain('/');
        expect(filename).not.toContain('\\');
        expect(filename).toBe('6_5 練習試合_チーム比較');
    });
});
