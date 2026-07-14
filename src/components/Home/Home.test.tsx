import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Home } from './Home';

afterEach(cleanup);

function renderHome() {
    render(
        <Home
            onStartGame={vi.fn()}
            onManageTeams={vi.fn()}
            onViewHistory={vi.fn()}
            onManageOpponents={vi.fn()}
            onViewPlayerStats={vi.fn()}
            onOpenSettings={vi.fn()}
            isFullScreen={false}
            onToggleFullScreen={vi.fn()}
        />,
    );
}

describe('Home: フッターのバージョン表示', () => {
    it('フッターにバージョン番号が表示される（PWA更新の確認・不具合報告用）', () => {
        renderHome();
        // __APP_VERSION__ はビルド時定義（テスト環境では 'dev' などになる）
        expect(screen.getByText(/^v.+ \| タブレット最適化 \| オフライン動作$/)).toBeTruthy();
    });
});
