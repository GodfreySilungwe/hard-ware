const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const awsServerlessExpress = require('aws-serverless-express');
const inventoryRoutes = require('./routes/inventory');
const exportRoutes = require('./routes/export');
const supplierRoutes = require('./routes/suppliers');
const purchaseOrderRoutes = require('./routes/purchase-orders');
const { ensureTableExists } = require('./lib/dynamodb');

dotenv.config();

const app = express();

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || `${process.env.CORS_ORIGIN || 'http://localhost:5173'},https://d9ygk9rkc9xij.cloudfront.net`).split(',').map(origin => origin.trim()).filter(Boolean);

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '10mb' }));

app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/inventory', inventoryRoutes);

// Import routes
const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const productRoutes = require('./routes/products');
const customerRoutes = require('./routes/customers');
const orderRoutes = require('./routes/orders');
const uploadRoutes = require('./routes/uploads');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/uploads', uploadRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend is running!', table: process.env.DYNAMODB_TABLE_NAME || 'sampla-hardware-table' });
});

let server;
async function init() {
  await ensureTableExists();
}

init().catch((error) => {
  console.error('❌ DynamoDB initialization error:', error.message);
});

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

const lambdaServer = awsServerlessExpress.createServer(app);
module.exports = {
  app,
  handler: (event, context) => awsServerlessExpress.proxy(lambdaServer, event, context)
};