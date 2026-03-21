import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    window.mindforge.auth.getUser().then((u) => {
      setUser(u);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // Listen for auth state changes from main process
    window.mindforge.auth.onAuthStateChange((data) => {
      setUser(data.user);
    });
  }, []);

  const signUp = async (email, password) => {
    const result = await window.mindforge.auth.signUp(email, password);
    if (result.user) setUser(result.user);
    return result;
  };

  const signIn = async (email, password) => {
    const result = await window.mindforge.auth.signIn(email, password);
    if (result.user) setUser(result.user);
    return result;
  };

  const signOut = async () => {
    const result = await window.mindforge.auth.signOut();
    if (!result.error) setUser(null);
    return result;
  };

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
