// public/js/firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// TODO: 下記の値を自身のFirebaseプロジェクトのものに置き換えてください
const firebaseConfig = {
  apiKey: "AIzaSyB4uReYiG_fVVDkwOmkPteF3roa_sGMHDQ",
  authDomain: "amuse-app-template.firebase.com",
  projectId: "amuse-app-template",
  storageBucket: "amuse-app-template.appspot.com",
  appId: "1:767044015900:web:8671d7fe4f677b17734cd9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 必要に応じてグローバル展開
window.Firebase = { app, auth, db };
