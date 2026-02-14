// 店舗別設定ファイル（staff用）
window.__CONFIG__ = {
  // LIFF ID（スタッフ用ミニアプリ）
  liffId: "2008640140-kWpQ25Jp",
  // ユーザー用LIFF ID（「ユーザーに切り替え」で開く先。LINE Developersのユーザー用LIFFのIDと一致させる）
  userLiffId: "2007950789-ZJ7b0JgO",
  
  // Firebase設定
  firebaseConfig: {
    apiKey: "AIzaSyB4uReYiG_fVVDkwOmkPteF3roa_sGMHDQ",
    authDomain: "amuse-app-template.firebaseapp.com",
    projectId: "amuse-app-template",
    storageBucket: "amuse-app-template.appspot.com",
    appId: "1:767044015900:web:8671d7fe4f677b17734cd9"
  },
  
  // 店舗情報
  storeInfo: {
    name: "Amuse App Template",
    id: "amuse-app-template"
  },
  
  // LINEプラン設定（globalConstant.dartと同期必須）
  // 'communication' | 'light' | 'standard'
  linePlan: "communication",
  
  // シフト要請機能の有効/無効
  isShiftRequestEnabled: function() {
    return this.linePlan !== 'communication';
  }
};
