import { useEffect, useState } from 'react';

const DeleteConfirmModal = ({ open, title, description, onCancel, onConfirm }) => {
  const [inputValue, setInputValue] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!open) {
      setInputValue('');
      setIsDeleting(false);
    }
  }, [open]);

  if (!open) return null;

  const isConfirmed = inputValue.trim().toLowerCase() === 'delete';

  const handleConfirm = async () => {
    if (!isConfirmed || !onConfirm) return;

    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true">
      <div style={styles.modal}>
        <h3 style={styles.title}>{title}</h3>
        <p style={styles.description}>{description}</p>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type delete"
          style={styles.input}
          autoFocus
        />
        <div style={styles.actions}>
          <button type="button" style={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            style={{ ...styles.deleteBtn, ...(isConfirmed ? {} : styles.deleteBtnDisabled) }}
            onClick={handleConfirm}
            disabled={!isConfirmed || isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: '16px'
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '14px',
    width: '100%',
    maxWidth: '420px',
    padding: '20px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)'
  },
  title: {
    margin: '0 0 8px',
    fontSize: '18px',
    color: '#111827'
  },
  description: {
    margin: '0 0 12px',
    color: '#4b5563',
    lineHeight: 1.5
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    marginBottom: '14px'
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px'
  },
  cancelBtn: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    backgroundColor: 'white',
    cursor: 'pointer'
  },
  deleteBtn: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#dc2626',
    color: 'white',
    cursor: 'pointer'
  },
  deleteBtnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed'
  }
};

export default DeleteConfirmModal;
