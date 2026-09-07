import { useState } from 'react';
import { Modal } from '../Modal';
import type { Player } from '../../types/game';
import { MAX_PLAYERS_PER_TEAM } from '../../types/game';
import { getDisqualification, shortDisqualificationLabel } from '../../utils/disqualification';
import {
    formatPlayerNumber,
    parsePlayerNumber,
    isValidPlayerNumber,
    comparePlayerNumbers,
} from '../../utils/playerNumber';
import { findOverflowPlayer } from '../TeamShared/playerLimit';
import './SubstitutionModal.css';

/**
 * 画面に出す名前。コートネームがあればそれを使う。
 *
 * 交代は背番号で認識するので、要るのはフルネームではなく呼び名。
 * `courtName || name` はアプリ全体の既定（Scoreboard / TeamPanel /
 * ActionHistory / FoulInputFlow ほか）で、素の name を出していたのは
 * このモーダルだけだった。
 * courtName はマイチーム管理でしか設定できず、対戦相手の選手には無い。
 * タブレット・PCは幅に余裕があるのでフォールバックを出す。スマホだけは
 * 出さない（nameClass を参照）。
 */
const displayName = (player: Player) => player.courtName || player.name;

/**
 * 名前の span に付けるクラス。
 *
 * スマホ（〜600px）では氏名のフォールバックを出さず、空いた幅を得点・出場Qに回す。
 * 切り詰められた `佐々木健…` は誰のことか分からず、情報として働かないまま幅だけ
 * 占めていた（実機で確認）。交代は背番号で認識するので、番号だけでも人は特定できる。
 *
 * CSS からは「いま出ている文字列がコートネームなのかフォールバックなのか」を
 * 判別できないため、描画側で目印を付ける。実際に隠すのは CSS 側
 * （タブレット・PCでは幅に余裕があるので氏名を出したままにする）。
 */
const nameClass = (player: Player) =>
    `sub-player-name${player.courtName ? '' : ' fallback'}`;

interface SubstitutionModalProps {
    teamName: string;
    teamId: string;
    players: Player[];
    onSubstitute: (playerInId: string, playerOutId: string) => void;
    onAddPlayer?: (number: number, name: string) => void;
    onClose: () => void;
}

export function SubstitutionModal({
    teamName,
    players,
    onSubstitute,
    onAddPlayer,
    onClose,
}: SubstitutionModalProps) {
    // 交代は複数人まとめて行う。単数だと「4番と5番を下げて9番と10番」という
    // コーチの指示を1組ずつに分解してタップし直すことになる
    const [playersOut, setPlayersOut] = useState<string[]>([]);
    const [playersIn, setPlayersIn] = useState<string[]>([]);
    // 直前の実行で何人替えたか（案内の文言に使う）
    const [lastCount, setLastCount] = useState(0);
    // この画面で実行済みの交代。連続交代の手応えを返すために保持する
    const [doneCount, setDoneCount] = useState(0);
    const [lastDone, setLastDone] = useState<string | null>(null);

    // 選手追加フォーム
    const [showAddForm, setShowAddForm] = useState(false);
    const [newNumber, setNewNumber] = useState('');
    const [newName, setNewName] = useState('');
    const [addError, setAddError] = useState<string | null>(null);

    const onCourtPlayers = players.filter(p => p.isOnCourt);
    // 5ファウルの選手もIN候補に残す。練習試合では相手チームの同意で出続けることが
    // あり、除外するとコートに戻す手段がなくなる。除外したままだとベンチ全員が
    // 退場した際に「ベンチに選手がいません」と誤って表示されもする。
    // 判断は記録者に任せ、カード上に「退場」と併記して見落としを防ぐ
    const benchPlayers = players.filter(p => !p.isOnCourt);

    const toggleOut = (id: string) =>
        setPlayersOut(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    const toggleIn = (id: string) =>
        setPlayersIn(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

    // コート上は5人固定なので、IN と OUT の数が違う交代は成立しない
    const countsMatch = playersOut.length === playersIn.length;
    const canSubstitute = playersOut.length > 0 && countsMatch;

    /** 選択中のIDを背番号順の Player 配列にする */
    const orderedBySelection = (ids: string[]) =>
        ids
            .map(id => players.find(p => p.id === id))
            .filter((p): p is Player => p !== undefined)
            .sort((a, b) => comparePlayerNumbers(a.number, b.number));

    // 交代は1組ずつ確定するが、モーダルは閉じない。
    // バスケではタイムアウト明けなどに複数人まとめて替えるのが普通で、
    // 1組ごとに閉じると「交代ボタン→選択→実行」を人数分やり直すことになり、
    // 試合が止まっている短い時間に間に合わない
    const handleConfirm = () => {
        if (!canSubstitute) return;

        const outs = orderedBySelection(playersOut);
        const ins = orderedBySelection(playersIn);

        // canSubstitute は選択 state の生の長さを見ているが、orderedBySelection は
        // players に無いIDを落とす。いまは落ちる経路が無いが、ずれたら黙って
        // 1人取りこぼすより止める
        if (outs.length !== ins.length) return;

        // 組み合わせはどこにも保存されない（handleSubstitutePlayer が書くのは
        // isOnCourt と quartersPlayed だけ）ので、どう組んでも結果は同じ。
        // 背番号順で組むのは表示を安定させるため。1組ずつ送ることで
        // コート上の人数が途中でも5人に保たれる
        outs.forEach((out, i) => onSubstitute(ins[i].id, out.id));

        setLastDone(
            outs.length === 1
                ? `#${formatPlayerNumber(outs[0].number)} ${displayName(outs[0])} → #${formatPlayerNumber(ins[0].number)} ${displayName(ins[0])}`
                // 複数は背番号だけ。氏名まで並べると375px幅の枠に収まらない
                : `${outs.map(p => `#${formatPlayerNumber(p.number)}`).join(' ')} ⇄ ${ins.map(p => `#${formatPlayerNumber(p.number)}`).join(' ')}`,
        );
        setLastCount(outs.length);
        setDoneCount(count => count + 1);
        setPlayersOut([]);
        setPlayersIn([]);
    };

    /**
     * 実行できない理由。まだ何も選んでいないときは出さない
     * （間違いではないので、既存の連続交代の案内をそのまま見せる）
     */
    const mismatchMessage = (): string | null => {
        if (playersOut.length === 0 && playersIn.length === 0) return null;
        if (countsMatch) return null;
        if (playersIn.length === 0) return `ベンチから${playersOut.length}人選んでください`;
        if (playersOut.length === 0) return `コートから${playersIn.length}人選んでください`;
        return `コート${playersOut.length}人・ベンチ${playersIn.length}人を選んでいます。同じ人数にしてください`;
    };

    // 追加すると公式様式（15人分）から外れる選手。
    //
    // 外れるのは追加する選手とは限らない。名簿は背番号順に並ぶため、若い番号を
    // 足すと番号の大きい既存選手が押し出される。従来は「これ以上は収まりません」
    // とだけ出していたが、実際には得点を記録済みの既存選手が様式から消えており、
    // 伝えている結果が事実と違っていた（実測: #24 が消えてチーム合計と
    // 個人欄の合計が食い違った）。
    const pendingNumber = parsePlayerNumber(newNumber);
    const overflowTarget =
        pendingNumber !== null &&
        isValidPlayerNumber(pendingNumber) &&
        !players.some(p => p.number === pendingNumber)
            ? findOverflowPlayer(players, { number: pendingNumber, name: newName.trim() })
            : null;

    const handleAddPlayer = () => {
        setAddError(null);

        if (!newNumber.trim()) {
            setAddError('背番号を入力してください');
            return;
        }

        const number = parsePlayerNumber(newNumber);
        if (number === null || !isValidPlayerNumber(number)) {
            setAddError('背番号は0〜99または00を入力してください');
            return;
        }

        // 重複チェック
        const displayNum = formatPlayerNumber(number);
        if (players.some(p => p.number === number)) {
            setAddError(`背番号 ${displayNum} は既に登録されています`);
            return;
        }

        const playerName = newName.trim() || `選手${displayNum}`;

        if (onAddPlayer) {
            onAddPlayer(number, playerName);
        }

        // フォームをリセット
        setNewNumber('');
        setNewName('');
        setShowAddForm(false);
    };

    return (
        <Modal
            onClose={onClose}
            contentClassName="modal-content substitution-modal"
            labelledBy="substitution-modal-title"
        >
                <div className="modal-header">
                    <h2 className="modal-title" id="substitution-modal-title">選手交代 - {teamName}</h2>
                    <button className="modal-close" onClick={onClose} aria-label="閉じる">✕</button>
                </div>

                <div className="substitution-grid">
                    {/* コート側は必ず5人。スマホでは2列に折り返して全員を出すため、
                        ベンチ側と区別できるクラスを付ける */}
                    <div className="substitution-column court">
                        <h3 className="sub-column-title">
                            <span className="sub-column-label">コート (OUT)</span>
                            {playersOut.length > 0 && (
                                <span className={`sub-column-count ${countsMatch ? 'match' : 'mismatch'}`}>
                                    {playersOut.length}人選択
                                </span>
                            )}
                        </h3>
                        <div className="sub-player-list">
                            {onCourtPlayers.map(player => (
                                <button
                                    type="button"
                                    key={player.id}
                                    className={`sub-player-card ${playersOut.includes(player.id) ? 'selected out' : ''}`}
                                    onClick={() => toggleOut(player.id)}
                                    aria-pressed={playersOut.includes(player.id)}
                                >
                                    <span className="sub-player-number">#{formatPlayerNumber(player.number)}</span>
                                    <span className={nameClass(player)}>{displayName(player)}</span>
                                    <span className="sub-player-stats">{player.stats.points}pts</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="substitution-arrow">
                        {playersOut.length > 0 && playersIn.length > 0 ? '⇄' : '→'}
                    </div>

                    <div className="substitution-column bench">
                        <h3 className="sub-column-title">
                            <span className="sub-column-label">ベンチ (IN)</span>
                            {playersIn.length > 0 && (
                                <span className={`sub-column-count ${countsMatch ? 'match' : 'mismatch'}`}>
                                    {playersIn.length}人選択
                                </span>
                            )}
                        </h3>
                        <div className="sub-player-list">
                            {benchPlayers.map(player => {
                                // 退場は5ファウルだけではない（D 1つ / U・T 2つ）。
                                // どれも5個目より先に来るので、数だけで見ると失格済みの選手が
                                // 何の断りもなくIN候補に並ぶ。スタメン選択・選手カード・統計表と
                                // 同じ disqualification.ts の判定に揃える
                                const disqualification = getDisqualification(player.fouls);
                                const fouledOut = disqualification !== null;
                                return (
                                    <button
                                        type="button"
                                        key={player.id}
                                        className={`sub-player-card ${playersIn.includes(player.id) ? 'selected in' : ''} ${fouledOut ? 'fouled-out' : ''}`}
                                        onClick={() => toggleIn(player.id)}
                                        aria-pressed={playersIn.includes(player.id)}
                                    >
                                        <span className="sub-player-number">#{formatPlayerNumber(player.number)}</span>
                                        <span className={nameClass(player)}>{displayName(player)}</span>
                                        {disqualification && (
                                            <span className="sub-player-fouled-out">
                                                {shortDisqualificationLabel(disqualification)}
                                            </span>
                                        )}
                                        <span className="sub-player-quarters">
                                            Q: {player.quartersPlayed.map((q, i) => q ? i + 1 : '').filter(Boolean).join(',') || '-'}
                                        </span>
                                    </button>
                                );
                            })}
                            {benchPlayers.length === 0 && (
                                <div className="sub-empty">ベンチに選手がいません</div>
                            )}
                        </div>

                        {/* 選手追加セクション */}
                        {onAddPlayer && (
                            <div className="add-player-section">
                                {!showAddForm ? (
                                    <button
                                        className="btn btn-secondary add-player-btn"
                                        onClick={() => setShowAddForm(true)}
                                    >
                                        + 選手を追加
                                    </button>
                                ) : (
                                    <div className="add-player-form">
                                        <div className="add-player-inputs">
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                className="add-player-number"
                                                value={newNumber}
                                                onChange={e => setNewNumber(e.target.value)}
                                                placeholder="No."
                                                maxLength={2}
                                                autoFocus
                                                autoComplete="off"
                                            />
                                            <input
                                                type="text"
                                                className="add-player-name"
                                                value={newName}
                                                onChange={e => setNewName(e.target.value)}
                                                placeholder="氏名（任意）"
                                                autoComplete="off"
                                                onKeyDown={e => e.key === 'Enter' && handleAddPlayer()}
                                            />
                                        </div>
                                        {addError && (
                                            <div className="add-player-error">{addError}</div>
                                        )}
                                        {/*
                                          公式様式の選手欄は15人分しかないため、超えると
                                          スコアシートの行があふれる。ただし練習試合では
                                          人数が読めないまま始まることがあり、止めると
                                          記録そのものができなくなる。判断は利用者に任せ、
                                          結果だけ先に伝える（退場者の扱いと同じ方針）
                                        */}
                                        {players.length >= MAX_PLAYERS_PER_TEAM && (
                                            <div className="add-player-notice" role="status">
                                                {/* ここだけ displayName を使わない。公式様式は本名を印字するため、
                                                    コートネームで書くと様式に無い名前で「載らなくなります」と言うことになる */}
                                                {overflowTarget === null
                                                    ? `すでに${players.length}人います。スコアシートの選手欄は${MAX_PLAYERS_PER_TEAM}人分のため、追加すると1人が載らなくなります。`
                                                    : overflowTarget.number === pendingNumber
                                                        ? `スコアシートの選手欄は${MAX_PLAYERS_PER_TEAM}人分です。#${formatPlayerNumber(pendingNumber)} は印刷・出力に載りません（記録は残ります）。`
                                                        : `スコアシートの選手欄は${MAX_PLAYERS_PER_TEAM}人分です。追加すると #${formatPlayerNumber(overflowTarget.number)} ${overflowTarget.name} が印刷・出力に載らなくなります（記録は残ります）。`}
                                            </div>
                                        )}
                                        <div className="add-player-actions">
                                            <button
                                                className="btn btn-small btn-secondary"
                                                onClick={() => {
                                                    setShowAddForm(false);
                                                    setNewNumber('');
                                                    setNewName('');
                                                    setAddError(null);
                                                }}
                                            >
                                                キャンセル
                                            </button>
                                            <button
                                                className="btn btn-small btn-primary"
                                                onClick={handleAddPlayer}
                                            >
                                                追加
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/*
                  案内とボタンはモーダルの下端に貼り付ける。15人編成では
                  名簿だけで枠を超え、既定の位置ではボタンが画面外にあった
                  （実測: 375px幅でボタン上端781px・モーダル下端771px、
                  172pxスクロールしないと押せない）。交代は試合が止まっている
                  短い間に何度も行うので、探しに行かせない。
                  案内を外に残すと、上の方を見ているあいだ「交代しました」が
                  画面外になり、実行できたのか分からなくなる
                */}
                <div className="substitution-footer">
                    {/*
                      実行前の案内と実行後の結果を同じ高さの枠で入れ替える。
                      結果を後から差し込むとボタンが下にずれ、直前に「交代実行」が
                      あった位置に「完了」が来る。連続でタップした指がモーダルを
                      閉じてしまうため、枠は最初から場所を取っておく
                    */}
                    {/*
                      role="status" は枠そのものに最初から付けておき、中身（テキスト）
                      だけを差し替える。以前は3分岐で <div> ごと出し入れしており、
                      role が付くのと文言が入るのが同じコミットになっていた。
                      多くのスクリーンリーダーは、ライブリージョンが生成された（role を
                      得た）その瞬間の内容は読み上げないため、実行できない理由が
                      一度も読まれない可能性が高かった。枠を固定してテキストの変化に
                      すれば、既存のライブリージョンへの更新として読み上げられる
                    */}
                    <div
                        className={`substitution-note ${mismatchMessage() === null && doneCount > 0 ? 'done' : ''}`}
                        role="status"
                    >
                        {mismatchMessage() !== null ? (
                            <span className="substitution-note-sub">{mismatchMessage()}</span>
                        ) : doneCount > 0 ? (
                            <>
                                <span className="substitution-note-pair">{lastDone}</span>
                                <span className="substitution-note-sub">
                                    {lastCount > 1 ? `${lastCount}人交代しました` : '交代しました'}
                                    {doneCount > 1 ? `（この画面で${doneCount}件）` : ''}
                                </span>
                            </>
                        ) : (
                            <span className="substitution-note-sub">
                                交代実行してもこの画面は閉じません。続けて何人でも交代できます
                            </span>
                        )}
                    </div>

                    <div className="substitution-actions">
                        {/* 交代はその場で確定するため、実行後に「キャンセル」を残すと取り消せると誤解される */}
                        <button className="btn btn-secondary btn-large" onClick={onClose}>
                            {doneCount > 0 ? '完了' : 'キャンセル'}
                        </button>
                        <button
                            className="btn btn-success btn-large"
                            onClick={handleConfirm}
                            disabled={!canSubstitute}
                        >
                            交代実行
                        </button>
                    </div>
                </div>
        </Modal>
    );
}
