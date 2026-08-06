// フォーム部品にアクセシブルな名前が付いているかを調べるテスト用ヘルパー。
//
// このアプリは role="radiogroup" や aria-label を丁寧に当てている一方で、
// 素の <label> は htmlFor / id を持たずに置かれている箇所が多かった。
// 読み上げで何の入力欄か分からないうえ、ラベルをタップしても入力欄に
// フォーカスが移らない（タップ範囲が広がらない）。

/** name / type / placeholder だけを持つ、表示用の軽い記述 */
export interface UnlabeledField {
    tag: string;
    type: string;
    placeholder: string;
}

/** ラベルと結び付いていないフォーム部品を列挙する */
export function findUnlabeledFields(root: HTMLElement | Document = document): UnlabeledField[] {
    const fields = root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input, select, textarea',
    );

    return [...fields]
        .filter(el => {
            // 非表示の入力（ファイル選択のトリガ等）は読み上げ対象外
            if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
            if (el.style.display === 'none') return false;

            const hasLabel = el.labels !== null && el.labels.length > 0;
            const hasAriaLabel = !!el.getAttribute('aria-label');
            const hasAriaLabelledBy = !!el.getAttribute('aria-labelledby');
            const hasTitle = !!el.getAttribute('title');
            return !(hasLabel || hasAriaLabel || hasAriaLabelledBy || hasTitle);
        })
        .map(el => ({
            tag: el.tagName,
            type: el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase(),
            placeholder: (el as HTMLInputElement).placeholder ?? '',
        }));
}
