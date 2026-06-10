// Firebase initialization (compat SDK - works with plain <script> tags)
const firebaseConfig = {
  apiKey: "AIzaSyCsuy2C9NWRajyhaO0g9sZ-qbmx5CMwxxI",
  authDomain: "financial-position.firebaseapp.com",
  projectId: "financial-position",
  storageBucket: "financial-position.firebasestorage.app",
  messagingSenderId: "650917877104",
  appId: "1:650917877104:web:a1ba9a22b0e738258d2bb5",
  measurementId: "G-2Y7TMEYY2T"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Single-user app: everything lives under /app/data/*
const ROOT = db.collection("app").doc("data");
const incomesCol  = ROOT.collection("incomes");
const debtsCol    = ROOT.collection("debts");
const expensesCol = ROOT.collection("expenses");
const metaDoc     = ROOT.collection("meta").doc("cycle");
