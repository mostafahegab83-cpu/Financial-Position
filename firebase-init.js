// Firebase init (compat SDK)
const firebaseConfig = {
  apiKey: "AIzaSyCsuy2C9NWRajyhaO0g9sZ-qbmx5CMwxxI",
  authDomain: "financial-position-app.firebaseapp.com",
  projectId: "financial-position-app",
  storageBucket: "financial-position-app.appspot.com",
  messagingSenderId: "0",
  appId: "0"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const incomesCol  = db.collection("app").doc("data").collection("incomes");
const debtsCol    = db.collection("app").doc("data").collection("debts");
const expensesCol = db.collection("app").doc("data").collection("expenses");
const cyclesCol   = db.collection("app").doc("data").collection("cycles");
const metaDoc     = db.collection("app").doc("data").collection("meta").doc("cycle");
