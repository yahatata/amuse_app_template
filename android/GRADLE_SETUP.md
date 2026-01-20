# Gradle設定の問題解決方法

## 問題
GradleラッパーがSSLエラーでGradleディストリビューションをダウンロードできない問題が発生しています。

## 解決方法

### 方法1: Android Studioを使用（推奨）
1. Android Studioでプロジェクトを開く
2. Android Studioが自動的にGradleをダウンロード・管理します
3. `File > Sync Project with Gradle Files` を実行

### 方法2: 手動でGradleをダウンロード
1. ブラウザで以下のURLからGradle 8.7をダウンロード:
   https://services.gradle.org/distributions/gradle-8.7-bin.zip

2. ダウンロードしたzipファイルを以下のディレクトリに配置:
   `~/.gradle/wrapper/dists/gradle-8.7-bin/[ハッシュ値]/gradle-8.7-bin.zip`

3. zipファイルを展開:
   ```bash
   cd ~/.gradle/wrapper/dists/gradle-8.7-bin/[ハッシュ値]/
   unzip gradle-8.7-bin.zip
   ```

### 方法3: ネットワーク設定の確認
- プロキシ設定を確認
- ファイアウォール設定を確認
- SSL/TLS証明書の更新

## 現在の設定
- Gradleバージョン: 8.7
- Kotlin DSLキャッシュ: 無効化済み
- ネットワークタイムアウト: 30秒
