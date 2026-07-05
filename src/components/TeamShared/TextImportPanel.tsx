interface TextImportPanelProps {
    importText: string;
    updateImportText: (text: string) => void;
    textValidation: { valid: boolean; message: string } | null;
    onSubmit: () => void;
    onCancel: () => void;
}

export function TextImportPanel({ importText, updateImportText, textValidation, onSubmit, onCancel }: TextImportPanelProps) {
    return (
        <div className="text-import-panel">
            <h4>📝 JSONデータの貼り付け</h4>
            <p className="text-import-hint">MBCscoreの「エクスポート」や「クリップボードにコピー」で取得したJSONデータを貼り付けてください。</p>
            <textarea
                className="text-import-textarea"
                value={importText}
                onChange={e => updateImportText(e.target.value)}
                placeholder='ここにコピーしたデータを貼り付けてください'
                rows={10}
                style={{ minHeight: '200px' }}
            />
            {textValidation && (
                <p className={`text-validation ${textValidation.valid ? 'valid' : 'invalid'}`}>
                    {textValidation.message}
                </p>
            )}
            <div className="text-import-actions">
                <button className="btn btn-secondary" onClick={onCancel}>キャンセル</button>
                <button className="btn btn-primary" onClick={onSubmit} disabled={!importText.trim()}>読み込む</button>
            </div>
        </div>
    );
}
