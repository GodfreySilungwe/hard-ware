import axios from 'axios';

// Create axios instance with base URL
const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

// Request interceptor for debugging
api.interceptors.request.use(
  config => {
    console.log(`📤 ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Response interceptor for debugging
api.interceptors.response.use(
  response => {
    console.log(`📥 ${response.status} ${response.config.url}`);
    return response;
  },
  error => {
    console.error('❌ API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default api;