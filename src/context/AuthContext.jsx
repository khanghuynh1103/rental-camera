import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  const login = async values => {
    const result = await api.login(values);
    setUser(result.user);
    return result.user;
  };
  const register = async values => {
    const result = await api.register(values);
    setUser(result.user);
    return result.user;
  };
  const logout = async () => {
    await api.logout();
    setUser(null);
  };
  const updateProfile = async values => {
    const result = await api.updateProfile(values);
    setUser(result.user);
    return result;
  };
  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
