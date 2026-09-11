// 複製先の canvas に描けなかったとき、空のファイルを保存して成功と報告しない。
//
// exportElement は html2canvas が返した canvas を新しい canvas へ描き直す
// （斜線を重ねるため。返ってきた canvas には直接描けない）。その複製先で
// getContext('2d') が null を返すと、中身を一切描かないまま元の canvas を
// 置き換えていた。
//
// assertRenderedImage はこれを捕まえられない。あれが見張っているのは
// 「toDataURL が 'data:,' を返す」ケース（上限を超えた canvas）であって、
// 空の canvas は正当な data:image/jpeg を返すためである。実測では
// drawImage が一度も呼ばれないまま 'saved'（成功）が返り、白紙のファイルが
// 保存されたうえで「出力しました」と報告されていた。
//
// このファイルの他の getContext は5箇所とも逃げ道を持っている
// （斜線は描かない／元の canvas を返す）。ここだけ無かった。
// 中身のある canvas をそのまま使うのが正しい退避先で、斜線が重ならないぶん
// 見た目は落ちるが、記録として読める画像が残る。

import { describe, it, expect, afterEach, vi } from 'vitest';

/** 中身のある画像を表す data URL（assertRenderedImage は通る） */
const VALID_JPEG = 'data:image/jpeg;base64,AAAA';

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('html2canvas');
});

/**
 * html2canvas が返す「中身のある」canvas と、複製先の canvas の振る舞いを仕込む。
 *
 * @param copyCanDraw 複製先が 2D コンテキストを取れるか
 */
function setup(copyCanDraw: boolean) {
    const drawn: string[] = [];

    const source = document.createElement('canvas');
    source.width = 100;
    source.height = 100;
    source.toDataURL = () => VALID_JPEG;
    vi.doMock('html2canvas', () => ({ default: vi.fn(async () => source) }));

    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, ...rest: unknown[]) => {
        const el = origCreate(tag, ...(rest as []));
        if (tag === 'canvas') {
            const copy = el as HTMLCanvasElement;
            copy.toDataURL = () => VALID_JPEG;
            copy.getContext = ((kind: string) => {
                if (kind !== '2d' || !copyCanDraw) return null;
                return {
                    drawImage: () => { drawn.push('drawImage'); },
                    strokeStyle: '', lineWidth: 0, fillStyle: '',
                    beginPath: () => { }, moveTo: () => { }, lineTo: () => { },
                    stroke: () => { }, fillRect: () => { }, fillText: () => { },
                    font: '', textAlign: '', textBaseline: '',
                } as unknown as CanvasRenderingContext2D;
            }) as HTMLCanvasElement['getContext'];
        }
        if (tag === 'a') (el as HTMLAnchorElement).click = () => { };
        return el;
    });

    return { source, drawn };
}

describe('複製先の canvas に描けないとき', () => {
    it('中身のある元の canvas から出力する（空のまま保存しない）', async () => {
        const { source, drawn } = setup(false);
        const { exportElement } = await import('./pdfExport');

        const toDataURL = vi.spyOn(source, 'toDataURL');
        const outcome = await exportElement(document.createElement('div'), {
            filename: 'blank',
            format: 'jpeg',
        });

        expect(outcome).toBe('saved');
        // 複製には一度も描けていない
        expect(drawn).toEqual([]);
        // だからこそ、出力は元の canvas から採らなければならない
        expect(toDataURL).toHaveBeenCalled();
    });
});

describe('複製先の canvas に描けるとき（従来どおり）', () => {
    it('複製へ描き直してから出力する', async () => {
        const { drawn } = setup(true);
        const { exportElement } = await import('./pdfExport');

        const outcome = await exportElement(document.createElement('div'), {
            filename: 'normal',
            format: 'jpeg',
        });

        expect(outcome).toBe('saved');
        expect(drawn).toEqual(['drawImage']);
    });
});
