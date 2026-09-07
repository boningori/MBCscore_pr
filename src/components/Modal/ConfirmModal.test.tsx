// ConfirmModal の実行ボタンは取り返しのつかない削除のために btn-danger（赤）で
// 固定されていた。破壊的でない確認（名簿への登録など）を赤で出すと危険な操作に
// 見えるため、見た目だけ選べるようにする。既定は danger のまま——既存の
// 呼び出し側の見た目を変えないことがこのテストの主目的。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ConfirmModal } from './ConfirmModal';

afterEach(cleanup);

const renderModal = (props: Partial<Parameters<typeof ConfirmModal>[0]> = {}) =>
    render(
        <ConfirmModal
            title="確認"
            message="よろしいですか"
            confirmLabel="実行する"
            onConfirm={vi.fn()}
            onCancel={vi.fn()}
            {...props}
        />,
    );

describe('ConfirmModal 実行ボタンの見た目', () => {
    it('既定では btn-danger（既存の呼び出し側が変わらない）', () => {
        renderModal();
        const btn = screen.getByRole('button', { name: '実行する' });
        expect(btn.classList.contains('btn-danger')).toBe(true);
        expect(btn.classList.contains('btn-primary')).toBe(false);
    });

    it('confirmVariant="primary" で btn-primary になる', () => {
        renderModal({ confirmVariant: 'primary' });
        const btn = screen.getByRole('button', { name: '実行する' });
        expect(btn.classList.contains('btn-primary')).toBe(true);
        expect(btn.classList.contains('btn-danger')).toBe(false);
    });

    it('打ち消し側は見た目を変えない', () => {
        renderModal({ confirmVariant: 'primary' });
        const btn = screen.getByRole('button', { name: 'キャンセル' });
        expect(btn.classList.contains('btn-secondary')).toBe(true);
    });
});
