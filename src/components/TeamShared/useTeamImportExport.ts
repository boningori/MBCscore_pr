// チームインポート/エクスポート共通フック
// MyTeamManager / OpponentManager / AppSettingsModal に重複していたロジックを統合

import { useState, useEffect } from 'react';
import { parseImportFile, parseImportJSON, executeImport } from '../../utils/dataBackup';
import type { ParsedImportData } from '../../utils/dataBackup';
import { showToast } from '../Toast/Toast';

export type ImportTarget = 'myTeam' | 'opponent';

export interface UseTeamImportExportOptions {
    onImported: () => void;
    defaultImportTarget?: ImportTarget;
}

export function useTeamImportExport({ onImported, defaultImportTarget = 'myTeam' }: UseTeamImportExportOptions) {
    const [pendingImport, setPendingImport] = useState<ParsedImportData | null>(null);
    const [importTarget, setImportTarget] = useState<ImportTarget>(defaultImportTarget);
    const [showTextImport, setShowTextImport] = useState(false);
    const [importText, setImportText] = useState('');
    const [textValidation, setTextValidation] = useState<{ valid: boolean; message: string } | null>(null);

    // 入力更新（空になったら即バリデーション表示をクリア — effect内setStateを避ける）
    const updateImportText = (text: string) => {
        setImportText(text);
        if (!text.trim()) {
            setTextValidation(null);
        }
    };

    // リアルタイムJSONバリデーション（500msデバウンス）
    useEffect(() => {
        if (!importText.trim()) return;
        const timer = setTimeout(() => {
            try {
                const parsed = parseImportJSON(importText.trim());
                if (parsed.type === 'unknown') {
                    setTextValidation({ valid: false, message: '有効なJSONデータを入力してください' });
                } else {
                    const typeLabel = parsed.type === 'team' ? 'チームデータ' : parsed.type === 'backup' ? '全データバックアップ' : parsed.type === 'game' ? '試合データ' : 'データ';
                    setTextValidation({ valid: true, message: `✓ ${typeLabel}が検出されました` });
                }
            } catch {
                setTextValidation({ valid: false, message: '有効なJSONデータを入力してください' });
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [importText]);

    const handleJsonImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const parsed = await parseImportFile(file);
            if (parsed.type === 'unknown') {
                showToast(`インポート失敗: ${parsed.summary}`, 'error');
            } else {
                // すべてのインポートタイプで確認画面を表示（データ損失防止）
                setPendingImport(parsed);
            }
        } catch (error) {
            showToast('インポートに失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'), 'error');
        }

        e.target.value = '';
    };

    const handleConfirmImport = () => {
        if (!pendingImport) return;
        const options = pendingImport.type === 'team' ? { teamTarget: importTarget } : undefined;
        const result = executeImport(pendingImport, options);
        if (result.success) {
            showToast(`✓ ${result.message}`, 'success');
            onImported();
        } else {
            showToast(`インポート失敗: ${result.message}`, 'error');
        }
        setPendingImport(null);
    };

    const handleCancelImport = () => {
        setPendingImport(null);
    };

    const handleImportTextSubmit = () => {
        if (!importText.trim()) return;
        const parsed = parseImportJSON(importText.trim());
        if (parsed.type === 'unknown') {
            showToast(`インポート失敗: ${parsed.summary}`, 'error');
        } else {
            // すべてのインポートタイプで確認画面を表示（データ損失防止）
            setPendingImport(parsed);
            setShowTextImport(false);
            updateImportText('');
        }
    };

    return {
        pendingImport,
        importTarget,
        setImportTarget,
        showTextImport,
        setShowTextImport,
        importText,
        updateImportText,
        textValidation,
        handleJsonImport,
        handleConfirmImport,
        handleCancelImport,
        handleImportTextSubmit,
    };
}
