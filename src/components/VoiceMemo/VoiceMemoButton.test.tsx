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

// 押しっぱなしは pointerdown/up でしか成立しない。<button> に Space/Enter を
// 送ると発火するのは click なので、キーボード・スイッチ操作の利用者はこの機能を
// 一切使えなかった。得点ボタンにはタップで開くセレクターという代替経路があるのに、
// ここはゼロだった。
//
// キーボードのときだけトグル（押して開始・もう一度押して停止）にする。
// ポインタ操作の手触りは変えない。握ったまま忘れても useVoiceMemo の
// MAX_DURATION_MS が60秒で打ち切るので、止め忘れても録りっぱなしにはならない。
//
// キーボード由来の click は detail === 0 で見分ける（ポインタ由来は 1 以上）。
describe('VoiceMemoButton: キーボード操作', () => {
    it('待機中にキーボードで押すと録音を開始する', () => {
        const { onStart } = setup();
        fireEvent.click(screen.getByRole('button'), { detail: 0 });
        expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('録音中にキーボードで押すと録音を止める', () => {
        const { onStop } = setup({ isRecording: true });
        fireEvent.click(screen.getByRole('button'), { detail: 0 });
        expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('待機中のキーボード操作で、止める指示は出さない', () => {
        const { onStop } = setup();
        fireEvent.click(screen.getByRole('button'), { detail: 0 });
        expect(onStop).not.toHaveBeenCalled();
    });

    // ポインタ操作でも click は続けて飛ぶ。ここを拾うと、指を離した直後に
    // トグルがもう一度走って録音が再開してしまう
    it('ポインタ由来のclickでは何も起こさない（押しっぱなしの経路が処理済み）', () => {
        const { onStart, onStop } = setup();
        const button = screen.getByRole('button');
        fireEvent.pointerDown(button);
        fireEvent.pointerUp(button);
        onStart.mockClear();
        onStop.mockClear();

        fireEvent.click(button, { detail: 1 });

        expect(onStart).not.toHaveBeenCalled();
        expect(onStop).not.toHaveBeenCalled();
    });

    it('読み上げ名がキーボードでの使い方も伝える', () => {
        setup();
        expect(screen.getByRole('button').getAttribute('aria-label')).toContain('キーボード');
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
