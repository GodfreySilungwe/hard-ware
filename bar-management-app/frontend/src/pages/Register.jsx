import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    role: 'hardware-manager'
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Check password match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Check password length
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    // Check WhatsApp number
    if (!formData.phone.trim()) {
      setError('WhatsApp phone number is required');
      setLoading(false);
      return;
    }

    try {
      const { confirmPassword, ...registerData } = formData;
      const result = await register({
        ...registerData,
        role: 'hardware-manager'
      });
      if (result.success) {
        setSuccess(result.message || 'Registration submitted for owner approval.');
        setFormData({
          username: '',
          email: '',
          phone: '',
          password: '',
          confirmPassword: '',
          fullName: '',
          role: 'hardware-manager'
        });
      } else {
        setError(result.error || 'Registration failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(!showConfirmPassword);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.logo}>🔧</span>
          <h1 style={styles.title}>Smart Inventory App Onboarding</h1>
          <p style={styles.subtitle}>Register a new Smart Inventory App account for approval</p>
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Full Name *</label>
            <input
              type="text"
              name="fullName"
              style={styles.input}
              value={formData.fullName}
              onChange={handleChange}
              placeholder="Enter your full name"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Username *</label>
            <input
              type="text"
              name="username"
              style={styles.input}
              value={formData.username}
              onChange={handleChange}
              placeholder="Choose a username"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Email *</label>
            <input
              type="email"
              name="email"
              style={styles.input}
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter your email"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>WhatsApp Number *</label>
            <input
              type="tel"
              name="phone"
              style={styles.input}
              value={formData.phone}
              onChange={handleChange}
              placeholder="e.g. +265XXXXXXXXX"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password *</label>
            <div style={styles.passwordWrapper}>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                style={styles.passwordInput}
                value={formData.password}
                onChange={handleChange}
                placeholder="Min 6 characters"
                required
              />
              <button
                type="button"
                style={styles.eyeButton}
                onClick={togglePasswordVisibility}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#e94560';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#888';
                }}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Confirm Password *</label>
            <div style={styles.passwordWrapper}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                style={styles.passwordInput}
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your password"
                required
              />
              <button
                type="button"
                style={styles.eyeButton}
                onClick={toggleConfirmPasswordVisibility}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#e94560';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#888';
                }}
              >
                {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Account Type</label>
            <input
              type="text"
              style={{ ...styles.input, backgroundColor: '#f8fafc' }}
              value="Smart Inventory App"
              readOnly
            />
          </div>

          <button
            type="submit"
            style={styles.button}
            disabled={loading}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p style={styles.footer}>
          Already have an account? <Link to="/login" style={styles.link}>Sign in here</Link>
        </p>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f0f2f5',
    padding: '20px'
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '40px',
    maxWidth: '440px',
    width: '100%',
    boxShadow: '0 8px 40px rgba(0,0,0,0.1)'
  },
  header: {
    textAlign: 'center',
    marginBottom: '30px'
  },
  logo: {
    fontSize: '48px',
    display: 'block',
    marginBottom: '10px'
  },
  title: {
    fontSize: '24px',
    color: '#1a1a2e',
    margin: '0 0 5px 0'
  },
  subtitle: {
    fontSize: '14px',
    color: '#888',
    margin: 0
  },
  error: {
    backgroundColor: '#fde8e8',
    color: '#e74c3c',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '20px',
    fontSize: '14px',
    border: '1px solid #f5c6cb'
  },
  success: {
    backgroundColor: '#e8f5e9',
    color: '#2e7d32',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '20px',
    fontSize: '14px',
    border: '1px solid #c8e6c9'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333'
  },
  input: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px',
    transition: 'border 0.3s ease',
    outline: 'none'
  },
  passwordWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center'
  },
  passwordInput: {
    padding: '10px 14px',
    paddingRight: '50px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px',
    transition: 'border 0.3s ease',
    outline: 'none',
    width: '100%'
  },
  eyeButton: {
    position: 'absolute',
    right: '12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '20px',
    color: '#888',
    padding: '4px',
    transition: 'color 0.3s ease'
  },
  button: {
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#e94560',
    color: 'white',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    marginTop: '10px'
  },
  footer: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#888',
    marginTop: '20px',
    marginBottom: 0
  },
  link: {
    color: '#e94560',
    textDecoration: 'none',
    fontWeight: '500'
  }
};

export default Register;