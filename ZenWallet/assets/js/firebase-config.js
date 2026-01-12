// assets/js/firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSyDIda8VOxiHP2okFRjOGl8bYPmlKjDc2lc",
  authDomain: "echoverge-tw.firebaseapp.com",
  projectId: "echoverge-tw",
  storageBucket: "echoverge-tw.firebasestorage.app",
  messagingSenderId: "203660574697",
  appId: "1:203660574697:web:206c3aabe953274db39578",
  measurementId: "G-K1G4C4R67D"
};

// [新增] 初始化 Firebase (如果尚未初始化)
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase Initialized");
}