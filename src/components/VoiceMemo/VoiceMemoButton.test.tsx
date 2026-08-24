import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { VoiceMemoButton } from './VoiceMemoButton';

afterEach(cleanup);

const setup = (overrides: Partial<Parameters<typeof VoiceMemoButton>[0]> = {}) => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    render(
        <VoiceMemoButton
            isRecording={false}
            isOffline={false}
            onStart={onStart}
            onStop={onStop}
            {...overrides}
        />,
    );
    return { onStart, onStop };
};

describe('VoiceMemoButton: 押している間だけ録音', () => {
    it('押し下げで録音を開始する', () => {
        const { onStart } = setup();
        fireEvent.pointerDown(screen.getByRole('button'));
        expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('離すと録音を止める', () => {
        const { onStop } = setup({ isRecording: true });
        fireEvent.pointerUp(screen.getByRole('button'));
        expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('指がボタンの外へ滑っても止める（押しっぱなしのまま取り残されない）', () => {
        const { onStop } = setup({ isRecording: true });
        fireEvent.pointerLeave(screen.getByRole('button'));
        expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('着信などでポインタが奪われても止める', () => {
        const { onStop } = setup({ isRecording: true });
        fireEvent.pointerCancel(screen.getByRole('button'));
        expect(onStop).toHaveBeenCalledTimes(1);
    });

    // マイク許可ダイアログの表示中（getUserMediaが未解決）は isRecording がまだ
    // false のまま。押した指を離したのに isRecording だけを見ていると release が
    // すり抜け、許可が下りた後に誰も止めない録音が始まってしまう
    it('押した直後（isRecordingがまだfalseの間）に離しても、録音を止める指示を出す', () => {
        const { onStop } = setup({ isRecording: false });
        fireEvent.pointerDown(screen.getByRole('button'));
        fireEvent.pointerUp(screen.getByRole('button'));
        expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('押していないのにポインタが外れても（通常のマウスアウト）、何もしない', () => {
        const { onStop } = setup({ isRecording: false });
        fireEvent.pointerLeave(screen.getByRole('button'));
        expect(onStop).not.toHaveBeenCalled();
    });
});

// jest-dom は導入していないため、属性・disabled は素のプロパティで確かめる
describe('VoiceMemoButton: 状態表示', () => {
    it('録音中はaria-pressedがtrueになる', () => {
        setup({ isRecording: true });
        expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
    });

    it('待機中はaria-pressedがfalseになる', () => {
        setup();
        expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('false');
    });

    it('オフラインでは無効になり、理由が読める', () => {
        setup({ isOffline: true });
        const button = screen.getByRole('button') as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        expect(button.getAttribute('aria-label')).toContain('オンライン');
    });

    it('オフラインでは押しても録音を開始しない', () => {
        const { onStart } = setup({ isOffline: true });
        fireEvent.pointerDown(screen.getByRole('button'));
        expect(onStart).not.toHaveBeenCalled();
    });

    it('録音中にオフラインへ転じても、ボタンはdisabledにならない（離すイベントを受け取り続けるため）', () => {
        // disabled属性が付くとブラウザはpointerup/pointerleave/pointerCancelを
        // そのボタンへ配送しなくなり、指を離しても録音が止められなくなる
        // （MAX_DURATION_MSの60秒まで居座り続けてしまう）
        setup({ isRecording: true, isOffline: true });
        const button = screen.getByRole('button') as HTMLButtonElement;
        expect(button.disabled).toBe(false);
    });

    it('録音中にオフラインへ転じても、離せば録音を止められる', () => {
        const { onStop } = setup({ isRecording: true, isOffline: true });
        fireEvent.pointerUp(screen.getByRole('button'));
        expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('録音中にオフラインへ転じても、ラベルは「録音中」を伝える（オフライン文言に差し替わらない）', () => {
        setup({ isRecording: true, isOffline: true });
        const button = screen.getByRole('button') as HTMLButtonElement;
        expect(button.getAttribute('aria-label')).toContain('録音中');
    });

    it('待機中でオフラインなら引き続きdisabledで、支援技術には利用不可と伝わる', () => {
        setup({ isRecording: false, isOffline: true });
        const button = screen.getByRole('button') as HTMLButtonElement;
        expect(button.disabled).toBe(true);
    });
});
