import type { ParsedImportData } from '../../utils/dataBackup';
import type { ImportTarget } from './useTeamImportExport';

interface ImportConfirmPanelProps {
    pendingImport: ParsedImportData;
    importTarget: ImportTarget;
    onChangeImportTarget: (target: ImportTarget) => void;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ImportConfirmPanel({ pendingImport, importTarget, onChangeImportTarget, onConfirm, onCancel }: ImportConfirmPanelProps) {
    return (
        <div className={`import-confirm-panel ${pendingImport.hasDuplicates ? 'has-duplicates' : ''}`}>
            <h4>📋 インポート内容の確認</h4>
            <p className="import-summary">{pendingImport.summary}</p>
            {pendingImport.type === 'backup' && (
                <div className="import-danger-warning">
                    <p className="import-warning-title">⚠️ 重要な警告</p>
                    <p className="import-warning-text">
                        これは全データバックアップファイルです。<br />
                        インポートすると、<strong>試合履歴・マイチーム・対戦チーム・設定</strong>が上書きされます。
                    </p>
                </div>
            )}
            {pendingImport.type === 'backup' && (
                <div className="import-merge-info">
                    <p className="import-info">
                        📌 復元ルール:<br />
                        • 同じデータがあれば新しい方に更新されます<br />
                        • 新しいデータは追加されます<br />
                        • 既存データが削除されることはありません
                    </p>
                </div>
            )}
            {pendingImport.type === 'game' && (
                <p className="import-info">ℹ️ 試合データをインポートします。同じIDの試合がある場合は上書きされます。</p>
            )}
            {pendingImport.type === 'team' && (
                <>
                    <p className="import-info">📌 同じIDのチームが既にある場合、インポートしたデータで上書きされます。</p>
                    <div className="import-target-selector">
                        <label htmlFor="import-confirm-field-1">インポート先：</label>
                        <select id="import-confirm-field-1" value={importTarget} onChange={e => onChangeImportTarget(e.target.value as ImportTarget)}>
                            <option value="myTeam">マイチーム</option>
                            <option value="opponent">対戦チーム</option>
                        </select>
                    </div>
                </>
            )}
            {pendingImport.preview && pendingImport.preview.length > 0 && (
                <div className="import-preview">
                    {pendingImport.preview.map((line, i) => (
                        <p key={i} className="import-preview-line">{line}</p>
                    ))}
                </div>
            )}
            {pendingImport.hasDuplicates && (
                <p className="import-warning">⚠️ {pendingImport.duplicateDetails}</p>
            )}
            <div className="import-confirm-actions">
                <button className="btn btn-secondary" onClick={onCancel}>キャンセル</button>
                {pendingImport.type === 'backup' ? (
                    <button className="btn btn-danger" onClick={onConfirm}>全データをインポート（上書き）</button>
                ) : (
                    <button className="btn btn-primary" onClick={onConfirm}>
                        {pendingImport.type === 'team'
                            ? (importTarget === 'myTeam' ? 'マイチームにインポート' : '対戦チームにインポート')
                            : 'インポート実行'}
                    </button>
                )}
            </div>
        </div>
    );
}
