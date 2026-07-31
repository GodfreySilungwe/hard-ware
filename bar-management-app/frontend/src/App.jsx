import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import Layout from './components/common/Layout';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const POS = lazy(() => import('./pages/POS'));
const Products = lazy(() => import('./pages/Products'));
const Categories = lazy(() => import('./pages/Categories'));
const Customers = lazy(() => import('./pages/Customers'));
const Orders = lazy(() => import('./pages/Orders'));
const Reports = lazy(() => import('./pages/Reports'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const PurchaseOrders = lazy(() => import('./pages/PurchaseOrders'));
const Settings = lazy(() => import('./pages/Settings'));
const Applications = lazy(() => import('./pages/Applications'));

const RootRoute = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div style={styles.loading}>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <Dashboard />
    </Layout>
  );
};

const styles = {
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    color: '#888',
    fontSize: '16px'
  }
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<div style={styles.loading}>Loading app...</div>}>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected Routes - All authenticated users */}
            <Route path="/" element={
              <ProtectedRoute>
                <RootRoute />
              </ProtectedRoute>
            } />
            <Route path="/pos" element={
              <ProtectedRoute salesOnly>
                <Layout>
                  <POS />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/orders" element={
              <ProtectedRoute allowSalesAndManagement>
                <Layout>
                  <Orders />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/customers" element={
              <ProtectedRoute allowSalesAndManagement>
                <Layout>
                  <Customers />
                </Layout>
              </ProtectedRoute>
            } />

            {/* Hardware Manager and Owner Routes */}
            <Route path="/products" element={
              <ProtectedRoute hardwareManagerOnly>
                <Layout>
                  <Products />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/categories" element={
              <ProtectedRoute hardwareManagerOnly>
                <Layout>
                  <Categories />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/reports" element={
              <ProtectedRoute hardwareManagerOnly>
                <Layout>
                  <Reports />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/inventory" element={
              <ProtectedRoute hardwareManagerOnly>
                <Layout>
                  <Inventory />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/suppliers" element={
              <ProtectedRoute hardwareManagerOnly>
                <Layout>
                  <Suppliers />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/purchase-orders" element={
              <ProtectedRoute hardwareManagerOnly>
                <Layout>
                  <PurchaseOrders />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/applications" element={
              <ProtectedRoute ownerOnly>
                <Layout>
                  <Applications />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute allowedRoles={['hardware-manager']}>
                <Layout>
                  <Settings initialMenu="settings" />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/sales-team" element={
              <ProtectedRoute allowedRoles={['hardware-manager']}>
                <Layout>
                  <Settings initialMenu="sales-team" />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/hardware" element={
              <ProtectedRoute hardwareManagerOnly>
                <Layout>
                  <Settings initialMenu="hardware" />
                </Layout>
              </ProtectedRoute>
            } />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;