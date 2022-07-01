import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue as FirestoreFieldValue } from 'firebase-admin/firestore';

export const firebase = initializeApp();
export const auth = getAuth(firebase);
export const firestore = getFirestore(firebase);
export const FieldValue = FirestoreFieldValue;

