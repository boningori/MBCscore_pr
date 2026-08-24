import { describe, it, expect, beforeEach } from 'vitest';
import {
    getDefaultGameMode,
    grantVoiceMemoConsent,
    hasStoredGameMode,
    hasVoiceMemoConsent,
    isVoiceMemoEnabled,
    saveDefaultGameMode,
    setVoiceMemoEnabled,
} from './appSettings';

beforeEach(() => {
    localStorage.clear();
});

// jsdomのmatchMediaは画面条件を評価しないため、カンマ区切りの各節を
// (max-width: Npx) / (max-height: Npx) / (orientation: …) の組み合わせとして解釈するスタブを入れる
const setViewport = (w: number, h = 900) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: h, configurable: true, writable: true });
    window.matchMedia = ((query: string) => {
        const clauseMatches = (clause: string) => {
            const conditions = clause.match(/\([^)]+\)/g) ?? [];
            if (conditions.length === 0) return false;
            return conditions.every(cond => {
                const maxWidth = /max-width:\s*(\d+)px/.exec(cond);
                if (maxWidth) return w <= Number(maxWidth[1]);
                const maxHeight = /max-height:\s*(\d+)px/.exec(cond);
                if (maxHeight) return h <= Number(maxHeight[1]);
                const orientation = /orientation:\s*(landscape|portrait)/.exec(cond);
                if (orientation) return orientation[1] === (w >= h ? 'landscape' : 'portrait');
                return false;
            });
        };
        return {
            matches: query.split(',').some(clause => clauseMatches(clause)),
            media: query,
            onchange: null,
            addEventListener: () => { },
            removeEventListener: () => { },
            addListener: () => { },
            removeListener: () => { },
            dispatchEvent: () => false,
        } as unknown as MediaQueryList;
    }) as typeof window.matchMedia;
};

const setWidth = (w: number) => setViewport(w);

describe('getDefaultGameMode: 未設定時は画面幅で自動選択', () => {
    it('未設定かつスマホ幅ならシンプルモード', () => {
        setWidth(375);
        expect(getDefaultGameMode()).toBe('simple');
    });

    it('未設定かつ3カラムが成立する幅(>800px)ならフルモード', () => {
        setWidth(1024);
        expect(getDefaultGameMode()).toBe('full');
    });

    // CSSの @media (max-width: 800px) と閾値を揃える。
    // 旧実装は768px基準だったため、768〜800pxがフルモードなのに2カラムに畳まれていた
    it('800pxちょうどはシンプルモード（CSSが2カラムへ畳む側）', () => {
        setWidth(800);
        expect(getDefaultGameMode()).toBe('simple');
    });

    it('801px以上はフルモード', () => {
        setWidth(801);
        expect(getDefaultGameMode()).toBe('full');
    });

    it('iPad Pro 11インチ縦(834px)はフルモード', () => {
        setWidth(834);
        expect(getDefaultGameMode()).toBe('full');
    });

    it('明示的に保存された設定は画面幅より優先される', () => {
        setWidth(375);
        saveDefaultGameMode('full');
        expect(getDefaultGameMode()).toBe('full');
    });
});

// 横向きスマホは幅が801px以上でも高さが足りず、フルモードでは
// 操作ボタン・交代・履歴が列内スクロールに埋もれる
describe('getDefaultGameMode: 横向きで高さが足りない場合', () => {
    it('iPhone X以降の横向き(812x375)は幅801px以上でもシンプルモード', () => {
        setViewport(812, 375);
        expect(getDefaultGameMode()).toBe('simple');
    });

    it('iPhone 14 Pro Maxの横向き(932x430)もシンプルモード', () => {
        setViewport(932, 430);
        expect(getDefaultGameMode()).toBe('simple');
    });

    it('iPad Proの横向き(1366x1024)は高さが足りるのでフルモード', () => {
        setViewport(1366, 1024);
        expect(getDefaultGameMode()).toBe('full');
    });

    it('iPad Air縦向き(834x1112)はフルモード（横向き条件に該当しない）', () => {
        setViewport(834, 1112);
        expect(getDefaultGameMode()).toBe('full');
    });

    it('高さ501pxの横向きはフルモード（境界の外側）', () => {
        setViewport(1024, 501);
        expect(getDefaultGameMode()).toBe('full');
    });

    it('高さ500pxちょうどの横向きはシンプルモード', () => {
        setViewport(1024, 500);
        expect(getDefaultGameMode()).toBe('simple');
    });
});

describe('hasStoredGameMode', () => {
    it('未保存ならfalse', () => {
        expect(hasStoredGameMode()).toBe(false);
    });

    it('保存済みならtrue', () => {
        saveDefaultGameMode('simple');
        expect(hasStoredGameMode()).toBe(true);
    });
});

describe('appSettings: 音声メモ', () => {
    it('既定はOFF（音声の外部送信は明示的な選択の上でのみ行う）', () => {
        expect(isVoiceMemoEnabled()).toBe(false);
    });

    it('既定では同意していない', () => {
        expect(hasVoiceMemoConsent()).toBe(false);
    });

    it('ONにすると有効になる', () => {
        setVoiceMemoEnabled(true);
        expect(isVoiceMemoEnabled()).toBe(true);
    });

    it('OFFに戻せる', () => {
        setVoiceMemoEnabled(true);
        setVoiceMemoEnabled(false);
        expect(isVoiceMemoEnabled()).toBe(false);
    });

    it('同意は一度与えると残る', () => {
        grantVoiceMemoConsent();
        expect(hasVoiceMemoConsent()).toBe(true);
    });

    it('OFFに戻しても同意は取り消されない（再度ONで確認をやり直さない）', () => {
        grantVoiceMemoConsent();
        setVoiceMemoEnabled(true);
        setVoiceMemoEnabled(false);
        expect(hasVoiceMemoConsent()).toBe(true);
    });

    it('既定モードの設定を壊さない', () => {
        saveDefaultGameMode('simple');
        setVoiceMemoEnabled(true);
        expect(getDefaultGameMode()).toBe('simple');
    });

    // saveAppSettingsはloadAppSettings()（既定値で埋めた値）ではなく
    // 生のストレージ値に対してマージしなければならない。
    // そうしないと音声メモの設定を保存しただけでdefaultGameMode: 'full'が
    // 生ストレージに書き込まれ、hasStoredGameMode()がtrueを返してしまい、
    // useGameModeの画面幅追従（iPadの回転対応）が永久に止まる
    it('音声メモをONにしても既定モードは「未保存」のままか', () => {
        expect(hasStoredGameMode()).toBe(false);
        setVoiceMemoEnabled(true);
        expect(hasStoredGameMode()).toBe(false);
    });

    it('同意しても既定モードは「未保存」のままか', () => {
        expect(hasStoredGameMode()).toBe(false);
        grantVoiceMemoConsent();
        expect(hasStoredGameMode()).toBe(false);
    });

    it('明示的に既定モードを保存した場合はhasStoredGameModeがtrueのまま', () => {
        saveDefaultGameMode('full');
        expect(hasStoredGameMode()).toBe(true);
    });
});
