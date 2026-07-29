import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';

const Layout = ({ children }) => {
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { suspensionNotice } = useAuth();

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 900;
      setIsMobile(mobile);
      if (!mobile) {
        setIsSidebarOpen(false);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  return (
    <div style={styles.layout}>
      <Sidebar isMobileOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {isMobile && isSidebarOpen && (
        <button
          type="button"
          onClick={() => setIsSidebarOpen(false)}
          style={styles.overlay}
          aria-label="Close sidebar"
        />
      )}

      <main style={{ ...styles.main, ...(isMobile ? styles.mainMobile : {}) }}>
        {suspensionNotice && (
          <div style={styles.suspensionBanner}>{suspensionNotice}</div>
        )}
        {isMobile && (
          <button type="button" onClick={toggleSidebar} style={styles.menuButton} aria-label="Open menu">
            ☰
          </button>
        )}
        <div style={styles.content}>{children}</div>
        <div style={styles.footer}>
          <span>Developer: hello@goshsolutions.tech</span>
          <span>Website: www.goshsolutions.tech</span>
          <span>Phone: +265 995 718 815</span>
        </div>
      </main>
    </div>
  );
};

const styles = {
  layout: {
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: '#f0f2f5'
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(10, 14, 24, 0.5)',
    border: 'none',
    zIndex: 999
  },
  main: {
    marginLeft: '220px',
    width: 'calc(100% - 220px)',
    minHeight: '100vh',
    padding: '0',
    backgroundColor: '#f0f2f5'
  },
  mainMobile: {
    marginLeft: 0,
    width: '100%',
    paddingTop: '56px'
  },
  menuButton: {
    position: 'fixed',
    top: '14px',
    left: '14px',
    zIndex: 1100,
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: '#e94560',
    color: 'white',
    fontSize: '20px',
    boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
    cursor: 'pointer'
  },
  content: {
    padding: '20px 20px 40px',
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box'
  },
  suspensionBanner: {
    margin: '16px 20px 0',
    backgroundColor: '#fff1f2',
    border: '1px solid #fecdd3',
    color: '#be123c',
    padding: '12px 16px',
    borderRadius: '10px',
    fontWeight: '700',
    textAlign: 'center'
  },
  footer: {
    padding: '12px 20px 24px',
    textAlign: 'center',
    color: '#666',
    fontSize: '12px',
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    flexWrap: 'wrap'
  }
};

export default Layout;