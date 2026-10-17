import { createContext, useContext, useEffect, useState } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('mitramove_token');
    const storedUser = localStorage.getItem('mitramove_user');

    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('mitramove_token');
        localStorage.removeItem('mitramove_user');
      }
    }

    setLoading(false);
  }, []);

  function persistSession(token, userData) {
    localStorage.setItem('mitramove_token', token);
    localStorage.setItem('mitramove_user', JSON.stringify(userData));
    setUser(userData);
  }

  async function register(name, email, password, role) {
    const { data } = await api.post('/auth/register', { name, email, password, role });
    persistSession(data.token, data.user);
    return data.user;
  }

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    persistSession(data.token, data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('mitramove_token');
    localStorage.removeItem('mitramove_user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
