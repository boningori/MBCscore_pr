import { useState } from 'react';
import { Modal } from '../Modal';
import { findOverflowPlayers, MAX_PLAYERS_PER_TEAM, type NumberedPlayer } from '../TeamShared';
import { DOUBLE_ZERO_INTERNAL, formatPlayerNumber, sortPlayersByNumber } from '../../utils/playerNumber';
import '../../styles/number-grid.css';
import './AddPlayersPanel.css';

/** 追加する選手1人分。氏名は確定時に補完済み（空にならない） */
export interface NewPlayerInput {
    number: number;
    name: string;
}

interface AddPlayersPanelProps {
    /** 追加先のチーム名（見出しに出して取り違えを防ぐ） */
    teamName: string;
    teamColor: 'white' | 'blue';
    /** 登録済みの名簿。重複を防ぐためだけに使う */
    players: readonly NumberedPlayer[];
    /** 確定。背番号順・氏名補完済みの配列が渡る */
    onSubmit: (players: NewPlayerInput[]) => void;
    onClose: () => void;
}

/** 0〜99 と 00。00 は内部表現が 100 なので最後に置く（対戦チーム管理と同じ並び） */
const GRID_NUMBERS = [...Array.from({ length: 100 }, (_, i) => i), DOUBLE_ZERO_INTERNAL];

/** 氏名が空なら自動命名する。SubstitutionModal の「+ 選手を追加」と同じ規則 */
const resolveName = (number: number, name: string) =>
    name.trim() || `選手${formatPlayerNumber(number)}`;

/**
 * 名簿から漏れた選手を、番号グリッドでまとめて登録するパネル。
 *
 * 対戦チーム管理（OpponentManager）の番号グリッドと見た目は同じだが、
 * 振る舞いを2点変えている。
 *
 * 1. 登録済みの番号は押せない。試合中は選手を削除する action が存在せず、
 *    タップで外せる見た目にすると「消せるのに消えない」ボタンになる
 * 2. グリッドで選んだ時点では登録しない。101マスの誤タップが取り消せない
 *    登録に直結するのを防ぐため、確定リストを見せてから一括で確定する
 */
export function AddPlayersPanel({
    teamName,
    teamColor,
    players,
    onSubmit,
    onClose,
}: AddPlayersPanelProps) {
    // 確定前の下書き。常に背番号順に保つので、確定時に並べ替え直す必要がない
    const [draft, setDraft] = useState<NewPlayerInput[]>([]);

    const registeredNumbers = new Set(players.map(p => p.number));
    const draftNumbers = new Set(draft.map(d => d.number));

    const toggleNumber = (num: number) => {
        setDraft(prev =>
            prev.some(d => d.number === num)
                ? prev.filter(d => d.number !== num)
                : sortPlayersByNumber([...prev, { number: num, name: '' }]),
        );
    };

    const changeName = (num: number, name: string) => {
        setDraft(prev => prev.map(d => (d.number === num ? { ...d, name } : d)));
    };

    const handleSubmit = () => {
        if (draft.length === 0) return;
        onSubmit(draft.map(d => ({ number: d.number, name: resolveName(d.number, d.name) })));
    };

    // 追加後に公式様式（15人分）から外れる選手。
    //
    // 外れるのは「いま追加する選手」とは限らない。名簿は背番号順に並び
    // （handleAddPlayerToTeam）、様式は先頭15人しか描かない
    // （RunningScoresheet の players.slice(0, 15)）ため、若い番号を足すと
    // 番号の大きい既存選手が押し出される。得点を記録済みの選手が黙って
    // 様式から消えるので、誰が外れるかを確定前に名指しで伝える。
    //
    // 追加そのものは止めない。練習試合では人数が読めないまま始まることがあり、
    // 止めると記録できなくなる（退場者を一覧から外さないのと同じ方針）。
    const resolvedDraft = draft.map(d => ({ number: d.number, name: resolveName(d.number, d.name) }));
    const overflow = findOverflowPlayers(players, resolvedDraft);
    const overflowNew = overflow.filter(o => draftNumbers.has(o.number));
    const overflowExisting = overflow.filter(o => !draftNumbers.has(o.number));
    const listNames = (list: NumberedPlayer[]) =>
        list.map(o => `#${formatPlayerNumber(o.number)} ${o.name}`).join('、');

    return (
        <Modal
            onClose={onClose}
            contentClassName="modal-content add-players-modal"
            labelledBy="add-players-title"
        >
            <div className="modal-header">
                <h2 className="modal-title" id="add-players-title">
                    選手を追加 - <span className={`add-players-team ${teamColor}`}>{teamName}</span>
                </h2>
                <button className="modal-close" onClick={onClose} aria-label="閉じる">✕</button>
            </div>

            <div className="number-grid-container">
                <p className="number-grid-hint">背番号をタップして選ぶ（登録済みの番号は選べません）</p>
                <div className="number-grid">
                    {GRID_NUMBERS.map(num => {
                        const registered = registeredNumbers.has(num);
                        const selected = draftNumbers.has(num);
                        const display = formatPlayerNumber(num);
                        return (
                            <button
                                key={num}
                                type="button"
                                className={`number-grid-item ${selected ? 'selected' : ''}`}
                                onClick={() => toggleNumber(num)}
                                disabled={registered}
                                aria-pressed={selected}
                                aria-label={registered ? `背番号${display}（登録済み）` : `背番号${display}`}
                            >
                                {display}
                            </button>
                        );
                    })}
                </div>
            </div>

            {draft.length === 0 ? (
                <p className="add-players-empty">
                    選んだ背番号がここに並びます。氏名は任意で、空欄なら「選手7」のように入ります
                </p>
            ) : (
                <div className="add-players-draft">
                    {draft.map(d => {
                        const display = formatPlayerNumber(d.number);
                        return (
                            <div key={d.number} className="add-players-draft-row">
                                <span className="add-players-draft-number">#{display}</span>
                                <input
                                    type="text"
                                    className="add-players-draft-name"
                                    aria-label={`背番号${display}の氏名`}
                                    value={d.name}
                                    onChange={e => changeName(d.number, e.target.value)}
                                    placeholder="氏名（任意）"
                                    autoComplete="off"
                                />
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-small add-players-draft-remove"
                                    onClick={() => toggleNumber(d.number)}
                                    aria-label={`背番号${display}を外す`}
                                >
                                    ✕
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {overflow.length > 0 && (
                <div className="add-players-notice" role="status">
                    スコアシートの選手欄は{MAX_PLAYERS_PER_TEAM}人分です。
                    {overflowExisting.length > 0 &&
                        `追加すると ${listNames(overflowExisting)} が印刷・出力に載らなくなります（記録は残ります）。`}
                    {overflowNew.length > 0 &&
                        `${listNames(overflowNew)} は印刷・出力に載りません（記録は残ります）。`}
                </div>
            )}

            <div className="add-players-actions">
                <button className="btn btn-secondary btn-large" onClick={onClose}>
                    キャンセル
                </button>
                <button
                    className="btn btn-success btn-large"
                    onClick={handleSubmit}
                    disabled={draft.length === 0}
                >
                    {draft.length > 0 ? `${draft.length}人を追加` : '追加'}
                </button>
            </div>
        </Modal>
    );
}
