import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';

const Layout = ({ children }) => {
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
        {isMobile && (
          <button type="button" onClick={toggleSidebar} style={styles.menuButton} aria-label="Open menu">
            ☰
          </button>
        )}
        <div style={styles.content}>{children}</div>
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
    width: '100%'
  }
};

export default Layout;