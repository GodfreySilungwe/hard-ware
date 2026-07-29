import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ProtectedRoute = ({
  children,
  ownerOnly = false,
  hardwareManagerOnly = false,
  salesOnly = false,
  allowSalesAndManagement = false,
  allowedRoles = []
}) => {
  const { isAuthenticated, isOwner, isHardwareManager, isSales, loading, role } = useAuth();

  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner}></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  let hasAccess = true;

  if (ownerOnly) {
    hasAccess = isOwner;
  } else if (hardwareManagerOnly) {
    hasAccess = isHardwareManager || isOwner;
  } else if (salesOnly) {
    hasAccess = isSales;
  } else if (allowSalesAndManagement) {
    hasAccess = isSales || isHardwareManager || isOwner;
  } else if (allowedRoles.length > 0) {
    hasAccess = allowedRoles.includes(role);
  }

  if (!hasAccess) {
    return <Navigate to="/" replace />;
  }

  return children;
};

const styles = {
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    color: '#888'
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #f0f0f0',
    borderTop: '4px solid #e94560',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  }
};

// Add keyframe animation
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

export default ProtectedRoute;