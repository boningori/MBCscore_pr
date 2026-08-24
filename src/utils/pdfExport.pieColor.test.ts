import { describe, it, expect, afterEach } from 'vitest';
import { readPieSegments } from './pdfExport';

afterEach(() => { document.body.innerHTML = ''; });

function pie(styles: Record<string, string>, percent = 50): HTMLElement {
    const el = document.createElement('div');
    el.dataset.piePercent = String(percent);
    for (const [key, value] of Object.entries(styles)) el.style.setProperty(key, value);
    document.body.appendChild(el);
    return el;
}

describe('readPieSegments の色', () => {
    it('--pie-main / --pie-rest があればそれを使う', () => {
        const el = pie({ '--pie-main': '#3b82f6', '--pie-rest': '#111111' });

        expect(readPieSegments(el)).toEqual({ percent: 50, mainColor: '#3b82f6', restColor: '#111111' });
    });

    it('--pie-main が無ければ --stats-success に落ちる', () => {
        const el = pie({ '--stats-success': '#22c55e', '--stats-success-pale': '#dcfce7' });

        expect(readPieSegments(el)).toEqual({ percent: 50, mainColor: '#22c55e', restColor: '#dcfce7' });
    });

    it('どちらも無ければ null', () => {
        expect(readPieSegments(pie({}))).toBeNull();
    });

    it('割合が数値でなければ null', () => {
        const el = pie({ '--pie-main': '#3b82f6', '--pie-rest': '#111111' });
        el.dataset.piePercent = 'なし';

        expect(readPieSegments(el)).toBeNull();
    });
});
