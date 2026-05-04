// ============================================================
//  PASSO IMPORTANTE: Substitua os valores abaixo pelas
//  credenciais do SEU projeto no Firebase Console
//  (Configurações do projeto > Seus apps > Config do SDK)
// ============================================================

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAQMl7pZR54jNLMUQ_yEVII9ZwtP03DXeg",
  authDomain: "muaythay-agendamentos.firebaseapp.com",
  projectId: "muaythay-agendamentos",
  storageBucket: "muaythay-agendamentos.firebasestorage.app",
  messagingSenderId: "49546096930",
  appId: "1:949546096930:web:0458a54b2314e2b069ad7b"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
