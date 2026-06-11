// Firebase init (compat SDK)
const firebaseConfig = {
  apiKey: "AIzaSyCsuy2C9NWRajyhaO0g9sZ-qbmx5CMwxxI",
  authDomain: "financial-position.firebaseapp.com",
  projectId: "financial-position",
  storageBucket: "financial-position.firebasestorage.app",
  messagingSenderId: "650917877104",
  appId: "1:650917877104:web:a1ba9a22b0e738258d2bb5"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// One row = one entry for a given month: { year, month(1-12), cashAmount, cashDesc, expAmount, expDesc }
const entriesCol = db.collection("app").doc("data").collection("entries");
const debtsCol   = db.collection("app").doc("data").collection("debts");
