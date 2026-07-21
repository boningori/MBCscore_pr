import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TimeoutInputModal } from './TimeoutInputModal';

afterEach(cleanup);

const noop = vi.fn();

function renderModal(props: { currentQuarter: number; quarterMinutes?: 5 | 6 }) {
    render(
        <TimeoutInputModal
            isOpen={true}
            teamName="テスト"
            teamColor="white"
            currentQuarter={props.currentQuarter}
            quarterMinutes={props.quarterMinutes}
            onConfirm={noop}
            onCancel={noop}
        />,
    );
}

// 1つ目のselectが「分」、2つ目が「秒」
function getMinuteSelect(): HTMLSelectElement {
    return screen.getAllByRole('combobox')[0] as HTMLSelectElement;
}

describe('TimeoutInputModal: クォーター時間の反映', () => {
    it('quarterMinutes=5のとき分の選択肢は0〜5で初期値は5', () => {
        renderModal({ currentQuarter: 1, quarterMinutes: 5 });
        const select = getMinuteSelect();
        expect(select.options.length).toBe(6);
        expect(select.value).toBe('5');
    });

    it('quarterMinutes未指定のとき従来どおり0〜6で初期値は6（後方互換）', () => {
        renderModal({ currentQuarter: 1 });
        const select = getMinuteSelect();
        expect(select.options.length).toBe(7);
        expect(select.value).toBe('6');
    });

    it('OT（第5ピリオド以降）はquarterMinutesに関係なく0〜3で初期値は3', () => {
        renderModal({ currentQuarter: 5, quarterMinutes: 5 });
        const select = getMinuteSelect();
        expect(select.options.length).toBe(4);
        expect(select.value).toBe('3');
    });
});
