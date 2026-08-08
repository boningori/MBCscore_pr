import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { GameSetup } from './GameSetup';

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('GameSetup 日付の既定値', () => {
    // 受付・設定は試合開始(9時)より前に済ませる。UTC由来で組み立てると
    // この時間帯の既定値が前日になり、記録者が気づかないまま1日ずれる
    it('現地の朝8時半に開いても、その日の日付が入っている', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 7, 8, 8, 30));

        render(<GameSetup onComplete={() => { }} onBack={() => { }} />);

        const input = screen.getByLabelText('日付') as HTMLInputElement;
        expect(input.value).toBe('2026-08-08');
    });
});
