// jsdom はレイアウトを持たないため scrollIntoView を実装していない。
// 実ブラウザでは全環境にあるAPIなので、アプリ側で存在チェックを増やすのではなく
// テスト環境側で補う。
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() { };
}
