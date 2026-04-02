import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, googleProvider, OperationType, handleFirestoreError } from './firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot, setDoc, Timestamp, getDoc } from 'firebase/firestore';

interface UserData {
  uid: string;
  email: string;
  credits: number;
  lastRefill: any;
  subscriptionType: 'free' | 'pro' | 'plus' | 'ultra';
  subscriptionExpiresAt?: any;
}

interface AuthContextType {
  user: FirebaseUser | null;
  userData: UserData | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubDoc: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      // Clean up previous document listener if it exists
      if (unsubDoc) {
        unsubDoc();
        unsubDoc = undefined;
      }

      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        unsubDoc = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            setUserData(snapshot.data() as UserData);
            setLoading(false);
          } else {
            // Initialize user if document doesn't exist
            const initialData: UserData = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              credits: 50,
              lastRefill: Timestamp.now(),
              subscriptionType: 'free',
            };
            setDoc(userRef, initialData)
              .catch(e => {
                handleFirestoreError(e, OperationType.CREATE, 'users');
                setLoading(false);
              });
            // onSnapshot will fire again once setDoc completes
          }
        }, (error) => {
          console.error("Firestore onSnapshot error:", error);
          // Don't throw here to avoid crashing the app, just stop loading
          setLoading(false);
        });
      } else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubDoc) unsubDoc();
    };
  }, []);

  const login = async () => {
    try {
      setLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
      setLoading(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
