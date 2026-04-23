/**
 * script.js
 * ホールデム 役判定クイズ — ゲームロジック
 *
 * 【目次】
 *  1.  定数：カードデータの定義
 *  2.  変数：ゲームの状態管理
 *  3.  startQuiz()         ゲームを開始する
 *  4.  createDeck()        52枚のデッキを生成する
 *  5.  shuffle()           配列をランダムに並び替える
 *  6.  combinations()      全組み合わせを列挙する（再帰）
 *  7.  evaluateHand()      5枚の手役を評価する（役判定の核心）
 *  8.  compareHands()      2つの手役を比較する
 *  9.  getBestHand()       7枚から最強の5枚を選ぶ
 * 10.  rankNumToName()     ランク数値 → 表示文字に変換する
 * 11.  getValueRole()      役と比較インデックスから決め手の名称を返す
 * 12.  explainResult()     勝敗の詳細解説文を生成する
 * 13.  createCardEl()      カードのDOM要素を1枚生成する
 * 14.  renderCards()       カード一覧をコンテナに描画する
 * 15.  nextQuestion()      次の問題を生成して画面を初期化する
 * 16.  updateTimerDisplay() タイマー表示（数値＋バー）を更新する
 * 17.  tickTimer()         0.1秒ごとに呼ばれるタイマー処理
 * 18.  toggleTimer()       タイマーのON/OFFを切り替える
 * 19.  answer()            回答を処理する
 * 20.  updateStreakDisplay() 連続正解数（ストリーク）表示を更新する
 * 21.  executeShare()      シェアボタンをタップしたときの処理（Web Share API）
 * 22.  getAnswerLabel()    正解の表示用ラベル文字列を返す
 * 23.  addToReviewList()   間違えた問題を復習リストに追加して保存する
 * 24.  renderReviewList()  復習リストを画面に描画する
 * 25.  deleteHistory()     復習リストの全履歴を削除する
 * 26.  DOMContentLoaded    ページ読み込み完了時の初期化処理
 */


/* =========================================================
   1. 定数：カードデータの定義
   ========================================================= */

// スートの記号（4種類）
const SUITS = ['♠', '♥', '♦', '♣'];

// ランクの表示名（弱い順：2〜A）
const RANK_NAMES = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

// 表示名 → 強さ数値への変換テーブル（数値が大きいほど強い）
const RANK_VALUES = {
  '2':2,  '3':3,  '4':4,  '5':5,  '6':6,  '7':7,
  '8':8,  '9':9,  '10':10, 'J':11, 'Q':12, 'K':13, 'A':14
};

// 役の強さ番号（0〜8）と日本語名の対応（番号が大きいほど強い役）
const HAND_NAMES = [
  'ハイカード',             // 0：役なし
  'ワンペア',               // 1：同ランク2枚
  'ツーペア',               // 2：ペアが2組
  'スリーカーズ',           // 3：同ランク3枚
  'ストレート',             // 4：連続した5枚
  'フラッシュ',             // 5：同スート5枚
  'フルハウス',             // 6：スリーカーズ + ペア
  'フォーカーズ',           // 7：同ランク4枚
  'ストレートフラッシュ',   // 8：ストレート + フラッシュ
];


/* =========================================================
   2. 変数：ゲームの状態管理
   ========================================================= */

let correctCount      = 0;     // 正解数（累計）
let totalCount        = 0;     // 回答総数
let streakCount       = 0;     // 連続正解数（正解で+1、不正解/タイムアウトで0にリセット）
let currentAnswer     = null;  // 現在の問題の正解（'A' / 'B' / 'chop'）
let timerInterval     = null;  // setInterval のID（タイマーを止めるために保持する）
let timeLeft          = 10.0;  // タイマーの残り時間（秒）
let answered          = false; // 回答済みフラグ（二重回答防止）
let timerEnabled      = true;  // タイマーON/OFFフラグ（初期値：ON）
let reviewList        = [];    // 復習リスト（間違えた問題のデータを蓄積）
let currentQuestionData = null;// 現在の問題データ（回答後の表示・復習登録に使用）


/* =========================================================
   3. startQuiz() — ゲームを開始する
   スタートボタン（onclick="startQuiz()"）から呼ばれる
   ========================================================= */
function startQuiz() {
  // ホーム画面を非表示にする
  document.getElementById('home-screen').style.display = 'none';

  // クイズ画面と復習リストを表示する
  document.getElementById('quiz-screen').style.display = 'flex';
  document.getElementById('review-section').style.display = 'block';

  // localStorage から保存済みの復習リストを読み込む
  // localStorage：ページを閉じても消えないブラウザ内のストレージ
  const saved = localStorage.getItem('poker_review');
  if (saved) {
    try {
      reviewList = JSON.parse(saved);  // JSON文字列 → JavaScriptオブジェクトに変換
    } catch(e) {
      reviewList = [];  // データが壊れている場合は無視してリセット
    }
  }
  renderReviewList();  // 復習リストを画面に描画する

  // 最初の問題を生成する
  nextQuestion();
}


/* =========================================================
   4. createDeck() — 52枚のデッキを生成する
   各カードは {rank: 数値, suit: 記号, display: 表示文字} のオブジェクト
   ========================================================= */
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const name of RANK_NAMES) {
      deck.push({ rank: RANK_VALUES[name], suit, display: name });
    }
  }
  return deck;  // 4スート × 13ランク = 52枚
}


/* =========================================================
   5. shuffle() — 配列をランダムに並び替える
   フィッシャー=イェーツ法：統計的に偏りのないアルゴリズム
   元の配列は変えず、コピーを返す
   ========================================================= */
function shuffle(arr) {
  const a = [...arr];  // スプレッド構文でコピーして元データを保護
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];  // 分割代入で2変数を同時に交換
  }
  return a;
}


/* =========================================================
   6. combinations() — 配列から k 枚選ぶ全組み合わせを返す（再帰関数）
   7枚から5枚選ぶ場合 C(7,5) = 21通り全てを列挙する
   ========================================================= */
function combinations(arr, k) {
  if (k === 0) return [[]];       // 0枚選ぶ → 空の組み合わせ1通り（再帰の終了条件）
  if (arr.length < k) return [];  // 選べる枚数が足りない → 0通り

  const [first, ...rest] = arr;   // 先頭要素と残り配列に分解

  return [
    // 「先頭を含む (k-1) 枚の組み合わせ」と先頭要素を結合したもの
    ...combinations(rest, k - 1).map(c => [first, ...c]),
    // 「先頭を含まない k 枚の組み合わせ」
    ...combinations(rest, k)
  ];
}


/* =========================================================
   7. evaluateHand() — 5枚の手役を評価する（ポーカー役判定の核心ロジック）

   引数   ：cards（5枚のカードオブジェクトの配列）
   戻り値 ：{
             rank  ：役の強さ（0=ハイカード〜8=ストレートフラッシュ）
             value ：同役間の強さ比較用の数値配列
             cards ：評価した5枚
           }
   ========================================================= */
function evaluateHand(cards) {

  // ① ランクを降順に並べる（強いものを先頭に）
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);

  // ② フラッシュ判定：5枚のスートが全て同じか
  // every() は全要素が条件を満たす場合のみ true を返す
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  // ③ ストレート判定：ランクが5連続しているか
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
  let isStraight   = false;
  let straightHigh = 0;  // ストレートの最高ランク（比較に使用）

  if (uniqueRanks.length === 5) {
    // ランクが5種類ある（ペアがない）ことがストレートの前提

    if (uniqueRanks[0] - uniqueRanks[4] === 4) {
      // 通常のストレート：最高と最低の差がちょうど4（例：9-8-7-6-5）
      isStraight   = true;
      straightHigh = uniqueRanks[0];

    } else if (uniqueRanks[0] === 14 && uniqueRanks[1] === 5) {
      // ホイール（A-2-3-4-5）：Aをローとして使う最弱ストレート
      // uniqueRanks は [14, 5, 4, 3, 2] のパターン
      isStraight   = true;
      straightHigh = 5;  // 実質的な強さは「5ハイ」
    }
  }

  // ④ 各ランクの出現回数を数える
  // 例：{14:2, 13:1, 5:2} → Aのペア、Kシングル、5のペア
  const freq = {};
  ranks.forEach(r => freq[r] = (freq[r] || 0) + 1);

  // 出現回数が多い順 → 同数ならランクが高い順で並べた配列
  // これが同役間の強さ比較（value）に使われる
  const ranksByFreq = Object.entries(freq)
    .sort((a, b) => {
      const diff = b[1] - a[1];          // 出現回数が多い順
      return diff !== 0 ? diff : parseInt(b[0]) - parseInt(a[0]);
    })
    .map(e => parseInt(e[0]));

  // 出現回数だけの配列（例：フォーカーズ→[4,1]、フルハウス→[3,2]）
  const counts = Object.values(freq).sort((a, b) => b - a);

  // ⑤ 強い役から順にチェックして返す
  if (isFlush && isStraight)              return { rank: 8, value: [straightHigh], cards };
  if (counts[0] === 4)                    return { rank: 7, value: ranksByFreq,    cards };
  if (counts[0] === 3 && counts[1] === 2) return { rank: 6, value: ranksByFreq,    cards };
  if (isFlush)                            return { rank: 5, value: ranks,          cards };
  if (isStraight)                         return { rank: 4, value: [straightHigh], cards };
  if (counts[0] === 3)                    return { rank: 3, value: ranksByFreq,    cards };
  if (counts[0] === 2 && counts[1] === 2) return { rank: 2, value: ranksByFreq,    cards };
  if (counts[0] === 2)                    return { rank: 1, value: ranksByFreq,    cards };
  return                                         { rank: 0, value: ranks,          cards };
}


/* =========================================================
   8. compareHands() — 2つの手役を比較する
   戻り値：1 = h1勝ち、-1 = h2勝ち、0 = 同じ（チョップ）
   ========================================================= */
function compareHands(h1, h2) {
  // まず役の種類を比較（例：フラッシュ[5] vs ペア[1] → フラッシュの勝ち）
  if (h1.rank !== h2.rank) return h1.rank > h2.rank ? 1 : -1;

  // 同じ役なら value 配列を先頭から順番に比較（キッカー比較）
  // 例：ワンペア同士、Aのペア vs Kのペア → 最初の値で決定
  for (let i = 0; i < Math.max(h1.value.length, h2.value.length); i++) {
    const v1 = h1.value[i] || 0;
    const v2 = h2.value[i] || 0;
    if (v1 !== v2) return v1 > v2 ? 1 : -1;
  }

  return 0;  // 全て同じ → チョップ（引き分け）
}


/* =========================================================
   9. getBestHand() — 7枚の中から最強の5枚を選ぶ
   C(7,5) = 21通りの組み合わせを全て試して最強を返す
   ========================================================= */
function getBestHand(holeCards, communityCards) {
  const allCards = [...holeCards, ...communityCards];  // ホール2枚＋コミュニティ5枚 = 7枚
  const combos   = combinations(allCards, 5);           // 21通りの5枚組を列挙

  let best = null;
  for (const combo of combos) {
    const hand = evaluateHand(combo);
    if (!best || compareHands(hand, best) > 0) best = hand;
  }
  return best;  // 最強の手役（best.cards が最強の5枚）
}


/* =========================================================
   10. rankNumToName() — ランク数値 → 表示文字に変換する
   例：14 → 'A'、13 → 'K'、11 → 'J'
   ========================================================= */
function rankNumToName(n) {
  const map = {
    2:'2', 3:'3', 4:'4', 5:'5', 6:'6', 7:'7',
    8:'8', 9:'9', 10:'10', 11:'J', 12:'Q', 13:'K', 14:'A'
  };
  return map[n] || String(n);
}


/* =========================================================
   11. getValueRole() — 役と比較インデックスから決め手の名称を返す
   rank  ：役の種類（0〜8）
   index ：value 配列の何番目で差がついたか
   ========================================================= */
function getValueRole(rank, index) {
  switch (rank) {
    case 0:  // ハイカード：全てのカードを高い順にキッカー比較する
      return index === 0 ? 'ハイカード' : `${index + 1}番目に高いカード`;
    case 1:  // ワンペア：ペアのランク → キッカー1 → キッカー2 → キッカー3
      return index === 0 ? 'ペアのランク' : `キッカー（${index}枚目）`;
    case 2:  // ツーペア：上のペア → 下のペア → キッカー
      if (index === 0) return '上のペアのランク';
      if (index === 1) return '下のペアのランク';
      return 'キッカーのランク';
    case 3:  // スリーカーズ：スリーのランク → キッカー1 → キッカー2
      return index === 0 ? 'スリーカーズのランク' : `キッカー（${index}枚目）`;
    case 4:  // ストレート：トップカードのみで比較
      return 'ストレートのトップカード';
    case 5:  // フラッシュ：5枚を高い順に比較
      return index === 0 ? 'フラッシュのトップカード' : `${index + 1}番目に高いカード`;
    case 6:  // フルハウス：スリーのランク → ペアのランク
      return index === 0 ? 'スリーカーズのランク' : 'ペアのランク';
    case 7:  // フォーカーズ：クアッズのランク → キッカー
      return index === 0 ? 'フォーカーズのランク' : 'キッカーのランク';
    case 8:  // ストレートフラッシュ：トップカードのみ
      return 'ストレートフラッシュのトップカード';
    default:
      return '比較カード';
  }
}


/* =========================================================
   12. explainResult() — 勝敗の詳細解説文を生成する

   引数：
     bestA   ：プレイヤーAのベストハンド（evaluateHand の戻り値）
     bestB   ：プレイヤーBのベストハンド
     winner  ：正解（'A' / 'B' / 'chop'）
   戻り値：
     日本語の解説文字列
     例：「両者ともフラッシュ。フラッシュのトップカードで
          プレイヤーBのK（13）がプレイヤーAの7（7）より強いためBの勝ちです。」
   ========================================================= */
function explainResult(bestA, bestB, winner) {
  const rankA = bestA.rank;
  const rankB = bestB.rank;

  /* ケース1：役の種類が異なる（例：フラッシュ vs ワンペア） */
  if (rankA !== rankB) {
    const wBest = winner === 'A' ? bestA : bestB;
    const lBest = winner === 'A' ? bestB : bestA;
    const wName = winner === 'A' ? 'A' : 'B';
    const lName = winner === 'A' ? 'B' : 'A';
    return `プレイヤー${wName}の「${HAND_NAMES[wBest.rank]}」が`
         + `プレイヤー${lName}の「${HAND_NAMES[lBest.rank]}」より強い役です。`;
  }

  const hand = HAND_NAMES[rankA];  // 両者同じ役名

  /* ケース2：同じ役でチョップ */
  if (winner === 'chop') {
    return `両者とも「${hand}」で、全てのカードの強さが完全に同じためチョップ（引き分け）です。`;
  }

  /* ケース3：同じ役で勝敗がつく → value 配列で決め手となったカードを特定する */
  const wBest = winner === 'A' ? bestA : bestB;
  const lBest = winner === 'A' ? bestB : bestA;
  const wName = winner === 'A' ? 'A' : 'B';
  const lName = winner === 'A' ? 'B' : 'A';

  const maxLen = Math.max(wBest.value.length, lBest.value.length);
  for (let i = 0; i < maxLen; i++) {
    // value[i] が undefined の場合は 0 として扱う
    const vw = (wBest.value[i] !== undefined) ? wBest.value[i] : 0;
    const vl = (lBest.value[i] !== undefined) ? lBest.value[i] : 0;

    if (vw !== vl) {
      const role  = getValueRole(rankA, i);  // 「ペアのランク」「キッカー（1枚目）」など
      const wCard = rankNumToName(vw);        // 例：'K'
      const lCard = rankNumToName(vl);        // 例：'7'
      return `両者とも「${hand}」。`
           + `${role}でプレイヤー${wName}の${wCard}（${vw}）が`
           + `プレイヤー${lName}の${lCard}（${vl}）より強いため${wName}の勝ちです。`;
    }
  }

  // ここに到達することは通常ない（compareHands と整合していれば）
  return `両者とも「${hand}」で同じ強さのためチョップです。`;
}


/* =========================================================
   13. createCardEl() — カードのDOM要素を1枚生成して返す

   引数：
     card          ：カードオブジェクト {rank, suit, display}
     highlighted   ：true = ゴールド枠（ベストハンドのボード由来カード）
     holeHighlight ：true = シアン枠（ベストハンドの手札由来カード）
     size          ：'lg'（大：コミュニティ/ホール用）または 'sm'（小：ベストハンド用）
     dimmed        ：true = トーンダウン（ベストハンドに入らなかったホールカード）
   ========================================================= */
function createCardEl(card, highlighted = false, holeHighlight = false, size = 'lg', dimmed = false) {
  const div = document.createElement('div');

  // ハートとダイヤは赤、スペードとクラブは黒
  const colorClass = (card.suit === '♥' || card.suit === '♦') ? 'red' : 'black';

  /*
    ハイライト種類の決定（優先順位：hole-card > highlight > dimmed）
    - hole-card ：シアン枠（ベストハンドに入った手札）
    - highlight ：ゴールド枠（ベストハンドに入ったボードカード）
    - dimmed    ：トーンダウン（ベストハンドに入らなかった手札）
  */
  let hlClass = '';
  if (holeHighlight)    hlClass = ' hole-card';   // シアン枠（手札由来・採用）
  else if (highlighted) hlClass = ' highlight';   // ゴールド枠（ボード由来・採用）
  else if (dimmed)      hlClass = ' dimmed';      // トーンダウン（不採用）

  div.className = `card card-${size} ${colorClass}${hlClass}`;

  // カードの中身：ランク文字とスート記号を縦に並べる
  div.innerHTML =
    `<span class="card-rank">${card.display}</span>` +
    `<span class="card-suit">${card.suit}</span>`;

  return div;
}


/* =========================================================
   14. renderCards() — カード一覧を指定コンテナ要素に描画する

   引数：
     containerId         ：描画先要素のID
     cards               ：描画するカードの配列
     highlightCards      ：ゴールド枠対象カードの配列（ボード由来）
     holeHighlightCards  ：シアン枠対象カードの配列（手札由来）
     size                ：'lg' または 'sm'
     dimOthers           ：true のとき、どのハイライトにも該当しないカードをトーンダウン
   ========================================================= */
function renderCards(containerId, cards, highlightCards = [], holeHighlightCards = [], size = 'lg', dimOthers = false) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';  // 既存の内容を全て削除してリセット

  // Set に変換して O(1) で高速に「含まれているか」を判定できるようにする
  // キーは「ランク数値 + スート記号」（例："14♠"）で52枚を一意に識別する
  const hlSet   = new Set(highlightCards.map(c => `${c.rank}${c.suit}`));
  const holeSet = new Set(holeHighlightCards.map(c => `${c.rank}${c.suit}`));

  for (const card of cards) {
    const key         = `${card.rank}${card.suit}`;
    const isHole      = holeSet.has(key);   // 手札由来（シアン枠対象）か
    const isHighlight = hlSet.has(key);     // ゴールド枠対象か

    /*
      dimOthers が true かつ、どのハイライトにも該当しない場合にトーンダウンする
      例：ホールカード2枚のうち1枚しかベストハンドに使われなかったとき、
          使われなかった1枚に .dimmed クラスが付いて半透明・グレーになる
    */
    const isDimmed = dimOthers && !isHole && !isHighlight;

    container.appendChild(createCardEl(card, isHighlight, isHole, size, isDimmed));
  }
}


/* =========================================================
   15. nextQuestion() — 次の問題を生成して画面を初期化する
   ========================================================= */
function nextQuestion() {
  // 動いているタイマーがあれば止める
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // 状態フラグをリセット
  answered = false;
  timeLeft  = 10.0;

  /* ---- UIをリセット ---- */

  // 「次の問題へ」ボタンを非表示にする
  document.getElementById('next-btn').style.display = 'none';

  // ベストハンドセクションを非表示にする（回答後に展開される）
  document.getElementById('player-a-best-section').style.display = 'none';
  document.getElementById('player-b-best-section').style.display = 'none';

  // 役名をクリアする
  document.getElementById('player-a-hand-name').textContent = '';
  document.getElementById('player-b-hand-name').textContent = '';

  // 結果ボックスを非表示にする
  document.getElementById('result-box').style.display     = 'none';
  document.getElementById('result-answer').style.display   = 'none';
  document.getElementById('result-explain').style.display  = 'none';

  // シェアボタンも非表示にリセットする（次の問題では新たに表示される）
  document.getElementById('share-btn').style.display = 'none';

  // タイマーバーをリセットする（幅100%、シアン色）
  const fill = document.getElementById('timer-fill');
  fill.style.width = '100%';
  fill.classList.remove('warn');

  // 回答ボタンを全て有効化する
  document.querySelectorAll('.answer-btn').forEach(btn => btn.disabled = false);

  /* ---- 新しいカードを配る ---- */

  const deck      = shuffle(createDeck());       // 52枚をシャッフル
  const community = deck.slice(0, 5);            // 先頭5枚：コミュニティカード
  const holeA     = deck.slice(5, 7);            // 次の2枚：プレイヤーAのホールカード
  const holeB     = deck.slice(7, 9);            // 次の2枚：プレイヤーBのホールカード

  // カードを画面に描画（大サイズ、ハイライトなし）
  renderCards('community-cards', community, [], [], 'lg');
  renderCards('player-a-hole',   holeA,     [], [], 'lg');
  renderCards('player-b-hole',   holeB,     [], [], 'lg');

  /* ---- 正解を計算する ---- */

  // 7枚（ホール2枚＋コミュニティ5枚）から各プレイヤーの最強の5枚を求める
  const bestA = getBestHand(holeA, community);
  const bestB = getBestHand(holeB, community);

  // 強さを比較して正解を決定する
  const cmp = compareHands(bestA, bestB);
  if      (cmp > 0) currentAnswer = 'A';
  else if (cmp < 0) currentAnswer = 'B';
  else              currentAnswer = 'chop';

  // 回答後の表示・復習登録のために問題データを保存する
  currentQuestionData = { community, holeA, holeB, bestA, bestB };

  /* ---- タイマーを開始する ---- */
  // timerEnabled が true の時だけカウントダウンを開始する
  if (timerEnabled) {
    updateTimerDisplay();
    // setInterval：100ミリ秒（0.1秒）ごとに tickTimer() を繰り返し呼び出す
    timerInterval = setInterval(tickTimer, 100);
  } else {
    // タイマーOFF時はバー表示だけリセットしてカウントダウンはしない
    document.getElementById('timer-display').textContent = '10.00';
  }
}


/* =========================================================
   16. updateTimerDisplay() — タイマー表示（数値 + バー）を更新する
   ========================================================= */
function updateTimerDisplay() {
  // 残り時間を小数点以下2桁で表示（例：「8.50」）
  document.getElementById('timer-display').textContent = timeLeft.toFixed(2);

  // バーの幅を残り時間の割合に合わせる（10秒 → 100%、0秒 → 0%）
  const fill = document.getElementById('timer-fill');
  fill.style.width = (timeLeft / 10 * 100) + '%';

  // 残り3秒以下で警告の赤色に変える
  if (timeLeft <= 3.0) fill.classList.add('warn');
}


/* =========================================================
   17. tickTimer() — 0.1秒ごとに呼ばれるタイマー処理
   ========================================================= */
function tickTimer() {
  timeLeft -= 0.1;

  // 浮動小数点演算の誤差（例：10.0 - 0.1 が 9.9999...になる）を防ぐため丸める
  timeLeft = Math.round(timeLeft * 100) / 100;
  if (timeLeft < 0) timeLeft = 0;

  updateTimerDisplay();

  // 残り0秒で時間切れ処理
  if (timeLeft === 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    answer('timeout');  // 時間切れとして不正解扱いで処理する
  }
}


/* =========================================================
   18. toggleTimer() — タイマーのON/OFFを切り替える
   タイマーエリアの「⏱ ON / OFF」ボタン（onclick="toggleTimer()"）から呼ばれる
   ========================================================= */
function toggleTimer() {
  timerEnabled = !timerEnabled;  // フラグを反転（true→false / false→true）

  const btn     = document.getElementById('timer-toggle-btn');
  const content = document.getElementById('timer-content');
  const offMsg  = document.getElementById('timer-off-msg');

  if (timerEnabled) {
    /* --- タイマーをONにする --- */
    btn.textContent       = '⏱ ON';
    btn.classList.remove('off');      // グレー化を解除してシアン色に戻す
    content.style.display = 'block';  // カウントダウン表示を見せる
    offMsg.style.display  = 'none';   // 「制限時間なし」テキストを隠す

    // 問題がまだ回答中の場合は、タイマーを10秒にリセットしてリスタートする
    // （途中からONにしても公平になるよう時間をリセットする）
    if (!answered) {
      timeLeft = 10.0;
      updateTimerDisplay();
      timerInterval = setInterval(tickTimer, 100);
    }

  } else {
    /* --- タイマーをOFFにする --- */
    btn.textContent       = '⏱ OFF';
    btn.classList.add('off');          // グレー色に変化
    content.style.display = 'none';   // カウントダウン表示を隠す
    offMsg.style.display  = 'block';  // 「制限時間なし」テキストを表示

    // 動いているタイマーがあれば止める
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }
}


/* =========================================================
   19. answer() — 回答を処理する
   各回答ボタン（onclick="answer('A')" 等）から呼ばれる
   引数：userAnswer = 'A', 'B', 'chop', 'timeout'（時間切れ）
   ========================================================= */
function answer(userAnswer) {
  // 既に回答済みなら何もしない（ボタンの二重押し防止）
  if (answered || !currentQuestionData) return;
  answered = true;

  // タイマーを止める
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // 回答総数を増やす
  totalCount++;

  // 正解かどうか判定する
  const isCorrect = (userAnswer === currentAnswer);
  if (isCorrect) correctCount++;

  /*
    連続正解数（ストリーク）の更新
    ・正解したとき   → streakCount を1増やす（カウントアップ）
    ・間違えたとき   → streakCount を0にリセット
    ・時間切れのとき → streakCount を0にリセット
  */
  if (isCorrect) {
    streakCount++;   // 正解：連続カウントを積み上げる
  } else {
    streakCount = 0; // 不正解・時間切れ：連続記録を終了してリセット
  }

  // スコア表示を最新の値に更新する
  document.getElementById('score-correct').textContent = correctCount;
  document.getElementById('score-total').textContent   = totalCount;

  // ストリーク表示を更新する（opacity でふわっとフェードイン/アウト）
  updateStreakDisplay();

  /* ---- ヘッドライン（正解 / 不正解）を表示する ---- */
  const hlEl = document.getElementById('result-headline');

  if (userAnswer === 'timeout') {
    hlEl.textContent = '⏰ 時間切れ！';
    hlEl.className   = 'result-headline wrong';
  } else if (isCorrect) {
    hlEl.textContent = '✅ 正解！';
    hlEl.className   = 'result-headline correct';
  } else {
    hlEl.textContent = '❌ 不正解！';
    hlEl.className   = 'result-headline wrong';
  }

  // 不正解 / 時間切れの場合のみ「正解：〇〇の勝ち」を表示する
  if (!isCorrect) {
    const ansEl = document.getElementById('result-answer');
    ansEl.textContent   = '✅ 正解：' + getAnswerLabel(currentAnswer);
    ansEl.style.display = 'block';
  }

  /* ---- 勝敗の詳細解説を生成して表示する ---- */
  const { community, holeA, holeB, bestA, bestB } = currentQuestionData;

  const explanation = explainResult(bestA, bestB, currentAnswer);
  if (explanation) {
    document.getElementById('explain-text').textContent = explanation;
    document.getElementById('result-explain').style.display = 'block';
  }

  // 結果ボックス全体を表示する
  document.getElementById('result-box').style.display = 'block';

  // シェアボタンを表示する（display:flex で中央揃えになる）
  document.getElementById('share-btn').style.display = 'flex';

  /* ---- ベストハンドと役名を公開する ---- */

  // 役名を表示する
  document.getElementById('player-a-hand-name').textContent = HAND_NAMES[bestA.rank];
  document.getElementById('player-b-hand-name').textContent = HAND_NAMES[bestB.rank];

  // ホールカード欄：
  // ・ベストハンドに採用されたカード → シアン枠（第4引数に bestCards を渡す）
  // ・採用されなかったカード        → トーンダウン（dimOthers = true）
  renderCards('player-a-hole', holeA, [], bestA.cards, 'lg', true);
  renderCards('player-b-hole', holeB, [], bestB.cards, 'lg', true);

  // ベストハンドの5枚を小サイズで表示する
  // ・第3引数（highlightCards）= bestCards → 全5枚がゴールド枠の対象
  // ・第4引数（holeHighlightCards）= holeCards → 手札由来はシアン枠に上書き
  // 結果：手札由来カード = シアン枠、ボード由来カード = ゴールド枠
  renderCards('player-a-best', bestA.cards, bestA.cards, holeA, 'sm');
  renderCards('player-b-best', bestB.cards, bestB.cards, holeB, 'sm');

  // ベストハンドセクションを展開して表示する
  document.getElementById('player-a-best-section').style.display = 'block';
  document.getElementById('player-b-best-section').style.display = 'block';

  // 回答ボタンを無効化する（再回答不可）
  document.querySelectorAll('.answer-btn').forEach(btn => btn.disabled = true);

  // 「次の問題へ」ボタンを表示する（position: fixed で画面下部に固定表示）
  document.getElementById('next-btn').style.display = 'block';

  // 間違えた場合（時間切れを含む）は復習リストに追加する
  if (!isCorrect) {
    addToReviewList({ community, holeA, holeB, bestA, bestB, correctAnswer: currentAnswer });
  }
}


/* =========================================================
   20. updateStreakDisplay() — 連続正解数（ストリーク）表示を更新する
   answer() から毎回呼ばれ、スコアバーの炎表示を切り替える
   ========================================================= */
function updateStreakDisplay() {
  const row   = document.getElementById('streak-row');
  const numEl = document.getElementById('streak-count');

  if (streakCount >= 1) {
    // 1問以上連続正解中 → 数値を更新して opacity:1 でフェードイン表示
    numEl.textContent = streakCount;
    row.style.opacity = '1';
  } else {
    // ストリークが途切れた → opacity:0 でフェードアウト（非表示）
    row.style.opacity = '0';
  }
}


/* =========================================================
   21. executeShare() — シェアボタンをタップしたときの処理
   シェアボタン（onclick="executeShare()"）から呼ばれる

   ■ Web Share API とは
     スマホの OS（iOS / Android）が標準で持つ「シェアメニュー」を
     JavaScript から呼び出せる仕組み。
     navigator.share() を実行すると OS 純正のシェートシートが開き、
     X・LINE・メール・メモなどユーザーが選んだアプリへそのまま渡せる。
     パラメータはメモリ上のオブジェクトで渡すため、
     「URLからアプリ起動 → パラメータが消える」Universal Links バグが起きない。

   ■ 2パターンに分岐する理由
     Web Share API はスマホブラウザでは広くサポートされているが
     PC の Chrome / Firefox では未対応（2025年時点）。
     navigator.share が使えない環境では X Web Intent URL に
     フォールバックする。
   ========================================================= */
function executeShare() {
  /*
    ① シェアテキストを生成する（パターン共通）
       streakCount に応じて内容を分岐させる
       ・1以上：「現在【〇】問連続正解！」と実績を強調
       ・0    ：「現在挑戦中！」に切り替える
  */
  const streakText = streakCount >= 1
    ? `現在【${streakCount}】問連続正解！`
    : `現在挑戦中！`;

  // 本文テキスト（ハッシュタグと URL は後で別に付与する）
  const bodyText = `ポーカーの役判定クイズに挑戦中！${streakText}あなたも腕試ししてみませんか？ 🃏✨`;

  // ハッシュタグ文字列（Web Share API 用は # 付き、Web Intent 用は # なし）
  const hashtagsForShare  = '#ポーカークイズ #テキサスホールデム';  // navigator.share 用
  const hashtagsForIntent = 'ポーカークイズ,テキサスホールデム';    // X Web Intent 用（# なし・カンマ区切り）

  // シェア先 URL
  const siteUrl = 'https://anzaitkm0916.github.io/poker-quiz/';

  /*
    ② パターン分岐：navigator.share が使える環境かどうかを判定する
       typeof navigator.share === 'function' で API の存在を確認する
       iOS Safari / Android Chrome は true、PC Chrome / Firefox は false になることが多い
  */
  if (typeof navigator.share === 'function') {
    /* --------------------------------------------------
       パターンA：Web Share API を使う（スマホ推奨）
       --------------------------------------------------
       navigator.share() は Promise を返す非同期関数なので
       .catch() でユーザーがキャンセルした場合のエラーを無視する。
       ・text  ：投稿本文（ハッシュタグを含む1つの文字列として渡す）
       ・url   ：シェア対象のリンク
       ※ title は多くの SNS アプリで無視されるため省略
    -------------------------------------------------- */
    navigator.share({
      text : `${bodyText}\n${hashtagsForShare}\n`,  // 本文 + ハッシュタグを改行で結合
      url  : siteUrl
    }).catch(() => {
      // ユーザーがシェートシートを「キャンセル」した場合は何もしない
      // （AbortError が発生するが無視してよい）
    });

  } else {
    /* --------------------------------------------------
       パターンB：X Web Intent URL を使う（PC フォールバック）
       --------------------------------------------------
       text / hashtags / url を個別に encodeURIComponent() して
       https://twitter.com/intent/tweet に付与する。
       window.open() はユーザー操作（クリックイベント）の中で
       呼び出すため、PC ブラウザではポップアップブロックされない。
    -------------------------------------------------- */
    const encodedText     = encodeURIComponent(bodyText);
    const encodedHashtags = encodeURIComponent(hashtagsForIntent);
    const encodedUrl      = encodeURIComponent(siteUrl);

    const intentUrl = 'https://twitter.com/intent/tweet'
      + '?text='     + encodedText
      + '&hashtags=' + encodedHashtags
      + '&url='      + encodedUrl;

    window.open(intentUrl, '_blank');
  }
}


/* =========================================================
   22. getAnswerLabel() — 正解の表示用ラベル文字列を返す
   引数   ：'A', 'B', 'chop' のいずれか
   戻り値 ：日本語の表示用文字列
   ========================================================= */
function getAnswerLabel(ans) {
  if (ans === 'A')    return '🔵 A 勝ち';
  if (ans === 'B')    return '🔴 B 勝ち';
  return '🤝 チョップ（引き分け）';
}


/* =========================================================
   23. addToReviewList() — 間違えた問題を復習リストに追加して保存する
   ========================================================= */
function addToReviewList(data) {
  const item = {
    community:     data.community.map(c => c.display + c.suit),  // 例：['A♠', 'K♥', ...]
    holeA:         data.holeA.map(c => c.display + c.suit),
    holeB:         data.holeB.map(c => c.display + c.suit),
    handNameA:     HAND_NAMES[data.bestA.rank],   // 例：'フラッシュ'
    handNameB:     HAND_NAMES[data.bestB.rank],
    correctAnswer: data.correctAnswer,
    // 解説文も復習リストに一緒に保存する
    explain:       explainResult(data.bestA, data.bestB, data.correctAnswer),
    timestamp:     new Date().toLocaleTimeString('ja-JP')
  };

  reviewList.push(item);  // メモリ上のリストに追加

  // JSON.stringify：オブジェクト → JSON文字列 に変換して localStorage に保存する
  // localStorage はページを閉じても消えないので次回起動時も復習リストが残る
  localStorage.setItem('poker_review', JSON.stringify(reviewList));

  renderReviewList();  // 画面の復習リストを更新する
}


/* =========================================================
   24. renderReviewList() — 復習リストを画面に描画する
   ========================================================= */
function renderReviewList() {
  const container = document.getElementById('review-list');
  container.innerHTML = '';  // 既存の内容を全て削除

  if (reviewList.length === 0) {
    container.innerHTML = '<div class="review-empty">まだ間違えた問題はありません 🎉</div>';
    return;
  }

  // 新しい問題が上に来るよう配列を逆順にして描画する
  // [...reviewList] でコピーしてから reverse() することで元の配列を変えない
  [...reviewList].reverse().forEach(item => {
    const div = document.createElement('div');
    div.className = 'review-item';

    // 解説文がある場合はシアン色で表示する
    const explainHtml = item.explain
      ? `<div style="color:#88ddcc;margin-top:3px">💡 ${item.explain}</div>`
      : '';

    div.innerHTML =
      `<div>🕐 ${item.timestamp}</div>` +
      `<div>🎴 Board: ${item.community.join(' ')}</div>` +
      `<div>🔵 A: ${item.holeA.join(' ')} → <strong>${item.handNameA}</strong></div>` +
      `<div>🔴 B: ${item.holeB.join(' ')} → <strong>${item.handNameB}</strong></div>` +
      `<div class="review-correct-label">✅ 正解: ${getAnswerLabel(item.correctAnswer)}</div>` +
      explainHtml;

    container.appendChild(div);
  });
}


/* =========================================================
   25. deleteHistory() — 復習リストの全履歴を削除する
   「履歴削除」ボタン（onclick="deleteHistory()"）から呼ばれる
   ========================================================= */
function deleteHistory() {
  // confirm()：誤操作防止のための確認ダイアログを表示する
  if (!confirm('復習リストを全て削除しますか？')) return;

  reviewList = [];                           // メモリ上のリストをクリア
  localStorage.removeItem('poker_review');   // localStorage からも削除する

  renderReviewList();  // 画面を更新（「まだ間違えた問題はありません」と表示）
}


/* =========================================================
   26. DOMContentLoaded — ページ読み込み完了時の初期化処理

   DOMContentLoaded：HTML の解析が完了したタイミングで発火するイベント
   index.html の <script defer> により、このファイルは HTML 解析後に
   実行されるため、このイベントは不要とも言えるが、
   明示的に書いておくことで処理の意図が明確になる
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  // ホーム画面だけが見える状態にする（クイズ・復習・次ボタンは非表示）
  document.getElementById('quiz-screen').style.display    = 'none';
  document.getElementById('review-section').style.display = 'none';
  document.getElementById('next-btn').style.display       = 'none';

  // localStorage から保存済みの復習リストを読み込んでおく
  const saved = localStorage.getItem('poker_review');
  if (saved) {
    try {
      reviewList = JSON.parse(saved);
    } catch (e) {
      reviewList = [];  // 壊れたデータは無視してリセット
    }
  }
});