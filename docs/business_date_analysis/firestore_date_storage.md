# 日時をFirestoreに格納している箇所の分析

## 概要

Firestoreに日時を格納している主要な箇所について、営業日判定が必要かどうかを分析します。

## カテゴリ別分類

### 1. タイムスタンプ系（`serverTimestamp()`使用）

#### 1.1. `createdAt`, `updatedAt`

**使用箇所**: 多くのドキュメントで使用
- `bills`, `activeStays`, `idempotency`, `extras`, `items`, `events`, `orders`, `attendances`, `analyticsMonthly`など

**日付データの用途**:
- ドキュメントの作成日時・更新日時を記録
- メタデータとして使用

**営業日判定の必要性**: ❌ **不要**
- 理由：単純なタイムスタンプ記録であり、営業日判定は不要
- 用途：監査ログ、ソート、フィルタリングなど

**必要な日付データ**: タイムスタンプ（Firestore Timestamp）

---

#### 1.2. `startedAt`

**使用箇所**: `activeStays`ドキュメント

**日付データの用途**:
- 入店開始時刻を記録

**営業日判定の必要性**: ❌ **不要**
- 理由：単純なタイムスタンプ記録であり、営業日判定は不要
- 注：`bills.businessDate`は別途`calcBusinessDate`で計算される

**必要な日付データ**: タイムスタンプ（Firestore Timestamp）

---

#### 1.3. `orderedAt`

**使用箇所**: `items`, `orders`ドキュメント

**日付データの用途**:
- 注文時刻を記録

**営業日判定の必要性**: ❌ **不要**
- 理由：単純なタイムスタンプ記録であり、営業日判定は不要
- 注：`orders.date`は別途`bill.businessDate`から取得される

**必要な日付データ**: タイムスタンプ（Firestore Timestamp）

---

#### 1.4. `clockIn`, `clockOut`

**使用箇所**: `attendances`ドキュメント

**日付データの用途**:
- 出退勤時刻を記録

**営業日判定の必要性**: ❌ **不要**
- 理由：出退勤記録はカレンダー日付ベースで管理されるため、営業日判定は不要
- `attendances.date`はカレンダー日付（YYYY-MM-DD）として格納される

**必要な日付データ**: タイムスタンプ（Firestore Timestamp）

---

#### 1.5. `requestedAt`, `confirmedAt`, `declinedAt`, `rejectedAt`, `approvedAt`

**使用箇所**: `shiftRequests`関連

**日付データの用途**:
- シフト要請・承認・拒否の時刻を記録

**営業日判定の必要性**: ❌ **不要**
- 理由：シフト管理はカレンダー日付ベースで管理されるため、営業日判定は不要

**必要な日付データ**: タイムスタンプ（Firestore Timestamp）

---

#### 1.6. `appliedAt`

**使用箇所**: `events`ドキュメント

**日付データの用途**:
- イベント適用時刻を記録（トリガで設定）

**営業日判定の必要性**: ❌ **不要**
- 理由：単純なタイムスタンプ記録であり、営業日判定は不要
- 注：`eventBusinessDate`は別途`calcBusinessDate`で計算される

**必要な日付データ**: タイムスタンプ（Firestore Timestamp）

---

#### 1.7. `processedAt`

**使用箇所**: `analyticsMonthly`関連

**日付データの用途**:
- 集計処理時刻を記録

**営業日判定の必要性**: ❌ **不要**
- 理由：単純なタイムスタンプ記録であり、営業日判定は不要

**必要な日付データ**: タイムスタンプ（Firestore Timestamp）

---

#### 1.8. `accountingCompletedAt`, `settledAt`, `checkOutAt`

**使用箇所**: `accountingHistory`, `bills`関連

**日付データの用途**:
- 会計完了時刻、決済時刻、チェックアウト時刻を記録

**営業日判定の必要性**: ❌ **不要**
- 理由：単純なタイムスタンプ記録であり、営業日判定は不要
- 注：会計履歴のクエリでは営業日範囲を使用するが、これは別途計算される

**必要な日付データ**: タイムスタンプ（Firestore Timestamp）

---

### 2. 日付文字列系（YYYY-MM-DD形式）

#### 2.1. `businessDate`

**使用箇所**: `bills`ドキュメント

**日付データの用途**:
- 伝票がどの営業日に属するかを記録
- `calcBusinessDate(now)`で計算される

**営業日判定の必要性**: ✅ **必要**
- 理由：伝票作成時点の日時から営業日を判定して格納する必要がある
- 営業日を跨ぐ可能性があるため、単純なカレンダー日付では不正確

**必要な日付データ**: 営業日（YYYY-MM-DD形式）

---

#### 2.2. `date`

**使用箇所**: `orders`, `todaysBills`, `attendances`ドキュメント

**日付データの用途**:
- `orders`: 注文日（`bill.businessDate`から取得）
- `todaysBills`: 伝票日（`bill.businessDate`から取得、デュアルライト用）
- `attendances`: 出勤日（カレンダー日付）

**営業日判定の必要性**: 
- `orders`, `todaysBills`: ✅ **必要**（`bill.businessDate`から取得するため、元の計算時に必要）
- `attendances`: ❌ **不要**（カレンダー日付ベース）

**必要な日付データ**: 
- `orders`, `todaysBills`: 営業日（YYYY-MM-DD形式）
- `attendances`: カレンダー日付（YYYY-MM-DD形式）

---

#### 2.3. `originBusinessDate`, `eventBusinessDate`

**使用箇所**: `events`ドキュメント

**日付データの用途**:
- `originBusinessDate`: 売上帰属日（`bill.businessDate`から取得）
- `eventBusinessDate`: イベント計上日（`calcBusinessDate(now)`で計算）

**営業日判定の必要性**: ✅ **必要**
- 理由：`eventBusinessDate`はイベント発生時点の日時から営業日を判定して格納する必要がある
- `originBusinessDate`は既に計算済みの`bill.businessDate`を使用するため、格納時点では不要だが、元の計算時に必要

**必要な日付データ**: 営業日（YYYY-MM-DD形式）

---

### 3. タイムスタンプオブジェクト系（`Timestamp.fromDate()`使用）

#### 3.1. `expiresAt`

**使用箇所**: `idempotency`ドキュメント（TTL用）

**日付データの用途**:
- ドキュメントの有効期限を記録（now + 48h）

**営業日判定の必要性**: ❌ **不要**
- 理由：単純な相対時刻計算であり、営業日判定は不要

**必要な日付データ**: タイムスタンプ（Firestore Timestamp）

---

#### 3.2. `registeredAt`, `lastReentryAt`, `lastAddonAt`, `startAt`

**使用箇所**: `tournaments`関連

**日付データの用途**:
- トーナメント登録時刻、再エントリー時刻、アドオン時刻、開始時刻を記録

**営業日判定の必要性**: ❌ **不要**
- 理由：単純なタイムスタンプ記録であり、営業日判定は不要

**必要な日付データ**: タイムスタンプ（Firestore Timestamp）

---

## まとめ

| フィールド | 使用箇所 | 営業日判定 | 必要な日付データ |
|-----------|---------|-----------|----------------|
| `createdAt`, `updatedAt` | 多くのドキュメント | ❌ 不要 | タイムスタンプ |
| `startedAt` | `activeStays` | ❌ 不要 | タイムスタンプ |
| `orderedAt` | `items`, `orders` | ❌ 不要 | タイムスタンプ |
| `clockIn`, `clockOut` | `attendances` | ❌ 不要 | タイムスタンプ |
| `requestedAt`, `confirmedAt`, etc. | `shiftRequests` | ❌ 不要 | タイムスタンプ |
| `appliedAt` | `events` | ❌ 不要 | タイムスタンプ |
| `processedAt` | `analyticsMonthly` | ❌ 不要 | タイムスタンプ |
| `accountingCompletedAt`, etc. | `accountingHistory`, `bills` | ❌ 不要 | タイムスタンプ |
| `businessDate` | `bills` | ✅ 必要 | 営業日（YYYY-MM-DD） |
| `date` | `orders`, `todaysBills` | ✅ 必要 | 営業日（YYYY-MM-DD） |
| `date` | `attendances` | ❌ 不要 | カレンダー日付（YYYY-MM-DD） |
| `originBusinessDate`, `eventBusinessDate` | `events` | ✅ 必要 | 営業日（YYYY-MM-DD） |
| `expiresAt` | `idempotency` | ❌ 不要 | タイムスタンプ |
| `registeredAt`, etc. | `tournaments` | ❌ 不要 | タイムスタンプ |
