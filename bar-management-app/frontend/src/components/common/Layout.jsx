import Sidebar from './Sidebar';

const Layout = ({ children }) => {
  return (
    <div style={styles.layout}>
      <Sidebar />
      <main style={styles.main}>
        {children}
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
  main: {
    marginLeft: '220px',
    width: 'calc(100% - 220px)',
    minHeight: '100vh',
    padding: '0',
    backgroundColor: '#f0f2f5'
  }
};

export default Layout;