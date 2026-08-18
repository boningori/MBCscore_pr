// 端末の戻る操作（Androidの戻るボタン／エッジスワイプ）が、画面ごと飛ばずに
// サブビュー・ポップアップを1段だけ閉じること。
//
// useScreenHistorySync は popstate を画面遷移として処理するので、modalStack に
// 載っていないサブビューを開いていると、閉じるどころか画面ごとホームへ飛ぶ。
// 実測: 対戦チームの登録フォームに入力した状態で戻るとホームへ飛び、入力が
// 確認もなく消えていた。試合設定ウィザードも同様で、確認ステップまで入れた
// 内容が全部消えた。記録中のTO/REB/得点セレクターでは記録画面から追い出された。
//
// どれも画面上には「1段だけ戻る」ボタンがあり、ハードとソフトで挙動が
// 食い違っていた。ここでは modalStack に載っているか（＝戻るを受け取れるか）を
// 固定する。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { hasOpenModal } from '../components/Modal/modalStack';
import { OpponentManager } from '../components/OpponentManager';
import { MyTeamManager } from '../components/MyTeamManager';
import { GameSetup } from '../components/GameSetup';
import { OpponentSelect } from '../components/OpponentSelect';
import { SwipeableTurnoverButton } from '../components/ActionButtons/SwipeableTurnoverButton';
import { SwipeableScoreButton } from '../components/ActionButtons/SwipeableScoreButton';

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    cleanup();
    // レジストリが漏れているとテスト間で干渉する
    expect(hasOpenModal()).toBe(false);
});

describe('戻る操作とサブビュー', () => {
    it('対戦チーム管理: 登録フォームを開くと戻るを受け取る', () => {
        render(<OpponentManager onBack={vi.fn()} />);
        expect(hasOpenModal()).toBe(false);

        fireEvent.click(screen.getByRole('button', { name: '+ 新規チーム登録' }));
        expect(screen.getByText('対戦チーム新規登録')).toBeTruthy();
        expect(hasOpenModal()).toBe(true);
    });

    it('マイチーム管理: 編集フォームを開くと戻るを受け取る（従来どおり）', () => {
        render(<MyTeamManager onBack={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: '+ 新規チーム作成' }));
        expect(hasOpenModal()).toBe(true);
    });

    it('試合設定: 2ステップ目以降は戻るを受け取り、1段だけ戻る', () => {
        render(<GameSetup onComplete={vi.fn()} onBack={vi.fn()} />);
        expect(hasOpenModal()).toBe(false);

        fireEvent.click(screen.getByRole('button', { name: /次へ/ }));
        expect(hasOpenModal()).toBe(true);
    });

    it('試合設定: 最初のステップに戻ると、以降の戻るは画面遷移に委ねる', () => {
        render(<GameSetup onComplete={vi.fn()} onBack={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /次へ/ }));
        fireEvent.click(screen.getByRole('button', { name: '← 戻る' }));
        expect(hasOpenModal()).toBe(false);
    });

    it('TO種類セレクター: ダイアログとして戻るを受け取る', () => {
        render(<SwipeableTurnoverButton onTurnover={vi.fn()} />);
        fireEvent.click(screen.getByLabelText('ターンオーバー'));

        expect(screen.getByRole('dialog', { name: 'TO種類を選択' })).toBeTruthy();
        expect(hasOpenModal()).toBe(true);
    });

    it('対戦チーム選択: 未登録チームの入力フォームは戻るを受け取る', () => {
        render(<OpponentSelect onSelect={vi.fn()} />);
        expect(hasOpenModal()).toBe(false);

        fireEvent.click(screen.getByRole('button', { name: '+ 未登録チームと対戦' }));
        expect(hasOpenModal()).toBe(true);
    });

    it('得点セレクター: 戻るを受け取る', () => {
        render(<SwipeableScoreButton scoreType="2P" onScore={vi.fn()} onMiss={vi.fn()} />);
        fireEvent.click(screen.getByRole('button'));
        expect(hasOpenModal()).toBe(true);
    });
});
