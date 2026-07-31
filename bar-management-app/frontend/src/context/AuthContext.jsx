import { createContext, useState, useContext, useEffect } from 'react';
import api from '../api/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [suspensionNotice, setSuspensionNotice] = useState(null);

  // Set auth token in axios headers
  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('token', token);
    } else {
      delete api.defaults.headers.common['Authorization'];
      localStorage.removeItem('token');
    }
  }, [token]);

  // Load user on mount
  useEffect(() => {
    const loadUser = async () => {
      setLoading(true);

      if (token) {
        try {
          const res = await api.get('/auth/me');
          const authUser = res.data;
          const normalizedUser = {
            ...authUser,
            role: authUser?.role === 'owner' ? 'owner' : authUser?.role || 'user',
            tenantId: authUser?.tenantId || null
          };
          setUser(normalizedUser);
          setSuspensionNotice(authUser?.suspensionMessage || null);
        } catch (err) {
          console.error('Error loading user:', err);
          setToken(null);
          setUser(null);
          setSuspensionNotice(null);
        }
      } else {
        setUser(null);
        setSuspensionNotice(null);
      }

      setLoading(false);
    };

    loadUser();
  }, [token]);

  // Login
  const login = async (username, password) => {
    try {
      setError(null);
      const res = await api.post('/auth/login', { username, password });
      const { token: authToken, user: authUser } = res.data;
      const normalizedUser = {
        ...authUser,
        role: authUser?.role === 'owner' ? 'owner' : authUser?.role || 'user',
        tenantId: authUser?.tenantId || null
      };
      setToken(authToken);
      setUser(normalizedUser);
      setSuspensionNotice(authUser?.suspensionMessage || null);
      return { success: true, token: authToken, user: normalizedUser };
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Login failed';
      const isSuspended = /suspended|deleted/i.test(errorMessage);
      setError(errorMessage);
      setSuspensionNotice(isSuspended ? errorMessage : null);
      return { success: false, error: errorMessage };
    }
  };

  // Register
  const register = async (userData) => {
    try {
      setError(null);
      const res = await api.post('/auth/register', userData);
      const { token: authToken, user: authUser, message } = res.data;

      if (authToken) {
        setToken(authToken);
        setUser(authUser);
      } else {
        setToken(null);
        setUser(null);
      }

      return { success: true, token: authToken, user: authUser, message };
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Registration failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // Logout
  const logout = () => {
    setToken(null);
    setUser(null);
    setError(null);
    setSuspensionNotice(null);
  };

  const clearSuspensionNotice = () => {
    setSuspensionNotice(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      error,
      suspensionNotice,
      login,
      register,
      logout,
      clearSuspensionNotice,
      isAuthenticated: Boolean(token),
      isOwner: user?.role === 'owner',
      isHardwareManager: user?.role === 'hardware-manager',
      isSales: user?.role === 'sales',
      role: user?.role || null
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;