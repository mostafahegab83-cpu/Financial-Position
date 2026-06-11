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

const incomesCol  = db.collection("app").doc("data").collection("incomes");
const debtsCol    = db.collection("app").doc("data").collection("debts");
const expensesCol = db.collection("app").doc("data").collection("expenses");
const cyclesCol   = db.collection("app").doc("data").collection("cycles");
const metaDoc     = db.collection("app").doc("data").collection("meta").doc("cycle");
