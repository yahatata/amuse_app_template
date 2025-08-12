// 店舗別設定テンプレート
// このファイルをコピーして config.<store>.js として使用してください
window.__CONFIG__ = {
  // LIFF ID（LINE公式アカウントごとに異なる）
  liffId: "REPLACE_WITH_YOUR_LIFF_ID",
  
  // Firebase設定（プロジェクトごとに異なる）
  firebaseConfig: {
    apiKey: "REPLACE_WITH_YOUR_API_KEY",
    authDomain: "your-project-id.firebaseapp.com", // ← プロジェクトIDを変更
    projectId: "your-project-id", // ← プロジェクトIDを変更
    storageBucket: "your-project-id.appspot.com", // ← プロジェクトIDを変更
    appId: "REPLACE_WITH_YOUR_APP_ID"
  },
  
  // 店舗情報
  storeInfo: {
    name: "店舗名",
    id: "store-id"
  }
}; 