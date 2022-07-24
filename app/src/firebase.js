const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue: FirestoreFieldValue } = require('firebase-admin/firestore');

const firebase = initializeApp();
const auth = getAuth(firebase);
const firestore = getFirestore(firebase);
const FieldValue = FirestoreFieldValue;

module.exports = {
  firebase,
  auth,
  firestore,
  FieldValue,
};

