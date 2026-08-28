import type { Player, ScoreEntry, StatEntry, FoulEntry, ScoreType, StatType, FreeThrowResult } from '../../types/game';
import { formatPlayerNumber } from '../../utils/playerNumber';
import { getDisqualification, shortDisqualificationLabel } from '../../utils/disqualification';
import { ActionHistory } from '../ActionHistory';

interface ActionHistoryHandlers {
  onRemoveScore: (entryId: string) => void;
  onRemoveStat: (entryId: string) => void;
  onRemoveFoul: (entryId: string) => void;
  onEditScore: (entryId: string, newPlayerId: string, newScoreType: ScoreType) => void;
  onEditStat: (entryId: string, newPlayerId: string, newStatType: StatType) => void;
  /** ファウルをした選手の付け替え（種別とFTは変えない。理由は handleEditFoul） */
  onEditFoul: (entryId: string, newPlayerId: string) => void;
  /** FTの成否の訂正（本数と種別は変えない。理由は handleEditFoulFreeThrows） */
  onEditFoulFreeThrows: (entryId: string, freeThrowResults: FreeThrowResult[]) => void;
  onConvertScoreToMiss: (entryId: string, newMissType: '2PA' | '3PA' | 'FTA', newPlayerId: string) => void;
  onConvertMissToScore: (entryId: string, newScoreType: '2P' | '3P' | 'FT', newPlayerId: string) => void;
  onToggleOwnGoal: (entryId: string) => void;
}

interface TeamPanelProps {
  teamId: 'teamA' | 'teamB';
  teamName: string;
  teamColor: 'white' | 'blue';
  players: Player[];
  // isMyTeam はここにあったが、選手名をマイチームだけに出すための分岐にしか
  // 使っていなかった。名前は両チームとも出すようになったので参照が無くなった
  isActive: boolean;
  selectedPlayerId: string | null;
  gameMode: 'full' | 'simple';
  scoreHistory: ScoreEntry[];
  statHistory: StatEntry[];
  foulHistory: FoulEntry[];
  /** この試合が3Pを使うか（アクション履歴の編集ダイアログへ渡す） */
  showThreePoint?: boolean;
  onPlayerSelect: (playerId: string, teamId: string) => void;
  onSubstitute: () => void;
  onCoachFoul: () => void;
  actionHistoryHandlers: ActionHistoryHandlers;
  /** 現クォーターのチームファウル数（指定時のみヘッダーにTFバッジを表示） */
  teamFouls?: number;
  /** 現クォーターのタイムアウト使用済みか */
  timeoutUsed?: boolean;
  /** タイムアウト記録の要求（指定時のみヘッダーに⏱チップを表示） */
  onTimeoutRequest?: () => void;
  /**
   * 記録済みタイムアウトの取り消し要求。
   *
   * 以前は記録するとチップを disabled にしていたが、タイムアウトは
   * アクション履歴に載らず他に導線も無いため、経過分の打ち間違いが
   * 試合中ずっと直せず、そのまま公式様式に印字されていた。
   */
  onTimeoutCancel?: () => void;
  /**
   * 記録できない状態（試合終了後）。
   *
   * アクションボタンは phase === 'finished' で押せなくなるのに、選手カードだけは
   * 押せて選択マークが付いていた。記録は入らないので空振りの操作が残るうえ、
   * 「新しい記録の追加はできません」と確認した直後の画面で選手を選べると、
   * まだ記録できるように読める。
   *
   * 止めるのは記録を増やす操作だけ。アクション履歴からの訂正・削除は
   * 終了後も残す（確認モーダルもそう案内している。App.tsx）。
   */
  disabled?: boolean;
}

export function TeamPanel({
  teamId,
  teamName,
  teamColor,
  players,
  isActive,
  selectedPlayerId,
  gameMode,
  disabled = false,
  scoreHistory,
  statHistory,
  foulHistory,
  showThreePoint,
  onPlayerSelect,
  onSubstitute,
  onCoachFoul,
  actionHistoryHandlers,
  teamFouls,
  timeoutUsed,
  onTimeoutRequest,
  onTimeoutCancel,
}: TeamPanelProps) {
  const side = teamId === 'teamA' ? 'team-a' : 'team-b';
  // 記録済みなら取り消し、未記録なら記録。取り消し先が無い場合だけ従来どおり押せなくする
  const timeoutAction = timeoutUsed ? onTimeoutCancel : onTimeoutRequest;

  return (
    <div className={`team-panel ${side} color-${teamColor} ${isActive ? 'active' : ''}`}>
      <div className="team-panel-header">
        <span className="team-name">{teamName}</span>
        {/* チーム帰属の状態(TF・タイムアウト)はチームパネル側に表示する */}
        <div className="team-panel-status">
          {teamFouls !== undefined && (
            <span className={`tf-badge ${teamFouls >= 4 ? 'bonus' : ''}`}>TF {teamFouls}</span>
          )}
          {onTimeoutRequest && (
            <button
              className={`btn-timeout-chip ${timeoutUsed ? 'used' : ''}`}
              onClick={timeoutAction}
              disabled={!timeoutAction}
              aria-label={timeoutUsed ? 'タイムアウトを取り消す' : 'タイムアウト'}
              title={timeoutUsed ? 'タイムアウト記録済み（タップで取り消し）' : 'タイムアウト'}
            >
              ⏱ {timeoutUsed ? '済' : '残1'}
            </button>
          )}
        </div>
      </div>
      <div className="team-players">
        {players.filter(p => p.isOnCourt).map(player => {
          const displayName = player.courtName || player.name;
          // 退場・失格は審判へ即時に伝える必要がある。4個目と同じ見た目だと気づけない。
          // 5ファウルだけでなく D 1つ・T/U 2つも見る。どちらも5個目より先に来るため、
          // 数だけで判定すると失格した選手が通常表示のまま残る（詳細は disqualification.ts）。
          // ただしコートからは外さない（練習試合では同意のうえで続行する運用がある）
          const disqualification = getDisqualification(player.fouls);
          const fouledOut = disqualification !== null;
          return (
            <button
              type="button"
              key={player.id}
              className={`mini-player-card ${selectedPlayerId === player.id ? 'selected' : ''}`}
              onClick={() => onPlayerSelect(player.id, teamId)}
              disabled={disabled}
              aria-pressed={selectedPlayerId === player.id}
              aria-label={`#${formatPlayerNumber(player.number)} ${displayName} ${player.stats.points}点${player.fouls.length > 0 ? ` ファウル${player.fouls.length}` : ''}${disqualification ? ` ${shortDisqualificationLabel(disqualification)}` : ''}`}
            >
              {/* 名前はフルモードなら両チームとも出す。相手の得点・ファウル・FTも
                  このアプリで記録するので、相手だけ番号で人を選ばせる理由がない。
                  aria-label には元から名前が入っていたため、出さないと
                  「読み上げ利用者だけ名前が読める」という逆転にもなっていた。
                  シンプルモードはカードの幅が狭いので従来どおり番号と得点だけ */}
              <span className="player-num">
                #{formatPlayerNumber(player.number)}
                {gameMode === 'full' && displayName ? ` ${displayName}` : ''}
              </span>
              <span className="player-pts">{player.stats.points}</span>
              {/* ファウル0でも要素は残す。条件描画にすると、この要素が持つ margin-left:auto が
                  消えてカード内の余白配分が変わり、ファウル発生や選手選択のたびに
                  得点の表示位置が最大32px動いてしまう（記録中に視線が迷う） */}
              <span
                className={`player-fouls ${fouledOut ? 'fouled-out' : player.fouls.length >= 4 ? 'warning' : ''}`}
                aria-hidden={player.fouls.length === 0}
              >
                {player.fouls.length > 0 ? `F${player.fouls.length}` : ''}
              </span>
              {/* 選択中の目印。aria-pressedで状態は伝わるので読み上げからは外す */}
              {selectedPlayerId === player.id && (
                <span className="player-check" aria-hidden="true">✓</span>
              )}
            </button>
          );
        })}
        {/*
          シンプルモードは .team-bench を隠すので（App.css）、そこにある
          交代とベンチファウルの導線をここへ持ってくる。以前は交代だけを
          出していたため、コーチ・A.コーチ・ベンチ関係者・交代要員の
          テクニカルを記録する手段がシンプルモードから消えていた。
          800px以下は自動でシンプルモードになる（useGameMode）ので、
          iPad縦持ちとスマホでは既定でその状態だった。

          2つで選手カード1枚分の枠を分け合う。別々の枠にすると、
          コート上の5人＋ボタンで1行増え、いちばん狭い画面で
          得点ボタンが押し出される
        */}
        {gameMode === 'simple' && (
          <div className="simple-bench-actions">
            <button
              className="simple-sub-btn"
              onClick={onSubstitute}
              disabled={disabled}
              aria-label="選手交代"
            >
              <span aria-hidden="true">🔄</span>
              <span className="simple-btn-label">交代</span>
            </button>
            <button
              className="simple-bench-foul-btn"
              onClick={onCoachFoul}
              disabled={disabled}
              aria-label="ベンチファウル"
            >
              <span aria-hidden="true">⚠️</span>
              <span className="simple-btn-label">ベンチ</span>
            </button>
          </div>
        )}
      </div>
      <div className="team-bench">
        <div className="bench-actions">
          {/* 記録を増やす操作なので、アクションボタン・選手カードと同じ条件で止める。
              交代は quartersPlayed に出場記録を書き、ベンチファウルは
              ファウル・FT試投・得点をまとめて足す（foulHandlers）。
              disabled が抜けていたため、「新しい記録の追加はできません」と
              確認した後の画面から最終スコアを動かせていた */}
          <button className="btn btn-small btn-secondary" onClick={onSubstitute} disabled={disabled}>
            交代
          </button>
          <button className="btn btn-small btn-danger" onClick={onCoachFoul} disabled={disabled}>
            ベンチ<br />ファウル
          </button>
        </div>
      </div>
      {gameMode === 'full' && (
        <ActionHistory
          teamId={teamId}
          teamName={teamName}
          scoreHistory={scoreHistory}
          statHistory={statHistory}
          foulHistory={foulHistory}
          players={players}
          showThreePoint={showThreePoint}
          {...actionHistoryHandlers}
        />
      )}
    </div>
  );
}
