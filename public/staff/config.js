// 店舗別設定ファイル（staff用）
window.__CONFIG__ = {
  // デバッグ: LIFF初期化などの処理内容を画面上に表示する（true: 表示, false: 非表示）
  // 詳細: docs/LINEミニアプリ、LIFF/LINEミニアプリ、LIFF処理表示.md
  DEBUG_SHOW_LIFF_PROCESS: false,

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
  
  // SSoT: storeMeta/config.linePlan（Firestore 初期化後に loadLinePlanFromFirestore() で上書き）
  linePlan: "communication",
  
  isShiftRequestEnabled: function() {
    return this.linePlan !== 'communication';
  },

  /**
   * Firestore storeMeta/config から linePlan を読み取り、__CONFIG__ を上書きする。
   * Firebase 初期化後に呼び出すこと。
   * @param {import('firebase/firestore').Firestore} db
   */
  loadLinePlanFromFirestore: async function(db) {
    try {
      const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const snap = await getDoc(doc(db, "storeMeta", "config"));
      if (snap.exists()) {
        const data = snap.data();
        if (data.linePlan && ['communication', 'light', 'standard'].includes(data.linePlan)) {
          this.linePlan = data.linePlan;
        }
      }
    } catch (e) {
      console.warn("[config.js] Failed to load linePlan from Firestore, using default:", e);
    }
  }
};
