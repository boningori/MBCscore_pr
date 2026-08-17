import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useBackHandler } from './useBackHandler';
import { closeTopModal, hasOpenModal } from '../components/Modal/modalStack';

afterEach(cleanup);

function Harness({ active, onBack }: { active: boolean; onBack: () => void }) {
    useBackHandler(active, onBack);
    return null;
}

describe('useBackHandler', () => {
    it('active でないあいだは戻る操作を横取りしない', () => {
        render(<Harness active={false} onBack={vi.fn()} />);
        expect(hasOpenModal()).toBe(false);
    });

    it('active のあいだは戻る操作を受け取る', () => {
        const onBack = vi.fn();
        render(<Harness active onBack={onBack} />);

        expect(closeTopModal()).toBe(true);
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('アンマウントすると登録が外れる', () => {
        render(<Harness active onBack={vi.fn()} />);
        cleanup();
        expect(hasOpenModal()).toBe(false);
    });

    it('active を落とすと登録が外れる', () => {
        const { rerender } = render(<Harness active onBack={vi.fn()} />);
        rerender(<Harness active={false} onBack={vi.fn()} />);
        expect(hasOpenModal()).toBe(false);
    });

    // 呼び出し側のコールバックは毎レンダー作り直されるのが普通。
    // 登録時のものを掴んだままだと、古いstateを閉じ込めた関数が呼ばれる
    it('最新のコールバックを呼ぶ（登録し直さない）', () => {
        const first = vi.fn();
        const second = vi.fn();
        const { rerender } = render(<Harness active onBack={first} />);
        rerender(<Harness active onBack={second} />);

        closeTopModal();

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });
});
