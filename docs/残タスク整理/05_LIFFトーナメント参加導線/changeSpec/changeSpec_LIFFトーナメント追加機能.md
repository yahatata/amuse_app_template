# ChangeSpec: ミニアプリトーナメント追加機能

## 文書情報

| 項目 | 内容 |
|------|------|
| **文書名** | ChangeSpec: ミニアプリトーナメント追加機能 |
| **作成先** | [`changeSpec_LIFFトーナメント追加機能.md`](./changeSpec_LIFFトーナメント追加機能.md)（本ファイル） |
| **正本仕様** | [`../01_仕様整理.md`](../01_仕様整理.md) |
| **調査根拠** | 実装落とし込み調査（`public/user/index.html` / `getTodayTournaments.ts` / `getUpcomingTournaments.ts` / `registerForTournament.ts` / `storeMeta/config` 周辺） |
| **実装** | **本 ChangeSpec の作成のみ。コード変更は行わない。** |

### 確定事項

- 店舗設定フィールドは `storeMeta/config.tournament.liffRegistrationEnabled` / `liffCalendarEnabled` とする。いずれも **fallback `true`**
- 上記 2 設定の**編集 UI は本 ChangeSpec の対象外**とする（店舗端末 UI からも編集しない。Firestore 等での運用変更を想定）
- `status=running` では参加可否を status で判定しない。`regEndAt` を使用する。
- `status=registered` は参加不可。表示文言は「参加締め切りしました」（優先順位 4）。
- 参加済判定は **`getTodayTournaments` の一覧 API で `isRegisteredByCurrentUser` を返却する**（必須）。`getUpcomingTournaments` では任意（§4.2）。
- `freeze` / `frozen` は本 ChangeSpec **対象外**（§8 参照）。

### 実装時の Cursor rules 確認

| 変更レイヤ | 確認ルール |
|-----------|-----------|
| `functions/src/**` | [`.cursor/rules/cloud-functions-error-logging.mdc`](../../../../.cursor/rules/cloud-functions-error-logging.mdc) |
| `lib/**` | [`.cursor/rules/flutter-loading-display.mdc`](../../../../.cursor/rules/flutter-loading-display.mdc) |
| `public/user/**` | [`.cursor/rules/line-mini-app-loading-display.mdc`](../../../../.cursor/rules/line-mini-app-loading-display.mdc) |

---

## 1. Change概要

### 目的

ミニアプリ（LIFF）のトーナメント機能について、一覧性・閲覧性・参加登録導線を改善する。

- 未入店ユーザーもトーナメント情報を閲覧可能にする
- 本日・今後・カレンダーを 1 ページのタブ UI に統合する
- 一覧カード UI を統一し、不要な運営向け情報を非表示にする
- 店舗設定による参加登録・カレンダー表示の制御を追加する
- 参加登録の確認ダイアログ・不可理由表示を追加する
- Callable 側で status / regEndAt / 店舗設定 / 参加済判定を整理する

### 対象範囲

| レイヤ | 対象 |
|--------|------|
| **LIFF FE** | `public/user/index.html`, `public/css/user.css` |
| **Cloud Functions** | `getTodayTournaments`, `getUpcomingTournaments`, `registerForTournament`、共有ヘルパー（新規） |
| **店舗設定** | `storeMeta/config.tournament.liffRegistrationEnabled`, `liffCalendarEnabled`（読み取り・fallback） |

### 対象外

- ミニアプリからのトーナメント**予約**（予約データ・仮参加データの新規作成）
- 置きバケ / リエントリー実行 / アドオン実行 / バースト / 着席 / 席移動 / 順位確定 / プライズ確定 / その他運営操作
- **`freeze` / `frozen` に関する表示・参加判定の変更**（§8）
- 店舗端末 Flutter のトーナメント運営 UI
- **LIFF トーナメント設定（`liffRegistrationEnabled` / `liffCalendarEnabled`）の編集 UI**（店舗端末・管理画面いずれも本 ChangeSpec では追加しない）
- ホーム画面へのトーナメント情報表示（仕様 §4.1：ホームには表示しない）

---

## 2. 対象ファイル一覧

### LIFF（FE）

| ファイル | 変更理由 | 変更内容 |
|---------|---------|---------|
| `public/user/index.html` | トーナメント UI・JS の実装がすべてここに集約されている | 3 ページ統合タブ化、共通カード描画、未入店閲覧解放、参加確認ダイアログ、参加不可理由・グレーアウト制御 |
| `public/css/user.css` | トーナメント関連クラス（`.tournament-item`, `.tournament-card` 等）のスタイル定義 | タブ UI、詳細展開、グレーアウトボタン |

### Cloud Functions — Callable

| ファイル | 変更理由 | 変更内容 |
|---------|---------|---------|
| `functions/src/domains/tournament_activeTournament/callables/getTodayTournaments.ts` | LIFF 本日一覧 API | cancelled 除外、status 返却整理、blind 時間、参加済判定、店舗設定返却、`snapshot` 参照修正 |
| `functions/src/domains/tournament_activeTournament/callables/getUpcomingTournaments.ts` | LIFF 今後・カレンダー一覧 API | cancelled 除外、status 返却整理、blind 時間、店舗設定返却、`snapshot` 参照修正（`isRegisteredByCurrentUser` は任意・§4.2） |
| `functions/src/domains/tournament_activeTournament/callables/registerForTournament.ts` | LIFF 参加登録 API | 店舗設定・status・regEndAt・本日判定ガード追加 |

### Cloud Functions — 共有（新規）

| ファイル | 変更理由 | 変更内容 |
|---------|---------|---------|
| `functions/src/shared/tournament/formatBlindLevelDurationText.ts`（新規） | blind 時間表示ロジックの共通化。現状 `tournament_activeTournament` 配下に表示用ヘルパーなし | `blindTemplates.levels[].duration` から「◯分 / ◯分」文字列を生成 |
| `functions/src/shared/tournament/mapScheduledTournamentForLiff.ts`（新規） | `getTodayTournaments` / `getUpcomingTournaments` の item 生成ロジックが重複 | doc → LIFF 向け item へのマッピング共通化。`includeRegistrationStatus` オプションで `isRegisteredByCurrentUser` 算出を制御 |

> blindTemplates 参照の既存実装参考: `functions/src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts` の `computeRegEndAt`（L65–107）。`snapshot.blindStructure` の読み取り参考: 同ファイル L163。

### Cloud Functions — 店舗設定

| ファイル | 変更理由 | 変更内容 |
|---------|---------|---------|
| `functions/src/shared/config/types.ts` | `TournamentConfig` 型定義 | `liffRegistrationEnabled`, `liffCalendarEnabled` 追加 |
| `functions/src/shared/config/defaults.ts` | デフォルト SSoT | 上記 2 フィールドを `true` で定義 |
| `functions/src/shared/config/configLoader.ts` | `mergeWithDefaults` / `buildFromDefaults` / `mergeConfigForUpsert` | 上記 2 フィールドの読み取り・フォールバック |

### Flutter — 店舗設定（読み取りのみ）

| ファイル | 変更理由 | 変更内容 |
|---------|---------|---------|
| `lib/services/store_config_defaults.dart` | Flutter 側デフォルト | `kDefaultTournamentLiffRegistrationEnabled`, `kDefaultTournamentLiffCalendarEnabled`（いずれも `true`） |
| `lib/services/store_config_service.dart` | `StoreConfigData` + Firestore パース | 上記 2 フィールドの購読・プロパティ追加（**編集 UI は追加しない**） |

### テスト

| ファイル | 変更理由 | 変更内容 |
|---------|---------|---------|
| `functions/__tests__/callables/registerForTournament.spec.ts` | 既存 Emulator テスト | 新ガード（店舗設定 OFF、paused、ended、regEndAt、registered）追加 |
| `functions/__tests__/callables/getTodayTournaments.spec.ts`（新規） | 現状テストなし | cancelled 除外、status、blind、isRegisteredByCurrentUser |
| `functions/__tests__/callables/getUpcomingTournaments.spec.ts`（新規） | 現状テストなし | 同上 |
| `functions/__tests__/shared/tournament/formatBlindLevelDurationText.spec.ts`（新規） | blind 表示ロジック | level 順・重複除外 |
| `functions/__tests__/config/configLoader.spec.ts` | 既存 | `tournament.liffRegistrationEnabled` / `liffCalendarEnabled` フォールバック |
| `test/services/store_config_service_test.dart` | 既存 | 新フィールドのパース |
| `test/services/store_config_phase2_test.dart` | 既存 | 同上 |

### 変更しない（参考のみ）

| ファイル | 理由 |
|---------|------|
| `functions/src/domains/tournament_activeTournament/index.ts` | Callable export 変更なし（新規 shared は Callable から import のみ） |
| `functions/src/shared/logging/serviceByFunctionEntry.ts` | `getTodayTournaments` / `getUpcomingTournaments` / `registerForTournament` は既に登録済み |

---

## 3. FE変更

### 3.1 現状（As-Is）

| 画面 | DOM | 表示関数 | トリガー |
|------|-----|---------|---------|
| 本日 | `#tournament-page` | `showTournament()` → `showPage(tournamentPageEl)` + `loadTodayTournaments()` | `#tournament-btn` onclick |
| 今後 | `#weekly-tournament-page` | `showWeeklyTournaments()` → `showPage(weeklyTournamentPageEl)` + `loadWeeklyTournaments()` | 本日画面「今後のトーナメントを見る」ボタン |
| カレンダー | `#all-tournament-calendar-page` | `showAllTournamentsCalendar()` | 今後画面「全トーナメントをカレンダー表示」ボタン |
| 日別一覧 | `#selected-date-tournament-list` | `showTournamentsForDate(dateStr)` | カレンダー日付クリック |

共通基盤: `showPage(pageElement)`（L697 付近）が全 `.page` 要素の `display` を切り替える。

カード生成は **3 箇所に重複**:

| 関数 | 行付近 | 現状 UI |
|------|--------|---------|
| `loadTodayTournaments` | L1743–1823 | `.tournament-item` + prizePool / participantCount / maxEntrants + 参加登録ボタン（常時表示） |
| `loadWeeklyTournaments` | L1832–1921 | `.tournament-card` + `toggleTournamentDetails` |
| `showTournamentsForDate` | L2343–2388 | 簡易 `.tournament-item` |

未入店制御: `updateCheckinStatusUI`（L944）で `isStaying === false` のとき `#tournament-btn` を `display: none`（L1018–1025）。

参加登録: `showTournamentRegistration`（L1982–2004）が確認なしで `registerForTournament` を直呼び。

### 3.2 DOM変更

#### 統合方針

3 つの独立ページ（L433–494）を **1 つの `#tournament-page`** に統合する。

```html
<!-- 変更後イメージ（概念） -->
<div id="tournament-page" class="page tournament-page">
  <h1>トーナメント</h1>
  <div id="tournament-tab-bar" class="tournament-tab-bar">
    <button data-tab="today">本日</button>
    <button data-tab="upcoming">今後</button>
    <button data-tab="calendar" id="tournament-calendar-tab">カレンダー</button> <!-- liffCalendarEnabled=false 時は非表示 -->
  </div>
  <div id="tournament-tab-today" class="tournament-tab-panel">...</div>
  <div id="tournament-tab-upcoming" class="tournament-tab-panel" style="display:none">...</div>
  <div id="tournament-tab-calendar" class="tournament-tab-panel" style="display:none">...</div>
  <div class="tournament-actions">
    <button class="btn secondary" onclick="showHomePage()">ホームに戻る</button>
  </div>
</div>
```

#### 削除・整理対象

| 要素 / 関数 | 対応 |
|------------|------|
| `#weekly-tournament-page` | 統合後削除 |
| `#all-tournament-calendar-page` | 統合後削除（カレンダー DOM は `#tournament-tab-calendar` 内へ移動） |
| 画面間遷移ボタン（L441–443, L456–459, L489–492） | 削除（タブに置換） |
| `weeklyTournamentPageEl`, `allTournamentCalendarPageEl` 参照（L526–528） | 整理 |
| `showWeeklyTournaments`, `showAllTournamentsCalendar` | タブ切替関数に置換 |

#### 維持する DOM / ロジック

| 要素 | 用途 |
|------|------|
| `#today-tournament-list` | 本日タブ一覧 |
| `#weekly-tournament-list` → リネーム可（例: `#upcoming-tournament-list`） | 今後タブ一覧 |
| `#tournament-calendar`, `#selected-date-tournament-list` | カレンダータブ内 |
| `window.cachedTodayTournaments`, `window.cachedWeeklyTournaments`, `allTournamentsData` | キャッシュ（流用） |

### 3.3 タブ化

#### 新規関数

```javascript
function switchTournamentTab(tabName) // 'today' | 'upcoming' | 'calendar'
```

| タブ | 初回表示時の処理 |
|------|----------------|
| `today`（デフォルト） | `loadTodayTournaments()` |
| `upcoming` | `loadWeeklyTournaments()` |
| `calendar` | 既存 `showAllTournamentsCalendar` 内のカレンダー生成ロジック |

#### カレンダータブ表示制御

- `getTodayTournaments`（または `getUpcomingTournaments`）レスポンスの `liffSettings.liffCalendarEnabled` を参照
- `false` の場合: `#tournament-calendar-tab` を非表示。タブ構成は「本日」「今後」のみ
- 初回ロード前は `#tournament-calendar-tab` を非表示にし、設定取得後に表示切替

#### `showTournament()` の変更

```javascript
window.showTournament = () => {
  showPage(tournamentPageEl);
  switchTournamentTab('today');
};
```

hash ナビ `#tournament`（L750 付近）は統合ページ + 本日タブ表示のまま維持。

### 3.4 カード共通化

#### 新規関数

```javascript
function renderTournamentCard(tournament, options)
// options: { showRegisterButton: boolean, cardIndex: number }
```

3 ローダー（`loadTodayTournaments`, `loadWeeklyTournaments`, `showTournamentsForDate`）は本関数を呼ぶだけにする。

#### 通常表示（仕様 §5.1）

| 項目 | データソース（Callable item） |
|------|------------------------------|
| トーナメント名 | `name` |
| 開始時刻 | `startAt`（FE `formatTime` / `formatDateWithDay`） |
| 参加費 | `entryFee` |
| 初期スタック | `startStack` |

#### 削除する表示（仕様 §5.4）

| 項目 | 現状削除箇所 |
|------|-------------|
| 定員（`maxEntrants`） | `loadTodayTournaments` L1773, L1817; `showTournamentsForDate` L2384 |
| プライズ（`prizePool`） | `loadTodayTournaments` L1771, L1815; `showTournamentsForDate` L2376 |
| 参加者数（`participantCount`） | `loadTodayTournaments` L1772, L1816 |
| 運営向け status バッジ | `getTournamentStatusDisplay` + `.tournament-status`（L1766, L1810 等） |

#### 詳細表示（仕様 §5.2）

- **詳細ボタン**押下でカード内展開（モーダル・別画面遷移なし）
- 現状 weekly の `toggleTournamentDetails`（L2427 付近）パターンを拡張し、**カード全体 onclick から詳細ボタン onclick に変更**

| 詳細項目 | データソース |
|---------|-------------|
| レジスト締切時刻 | `regEndAt` |
| リエントリー上限回数または可否 | `isReentry`, `maxReentries`（`0` または `false` なら「不可」、`> 0` なら「上限N回」、未設定/null なら「可」） |
| リエントリー費用 | `reentryFee`（number の場合に併記。0円も表示） |
| アドオン上限回数または可否 | `isAddon`, `addonLimitPerPlayer`（`0` または `false` なら「不可」、`> 0` なら「上限N回」、未設定/null なら「可」） |
| アドオン費用 | `addonFee`（number の場合に併記。0円も表示） |
| ブラインド時間 | `blindLevelDurationText`（Callable 新規） |

### 3.5 参加制御

#### 未入店ユーザー閲覧解放

| 箇所 | 変更 |
|------|------|
| `updateCheckinStatusUI` L1018–1025 | `#tournament-btn` は **`isStaying` に関わらず常時表示**。`#order-btn` は従来通り `isStaying` ガード維持 |
| 初期非表示（L544–546 等） | 認証前の非表示は維持可。認証後に未入店理由でトーナメントボタンを隠さない |

`isStaying` の定義（`getUserStatus.ts` L46）: `activeStays` 存在 **かつ** `isActive === true`。

#### 参加登録ボタン表示条件

| 条件 | ボタン |
|------|--------|
| タブが「本日」 **かつ** `liffSettings.liffRegistrationEnabled === true` | 表示 |
| 上記以外（今後・カレンダー、または設定 OFF） | **非表示** |

#### グレーアウト制御

`liffRegistrationEnabled === true` かつ本日タブの場合、参加不可時はボタンをグレーアウト表示する。

**`disabled` 属性は付けない**（タップで理由表示が必要なため）。代わりに:

- クラス `btn-disabled` で見た目をグレーアウト
- `aria-disabled="true"` を付与
- `click` ハンドラ内で `getRegistrationBlockReason` を再判定し、理由がある場合は `registerForTournament` を呼ばずメッセージ表示

判定関数（新規）:

```javascript
function getRegistrationBlockReason(tournament, userContext)
// userContext: { isStaying: boolean }
// 戻り値: null（参加可）| { message: string }
```

**優先順位**（仕様 §8.1 / 確定事項）:

| 順位 | 条件 | 表示文言 |
|------|------|---------|
| 1 | `status` が `ended` または `force_ended` | トーナメントは終了しました |
| 2 | `isRegisteredByCurrentUser === true` | 参加済です |
| 3 | `status === 'paused'` | トーナメントは一時停止中です |
| 4 | `status === 'registered'` **または** `regEndAt` 過ぎ | 参加締め切りしました |
| 5 | `isStaying === false` | 未入店です |

> `status=running` は上記に含めない。running 時は regEndAt のみで順位 4 を判定する（確定事項）。
>
> `cancelled` は一覧に出ないため参加不可理由にも含めない。

#### 参加不可理由の表示

- カード初期表示では理由を**常時表示しない**
- 参加不可状態の参加登録ボタンタップ時に `alert` ダイアログで表示（タイトル相当: 「参加できません」+ 理由本文）
- 表示文言は優先順位表のとおり（ですます口調）

#### 参加確認ダイアログ

`showTournamentRegistration`（L1982）を以下フローに変更:

```text
参加登録ボタン押下
  → getRegistrationBlockReason を再判定
  → 理由あり: alert で理由表示して終了（registerForTournament は呼ばない）
  → 理由なし: confirm（または専用モーダル）で確認
  → registerForTournament 呼び出し
  → 結果 alert（既存パターン維持）
  → 成功時: キャッシュクリア + loadTodayTournaments()
```

#### ページ state

トーナメントページ表示時に以下を保持:

```javascript
window.liffTournamentSettings = { liffRegistrationEnabled, liffCalendarEnabled };
window.userStayingStatus = isStaying; // getUserStatus から
```

---

## 4. Functions変更

### 4.1 getTodayTournaments

**ファイル**: `functions/src/domains/tournament_activeTournament/callables/getTodayTournaments.ts`

#### 現状の問題点（コード根拠）

| 問題 | 該当 |
|------|------|
| `status` が doc.status ではなく `freeze ? 'frozen' : 'scheduled'` で**疑似ステータス**を返却 | L213 |
| `cancelled` 除外なし | クエリ後フィルタなし |
| blind 時間未返却 | item 組み立て L207–233 |
| `data.templateSnapshot` 参照（doc 実体は `snapshot`） | L136–153 |
| 店舗設定未返却 | return L245–250 |
| 参加済判定未返却 | 同上 |

#### 変更内容

**0. 本日トーナメントの取得基準（businessDate）**

LIFF 本日タブの「本日」は `scheduledTournaments.businessDate` との一致で判定する。`startAt` の JST 暦日範囲クエリは使用しない。

`targetBusinessDate` の決定:

| 店舗状態 | targetBusinessDate |
|---------|-------------------|
| 営業中（`getCurrentBusinessDateKeyOrThrow()` 成功） | `currentBusinessDateKey` |
| 営業外（`STORE_BUSINESS_DATE_UNAVAILABLE`） | JST 暦日 `yyyy-MM-dd`（`getJstCalendarDateKey()`） |

```typescript
let targetBusinessDate: string;
try {
  targetBusinessDate = await getCurrentBusinessDateKeyOrThrow(db);
} catch (error) {
  if (errorKey === 'STORE_BUSINESS_DATE_UNAVAILABLE') {
    targetBusinessDate = getJstCalendarDateKey();
  } else {
    throw error;
  }
}

const snapshot = await db
  .collection('scheduledTournaments')
  .where('businessDate', '==', targetBusinessDate)
  .orderBy('startAt', 'asc')
  .limit(50)
  .get();
```

- 営業外でも Callable は失敗にしない（該当なしなら `success: true`, `data: []`）
- `registerForTournament` は営業中の `currentBusinessDateKey` 必須のまま（参加登録は営業外不可）

**1. cancelled 除外**

`snapshot.docs` 処理前または map 内で除外:

```typescript
const status = data.status as string | undefined;
if (status === 'cancelled' || status === 'canceled') return null;
```

（Flutter 側も `cancelled` / `canceled` 両方を除外している: `blind_timer_tournament_select_page.dart` L44）

**2. status 返却整理**

```typescript
status: data.status ?? 'scheduled',  // doc 直下をそのまま返却
```

既存 Callable の **`freeze=true` → `status='frozen'` 疑似ステータス返却を廃止**し、`scheduledTournaments.status`（doc 直下）をそのまま返す（§8 参照）。`freeze` フィールドと `status` を混同しない。

**3. blind 時間**

取得パス（仕様 §5.3）:

```text
data.snapshot.blindStructure（または blindStructureId）
  → blindTemplates/{id}
  → levels[].duration
```

`formatBlindLevelDurationText(levels)` で生成:

- `level` 昇順ソート
- `duration` を出現順ユニーク
- `` `${n}分` `` を ` / ` で join

item 追加フィールド:

```typescript
blindLevelDurationText: string;  // 例 "25分 / 20分 / 15分"。取得不能時は ""
```

**4. テンプレート情報の参照修正**

表示項目（name, entryFee, startStack, isReentry, maxReentries, addonLimitPerPlayer 等）の優先参照:

1. `data.snapshot`（`createScheduledTournament.ts` L236 で書き込み）
2. フォールバック: 既存の `templateId` → `tournamentTemplates` 一括取得

**5. isRegisteredByCurrentUser（本 API では必須）**

`mapScheduledTournamentForLiff` を `includeRegistrationStatus: true` で呼び出す。

`request.auth` がある場合のみ算出:

1. `activeStays/{uid}` から `billId` 取得
2. `bills/{billId}/tournaments/{templateId}` の存在確認（`registerForTournament.ts` L96–105 と同ロジック）

認証なし / activeStays なし: `false`

**6. liffSettings 返却**

```typescript
const config = await getStoreConfig();
return {
  success: true,
  data: tournaments,
  count: tournaments.length,
  liffSettings: {
    liffRegistrationEnabled: config.tournament?.liffRegistrationEnabled ?? true,
    liffCalendarEnabled: config.tournament?.liffCalendarEnabled ?? true,
  },
  message: '...',
};
```

**7. LIFF 非表示フィールド**

FE で使用しない以下は **返却省略を推奨**（後方互換が必要なら残置可）:

`maxEntrants`, `participantCount`, `entries`, `seatedCount`, `waitingCount`, `currentLevel`, `prizeRateBps`, `entriesPerPayout`, `addonStack`, `description`, `category`

---

### 4.2 getUpcomingTournaments

**ファイル**: `functions/src/domains/tournament_activeTournament/callables/getUpcomingTournaments.ts`

`getTodayTournaments` と **同一のマッピング共通化**（`mapScheduledTournamentForLiff.ts`）を適用。

| 変更 | 内容 |
|------|------|
| cancelled 除外 | 同上 |
| status | doc.status をそのまま返却（L232 の freeze 疑似ステータス上書き削除） |
| blindLevelDurationText | 同上 |
| isRegisteredByCurrentUser | **任意**。今後・カレンダーでは参加登録ボタンを出さないため FE 未使用。共通 mapper（`mapScheduledTournamentForLiff`）で `includeRegistrationStatus: false` とし、追加クエリを省略してよい。mapper 側で自然に返せる場合のみ返却可 |
| liffSettings | 同上 |
| includeAll | カレンダー用 `includeAll: true` でも cancelled 除外は適用 |

レスポンスキーは現状維持: `tournaments`（`data` ではない）。

---

### 4.3 registerForTournament

**ファイル**: `functions/src/domains/tournament_activeTournament/callables/registerForTournament.ts`

#### 現状ガード順序（As-Is）

1. 入力検証（zod）
2. 認証
3. トーナメント存在
4. `snapshot` / `templateId` 存在
5. `activeStays` 存在 + `billId`
6. `bills/.../tournaments/{templateId}` 重複（`TOURNAMENT_ALREADY_REGISTERED`）
7. トランザクション: `views/main` 存在、usersList 重複、置きバケ衝突
8. 書き込み + `recordTournamentAction`

#### 追加ガード（推奨順序）

| 順 | ガード | errorKey | message（ユーザー向け） |
|----|--------|----------|------------------------|
| A | `getStoreConfig()` → `tournament.liffRegistrationEnabled !== true` | `TOURNAMENT_LIFF_REGISTRATION_DISABLED` | 参加登録は現在受け付けていません |
| B | トーナメント存在（既存） | — | — |
| C | `status === 'cancelled' \|\| 'canceled'` | `TOURNAMENT_CANCELLED` | このトーナメントは開催中止になりました（一覧から除外するため通常到達しない。直接 API 呼び出し時用） |
| D | `status === 'ended' \|\| 'force_ended'` | `TOURNAMENT_ENDED` | トーナメントは終了しました |
| E | `status === 'paused'` | `TOURNAMENT_PAUSED` | トーナメントは一時停止中です |
| F | `status === 'registered'` **または** `regEndAt` 過ぎ | `TOURNAMENT_REGISTRATION_CLOSED` | 参加締め切りしました |
| G | `businessDate !== currentBusinessDateKey` | `TOURNAMENT_NOT_TODAY` | 本日のトーナメントのみ参加登録できます |
| H | `snapshot` / `templateId`（既存） | — | — |
| I | `activeStays` 未存在 / `billId` 未設定（既存） | `TOURNAMENT_INVALID_STATE` | 未入店のため参加登録できません（文言調整） |
| J | bills 重複（既存 `TOURNAMENT_ALREADY_REGISTERED`） | — | 参加済です |
| K | トランザクション内 usersList / 置きバケ（既存） | — | — |

> `status=running` は D/E/F に該当しなければ regEndAt（F）のみで判定（確定事項）。

#### 本日判定

**getTodayTournaments（一覧）**

- 営業中: `businessDate === currentBusinessDateKey`
- 営業外: `businessDate === getJstCalendarDateKey()`（JST 暦日 yyyy-MM-dd）
- いずれも `startAt` 暦日範囲は使わない

**registerForTournament（参加登録）**

- 営業中のみ: `tournamentData.businessDate === currentBusinessDateKey`（`getCurrentBusinessDateKeyOrThrow()` 必須）
- 営業外は参加不可（本日タブに表示されていても登録はエラー）

#### エラーログ

`.cursor/rules/cloud-functions-error-logging.mdc` に従い:

- 新規 errorKey は `FunctionCustomError` + `logOpsError` パターン維持
- `TOURNAMENT_*`（`TOURNAMENT_CANCELLED` 含む）は既存どおり `failed-precondition`（`mapFunctionCustomErrorToHttpsCode`）

---

## 5. 店舗設定変更

### 5.1 Firestore スキーマ

**保存先**: `storeMeta/config` ドキュメント

```json
{
  "tournament": {
    "liffRegistrationEnabled": true,
    "liffCalendarEnabled": true,
    "... 既存フィールド（defaultPrizeRatio 等） ..."
  }
}
```

| フィールド | 型 | fallback |
|-----------|-----|----------|
| `tournament.liffRegistrationEnabled` | `boolean` | `true` |
| `tournament.liffCalendarEnabled` | `boolean` | `true` |

### 5.2 Functions

#### `types.ts` — `TournamentConfig` 拡張

```typescript
export interface TournamentConfig {
  // 既存フィールド ...
  liffRegistrationEnabled?: boolean;
  liffCalendarEnabled?: boolean;
}
```

#### `defaults.ts`

```typescript
export const DEFAULT_TOURNAMENT_LIFF_REGISTRATION_ENABLED = true;
export const DEFAULT_TOURNAMENT_LIFF_CALENDAR_ENABLED = true;
```

`buildFromDefaults()` の `tournament` オブジェクトに追加。

#### `configLoader.ts`

`mergeWithDefaults` の tournament 節（L498–536 付近）および `mergeConfigForUpsert` の tournament 節（L715–749 付近）に boolean 読み取り + fallback を追加。

### 5.3 Flutter（読み取りのみ）

店舗端末 UI および管理画面 UI から、本設定を編集する機能は**追加しない**。

#### `store_config_defaults.dart`

```dart
const bool kDefaultTournamentLiffRegistrationEnabled = true;
const bool kDefaultTournamentLiffCalendarEnabled = true;
```

#### `store_config_service.dart`

- `StoreConfigData` に `tournamentLiffRegistrationEnabled`, `tournamentLiffCalendarEnabled` 追加
- `fromFirestore` で `tournament?['liffRegistrationEnabled']` / `liffCalendarEnabled` をパース（欠損時デフォルト `true`）

設定値の変更は Firestore `storeMeta/config` を直接更新する運用とする（本 ChangeSpec の実装範囲外）。

---

## 6. テスト

### 6.1 Functions

#### `formatBlindLevelDurationText.spec.ts`

| ケース | 期待 |
|--------|------|
| 単一 duration | `"15分"` |
| 複数 duration | `"25分 / 20分 / 15分"` |
| 重複 duration | 出現順ユニーク |
| 空 levels | `""` |
| blindTemplate 不存在 | `""` |

#### `getTodayTournaments.spec.ts`

| ケース | 期待 |
|--------|------|
| 店舗営業中 | `currentBusinessDateKey` 一致のトーナメントを返す |
| 店舗営業外 | エラーにせず JST 暦日一致のトーナメントを返す |
| 店舗営業外・該当なし | `success: true`, `data: []`, `count: 0` |
| `businessDate !== targetBusinessDate` | 一覧に含まれない |
| `startAt` JST 暦日が今日でも `businessDate` が違う | 含まれない |
| `startAt` JST 暦日が今日でなくても `businessDate` が一致 | 含まれる |
| cancelled トーナメント | 一覧に含まれない |
| ended / paused / running | doc.status がそのまま返る |
| blindLevelDurationText | blindTemplates から正しく生成 |
| liffSettings | config 未設定時 `true` / `true` |
| isRegisteredByCurrentUser | 認証 + bills 登録済 → `true` |
| 認証なし | isRegisteredByCurrentUser = false |

#### `getUpcomingTournaments.spec.ts`

| ケース | 期待 |
|--------|------|
| cancelled 除外 | 同上 |
| includeAll: true | cancelled 除外維持 |

> `isRegisteredByCurrentUser` のテストは不要（本 API では任意フィールド）。

#### `registerForTournament.spec.ts` 追加

| ケース | 期待 errorKey |
|--------|--------------|
| liffRegistrationEnabled = false | `TOURNAMENT_LIFF_REGISTRATION_DISABLED` |
| status = ended | `TOURNAMENT_ENDED` |
| status = paused | `TOURNAMENT_PAUSED` |
| status = registered | `TOURNAMENT_REGISTRATION_CLOSED` |
| regEndAt 過ぎ | `TOURNAMENT_REGISTRATION_CLOSED` |
| status = cancelled | `TOURNAMENT_CANCELLED` |
| `businessDate !== currentBusinessDateKey` | `TOURNAMENT_NOT_TODAY` |
| `startAt` JST 暦日が今日でも `businessDate` が違う | `TOURNAMENT_NOT_TODAY` |
| `businessDate === currentBusinessDateKey`（`startAt` が暦日上は明日でも可） | 本日判定通過 |
| happy path | 既存テスト維持 |

#### `configLoader.spec.ts`

| ケース | 期待 |
|--------|------|
| tournament 節なし | liffRegistrationEnabled=true, liffCalendarEnabled=true |
| 明示 false | false が返る |

### 6.2 Flutter

| ファイル | ケース |
|---------|--------|
| `store_config_service_test.dart` | tournament 節に liff フィールドあり / なし |
| `store_config_phase2_test.dart` | defaults フォールバック |

### 6.3 LIFF（手動確認）

| # | 観点 |
|---|------|
| 1 | 未入店でトーナメントボタン表示・一覧閲覧可 |
| 2 | 未入店で参加ボタン（設定 ON 時）グレーアウト。タップで alert「未入店です」 |
| 3 | liffRegistrationEnabled=false で参加ボタン非表示 |
| 4 | liffCalendarEnabled=false でカレンダータブ非表示 |
| 5 | 本日タブのみ参加ボタン表示 |
| 6 | 確認ダイアログ → 登録成功 / 失敗表示 |
| 7 | 参加不可理由の優先順位（ended > 参加済 > paused > 締切 > 未入店）。タップ時 alert で表示 |
| 8 | status=registered → タップで「参加締め切りしました」を alert 表示 |
| 9 | status=running + regEndAt 未来 → 参加可（入店中・未参加時） |
| 10 | cancelled トーナメントが一覧に出ない |
| 11 | タブ切替でキャッシュ再利用 |
| 12 | カード通常/詳細表示項目（ブラインド時間含む） |
| 13 | 定員・プライズ・参加者数・status バッジが表示されない |
| 14 | 店舗営業外でも本日タブに JST 暦日一致のトーナメントが表示される（0件時は通常の空表示） |

---

## 7. 実装順序

```text
Phase 1: 店舗設定基盤
  ├─ functions: types.ts / defaults.ts / configLoader.ts
  ├─ flutter: store_config_defaults.dart / store_config_service.dart
  └─ test: configLoader.spec.ts / store_config_service_test.dart

Phase 2: 共有ヘルパー
  ├─ formatBlindLevelDurationText.ts（新規）
  ├─ mapScheduledTournamentForLiff.ts（新規）
  └─ test: formatBlindLevelDurationText.spec.ts

Phase 3: 一覧 Callable 拡張
  ├─ getTodayTournaments.ts
  ├─ getUpcomingTournaments.ts
  └─ test: getTodayTournaments.spec.ts / getUpcomingTournaments.spec.ts

Phase 4: 参加登録 Callable 拡張
  ├─ registerForTournament.ts
  └─ test: registerForTournament.spec.ts 追加

Phase 5: LIFF FE
  ├─ index.html（タブ化・カード共通化・参加制御）
  └─ user.css

Phase 6: 手動 E2E 確認（§6.3）
```

**依存関係**:

- Phase 3 は Phase 1–2 に依存（liffSettings 返却 + blind ヘルパー）
- Phase 4 は Phase 1 に依存（店舗設定ガード）
- Phase 5 は Phase 3 に依存（新 API フィールド・liffSettings）

---

## 8. 保留事項

### freeze

- 業務上の意味が未確定（仕様書 §11）
- 本 ChangeSpec では **参加登録判定・一覧表示に対する freeze 固有ロジックを追加・変更しない**
- `scheduledTournaments.freeze` フィールド自体の業務意味付け・参加可否への影響は、別途仕様確定後に対応する

### frozen

- freeze との責務整理が未完了（仕様書 §11）
- **Firestore 上の `status=frozen` は現状存在しない前提**とする（調査根拠: 既存 Callable が `freeze=true` のとき `status='frozen'` として**返却していた疑似ステータス**）
- 本 ChangeSpec ではこの**疑似ステータス返却を廃止**し、`scheduledTournaments.status`（doc 直下）をそのまま返す。`freeze` フィールドと `status` を混同しない
- 本 ChangeSpec では **frozen 疑似ステータスに基づく LIFF 向け表示文言・参加不可理由の追加は行わない**
- `freeze` フィールドの LIFF 向け扱い（表示・参加判定）は、freeze 保留事項の解決後に別 ChangeSpec で定義する

---

## 付録: API レスポンス型（参考）

### トーナメント item（LIFF 向け）

```typescript
interface LiffTournamentItem {
  id: string;
  name: string;
  templateId: string;
  startAt: string;           // ISO 8601 UTC
  regEndAt: string;
  status: string;            // scheduledTournaments.status（doc 直下）。'frozen' は Firestore 値ではなく旧 Callable 疑似ステータスだったため返却しない
  entryFee: number;
  startStack: number;
  isReentry: boolean;
  maxReentries: number | null;
  reentryFee: number;
  isAddon: boolean;
  addonLimitPerPlayer: number | null;
  addonFee: number;
  blindLevelDurationText: string;
  isRegisteredByCurrentUser?: boolean;  // getTodayTournaments: 必須。getUpcomingTournaments: 任意
}
```

### レスポンス top-level

```typescript
interface LiffTournamentListResponse {
  success: boolean;
  data?: LiffTournamentItem[];       // getTodayTournaments
  tournaments?: LiffTournamentItem[]; // getUpcomingTournaments
  count: number;
  liffSettings: {
    liffRegistrationEnabled: boolean;
    liffCalendarEnabled: boolean;
  };
  message: string;
}
```
