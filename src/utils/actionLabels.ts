// 記録アクションの表示名。
//
// 同じ辞書が App（Undoスナックバー・記録待ちのステータスバー）、保留パネル、
// 保留解決モーダルの3箇所に別々に書かれていて、内容がずれていた。実害として、
// スタッツを保留化するチーム選択モーダルだけが内部コードをそのまま出しており、
// 直前のステータスバーが「オフェンスリバウンド」と出した次の画面で
// 「OREBを保留として記録し…」と表示されていた。ターンオーバーの細目
// （TO:DD 等）はどの辞書にも無く、保留パネルに「TO:DD」と生で出ていた。
//
// アクション履歴の表示名はここに寄せていない。1行の幅が狭く「オフェンスREB」
// 「TO(ダブドリ)」と意図的に短くしてあるため（ActionHistory.getStatLabel）。

const STAT_LABELS: Record<string, string> = {
    OREB: 'オフェンスリバウンド',
    DREB: 'ディフェンスリバウンド',
    AST: 'アシスト',
    STL: 'スティール',
    BLK: 'ブロック',
    TO: 'ターンオーバー',
    'TO:DD': 'ターンオーバー(ダブドリ)',
    'TO:TR': 'ターンオーバー(トラベリング)',
    'TO:PM': 'ターンオーバー(パスミス)',
    'TO:CM': 'ターンオーバー(キャッチミス)',
    '2PA': '2Pミス',
    '3PA': '3Pミス',
    FTA: 'FTミス',
};

const SCORE_LABELS: Record<string, string> = {
    '2P': '2P成功',
    '3P': '3P成功',
    FT: 'FT成功',
};

const FOUL_LABELS: Record<string, string> = {
    P: 'パーソナルファウル',
    T: 'テクニカルファウル',
    BT: 'ベンチテクニカル',
    U: 'アンスポ',
    D: '失格',
    F: 'ファイティング',
};

/** 知らない値は握りつぶさずそのまま返す。空欄より内部コードのほうが手掛かりになる */
const lookup = (dict: Record<string, string>, value: string): string => dict[value] ?? value;

export function statLabel(statType: string): string {
    return lookup(STAT_LABELS, statType);
}

export function scoreLabel(scoreType: string): string {
    return lookup(SCORE_LABELS, scoreType);
}

/**
 * 保留アクションの種別と値から表示名を作る。
 * ファウルは種類が決まる前に保留化されうる（App の pendingAction は value を持たない）。
 */
export function actionLabel(actionType: string, value: string): string {
    if (actionType === 'SCORE') return scoreLabel(value);
    if (actionType === 'STAT' || actionType === 'MISS') return statLabel(value);
    if (actionType === 'FOUL') return value ? lookup(FOUL_LABELS, value) : 'ファウル';
    return value;
}
