import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import Layout from './components/common/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Products from './pages/Products';
import Categories from './pages/Categories';
import Customers from './pages/Customers';
import Orders from './pages/Orders';
import Reports from './pages/Reports';
import Inventory from './pages/Inventory';
import Suppliers from './pages/Suppliers';
import PurchaseOrders from './pages/PurchaseOrders';
import Settings from './pages/Settings';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />

          {/* Protected Routes - All authenticated users */}
          <Route path="/" element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/pos" element={
            <ProtectedRoute>
              <Layout>
                <POS />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/orders" element={
            <ProtectedRoute>
              <Layout>
                <Orders />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/customers" element={
            <ProtectedRoute>
              <Layout>
                <Customers />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Owner Only Routes */}
          <Route path="/products" element={
            <ProtectedRoute ownerOnly>
              <Layout>
                <Products />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/categories" element={
            <ProtectedRoute ownerOnly>
              <Layout>
                <Categories />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute ownerOnly>
              <Layout>
                <Reports />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/inventory" element={
            <ProtectedRoute ownerOnly>
              <Layout>
                <Inventory />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/suppliers" element={
            <ProtectedRoute ownerOnly>
              <Layout>
                <Suppliers />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/purchase-orders" element={
            <ProtectedRoute ownerOnly>
              <Layout>
                <PurchaseOrders />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute ownerOnly>
              <Layout>
                <Settings />
              </Layout>
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;