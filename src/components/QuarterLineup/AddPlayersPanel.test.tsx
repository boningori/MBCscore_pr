// 番号グリッドは対戦チーム管理と見た目を共有するが、振る舞いが2点違う。
// (1) 試合中は選手を削除する action が無いため、登録済みの番号は押せない
// (2) 101マスの誤タップが取り消せない登録に直結しないよう、確定するまで登録しない
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AddPlayersPanel } from './AddPlayersPanel';

afterEach(cleanup);

/** 登録済みの名簿（背番号 4〜8 の5人） */
const registered = [4, 5, 6, 7, 8].map(n => ({ number: n, name: `既存${n}` }));

function setup(overrides: Partial<Parameters<typeof AddPlayersPanel>[0]> = {}) {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
        <AddPlayersPanel
            teamName="白チーム"
            teamColor="white"
            players={registered}
            onSubmit={onSubmit}
            onClose={onClose}
            {...overrides}
        />,
    );
    return { onSubmit, onClose };
}

const gridButton = (label: string) => screen.getByRole('button', { name: label }) as HTMLButtonElement;

describe('AddPlayersPanel: 番号グリッド', () => {
    it('登録済みの背番号は押せない（試合中は削除する手段が無いため）', () => {
        setup();
        expect(gridButton('背番号7（登録済み）').disabled).toBe(true);
        expect(gridButton('背番号9').disabled).toBe(false);
    });

    it('0〜99 と 00 の101マスが並ぶ', () => {
        setup();
        expect(gridButton('背番号0')).toBeTruthy();
        expect(gridButton('背番号99')).toBeTruthy();
        expect(gridButton('背番号00')).toBeTruthy();
    });

    it('タップすると確定リストに並び、もう一度タップで外れる', () => {
        setup();
        fireEvent.click(gridButton('背番号9'));
        expect(screen.getByLabelText('背番号9の氏名')).toBeTruthy();

        fireEvent.click(gridButton('背番号9'));
        expect(screen.queryByLabelText('背番号9の氏名')).toBeNull();
    });

    it('確定リストの「外す」でも取り消せる（グリッドまで戻らずに済む）', () => {
        setup();
        fireEvent.click(gridButton('背番号9'));
        fireEvent.click(screen.getByRole('button', { name: '背番号9を外す' }));
        expect(screen.queryByLabelText('背番号9の氏名')).toBeNull();
    });
});

describe('AddPlayersPanel: 確定', () => {
    it('選択が0人なら確定ボタンは押せない', () => {
        setup();
        expect((screen.getByRole('button', { name: '追加' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('確定すると背番号順の配列で onSubmit が1回だけ呼ばれる', () => {
        const { onSubmit } = setup();
        // わざと降順にタップする
        fireEvent.click(gridButton('背番号12'));
        fireEvent.click(gridButton('背番号9'));

        fireEvent.click(screen.getByRole('button', { name: '2人を追加' }));

        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onSubmit.mock.calls[0][0]).toEqual([
            { number: 9, name: '選手9' },
            { number: 12, name: '選手12' },
        ]);
    });

    it('00 は最後に並ぶ', () => {
        const { onSubmit } = setup();
        fireEvent.click(gridButton('背番号00'));
        fireEvent.click(gridButton('背番号9'));

        fireEvent.click(screen.getByRole('button', { name: '2人を追加' }));

        expect(onSubmit.mock.calls[0][0]).toEqual([
            { number: 9, name: '選手9' },
            { number: 100, name: '選手00' },
        ]);
    });

    it('入力した氏名はそのまま渡り、空欄・空白のみは自動命名になる', () => {
        const { onSubmit } = setup();
        fireEvent.click(gridButton('背番号9'));
        fireEvent.click(gridButton('背番号12'));

        fireEvent.change(screen.getByLabelText('背番号9の氏名'), { target: { value: ' 山田 ' } });
        fireEvent.change(screen.getByLabelText('背番号12の氏名'), { target: { value: '   ' } });

        fireEvent.click(screen.getByRole('button', { name: '2人を追加' }));

        expect(onSubmit.mock.calls[0][0]).toEqual([
            { number: 9, name: '山田' },
            { number: 12, name: '選手12' },
        ]);
    });

    it('キャンセルでは何も登録されない', () => {
        const { onSubmit, onClose } = setup();
        fireEvent.click(gridButton('背番号9'));
        fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

        expect(onSubmit).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('見出しに対象チームが出る（タブを取り違えたまま追加するのを防ぐ）', () => {
        setup({ teamName: '青チーム', teamColor: 'blue' });
        expect(screen.getByRole('heading', { name: '選手を追加 - 青チーム' })).toBeTruthy();
    });
});

/** 背番号 10〜24 の15人（様式の枠がちょうど埋まった状態） */
const fifteen = Array.from({ length: 15 }, (_, i) => ({ number: 10 + i, name: `既存${10 + i}` }));

describe('AddPlayersPanel: 15人あふれの案内', () => {
    it('溢れないうちは案内を出さない', () => {
        setup({ players: fifteen.slice(0, 13) });
        fireEvent.click(gridButton('背番号4'));
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('若い番号を足すと、押し出される既存選手を名指しで出す', () => {
        setup({ players: fifteen });
        fireEvent.click(gridButton('背番号4'));

        const notice = screen.getByRole('status');
        expect(notice.textContent).toContain('#24 既存24');
        expect(notice.textContent).toContain('印刷・出力に載らなくなります');
    });

    it('大きい番号を足すと、載らないのは追加する本人だと伝える', () => {
        setup({ players: fifteen });
        fireEvent.click(gridButton('背番号99'));

        const notice = screen.getByRole('status');
        // 氏名を空欄のまま追加すると「選手99」になる。案内にも、利用者が
        // 実際に手にする名前が出ていないと誰が載らないのか分からない
        expect(notice.textContent).toContain('#99 選手99');
        expect(notice.textContent).toContain('印刷・出力に載りません');
    });

    it('複数人が外れるときは全員を挙げる', () => {
        setup({ players: fifteen });
        fireEvent.click(gridButton('背番号4'));
        fireEvent.click(gridButton('背番号5'));

        const notice = screen.getByRole('status');
        expect(notice.textContent).toContain('#23 既存23');
        expect(notice.textContent).toContain('#24 既存24');
    });

    it('溢れても追加そのものは止めない（練習試合では人数が読めないまま始まる）', () => {
        const { onSubmit } = setup({ players: fifteen });
        fireEvent.click(gridButton('背番号4'));

        const submit = screen.getByRole('button', { name: '1人を追加' }) as HTMLButtonElement;
        expect(submit.disabled).toBe(false);
        fireEvent.click(submit);
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('入力した氏名が案内にも反映される', () => {
        setup({ players: fifteen });
        fireEvent.click(gridButton('背番号99'));
        fireEvent.change(screen.getByLabelText('背番号99の氏名'), { target: { value: '山田' } });

        expect(screen.getByRole('status').textContent).toContain('#99 山田');
    });
});
