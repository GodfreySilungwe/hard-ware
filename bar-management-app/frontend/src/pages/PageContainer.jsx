const PageContainer = ({ children, title }) => {
  return (
    <div className="page-shell" style={styles.container}>
      {title && (
        <div className="headerBar" style={styles.headerBar}>
          <div>
            <h1 className="title" style={styles.title}>{title}</h1>
            <p className="subtitle" style={styles.subtitle}>Executive operations overview and owner controls</p>
          </div>
        </div>
      )}
      <div className="page-content" style={styles.content}>
        {children}
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '24px 30px',
    width: '100%',
    maxWidth: '100%',
    minHeight: 'calc(100vh - 80px)',
    backgroundColor: '#f5f7fb',
    boxSizing: 'border-box'
  },
  headerBar: {
    marginBottom: '24px',
    padding: '18px 22px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
    border: '1px solid #e5e7eb',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)'
  },
  title: {
    fontSize: '28px',
    color: '#111827',
    marginBottom: '6px',
    fontWeight: '700',
    marginTop: 0
  },
  subtitle: {
    fontSize: '13px',
    color: '#6b7280',
    margin: 0
  },
  content: {
    width: '100%',
    maxWidth: '100%'
  }
};

export default PageContainer;