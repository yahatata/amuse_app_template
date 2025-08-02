// public/js/liff-init.js
// グローバルに公開する関数
window.initLiffAndFirebaseAuth = async function(liffId) {
    if (!window.liff) {
      alert("LIFF SDKが読み込まれていません。");
      return;
    }
  
    await liff.init({ liffId });
  
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }
  
    const idToken = await liff.getIDToken();
  
    const res = await fetch("/getFirebaseCustomToken", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`
      }
    });
  
    if (!res.ok) {
      throw new Error("Firebase カスタムトークンの取得に失敗しました。");
    }
  
    const { firebaseToken } = await res.json();
  
    const { auth } = window.Firebase;
    await auth.signInWithCustomToken(firebaseToken);
  
    // 利用者情報を window にセット（便利）
    window.LiffFirebase = {
      idToken,
      user: auth.currentUser
    };
  };
  