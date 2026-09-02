const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');
const { canDeleteProduct } = require('../lib/deletionRules');
const ExcelJS = require('exceljs');
const multer = require('multer');
const Category = require('../models/Category');
const dynamodb = require('../lib/dynamodb');
const { normalizeKey, validateProductRows } = require('../lib/productImport');

const spreadsheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = file.originalname.toLowerCase().endsWith('.xlsx');
    cb(allowed ? null : new Error('Only .xlsx files are allowed'), allowed);
  }
});

// Get all products with optional pagination and search
router.get('/', protect, async (req, res) => {
  try {
    const { limit, offset, search, category } = req.query;
    const limitNum = Math.max(0, Number(limit) || 0);
    const offsetNum = Math.max(0, Number(offset) || 0);
    const categoryId = category && category !== 'all' ? category : null;

    const query = {};
    if (categoryId) {
      query.category = categoryId;
    }

    const products = await Product.find(query, req).populate('category', 'name');
    const scopedProducts = products.filter((product) => !req.user?.tenantId || product.tenantId === req.user.tenantId);

    if (search && search.trim().length > 0) {
      const normalized = search.trim().toLowerCase();
      const scoredProducts = scopedProducts
        .map((product) => {
          const name = product.name?.toLowerCase() || '';
          const unit = product.unit?.toLowerCase() || '';
          const categoryName = product.category?.name?.toLowerCase() || '';
          let score = 0;

          if (name === normalized) score += 100;
          else if (name.startsWith(normalized)) score += 80;
          else if (name.includes(normalized)) score += 50;

          if (unit === normalized) score += 20;
          else if (unit.includes(normalized)) score += 10;

          if (categoryName === normalized) score += 15;
          else if (categoryName.includes(normalized)) score += 8;

          return { product, score };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limitNum > 0 ? limitNum : 3)
        .map(({ product }) => product);

      return res.json(scoredProducts);
    }

    const pagedProducts = limitNum > 0
      ? scopedProducts.slice(offsetNum, offsetNum + limitNum)
      : scopedProducts;

    res.json(pagedProducts);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get low stock products
router.get('/low-stock', protect, async (req, res) => {
  try {
    const products = await Product.find({
      $expr: {
        $lte: ['$currentStock', '$lowStockThreshold']
      }
    }, req).populate('category', 'name');
    const scopedProducts = (products || []).filter((product) => !req.user?.tenantId || product.tenantId === req.user.tenantId);
    res.json(scopedProducts);
  } catch (error) {
    console.error('Error fetching low stock:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/import-template', protect, async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Products');
  worksheet.columns = [
    { header: 'name', key: 'name', width: 28 },
    { header: 'category', key: 'category', width: 24 },
    { header: 'costPrice', key: 'costPrice', width: 14 },
    { header: 'sellingPrice', key: 'sellingPrice', width: 16 },
    { header: 'currentStock', key: 'currentStock', width: 16 },
    { header: 'lowStockThreshold', key: 'lowStockThreshold', width: 20 },
    { header: 'unit', key: 'unit', width: 14 }
  ];
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE94560' } };
  worksheet.addRow({ name: 'Example product', category: 'Example category', costPrice: 100, sellingPrice: 150, currentStock: 10, lowStockThreshold: 5, unit: 'piece' });
  worksheet.getRow(3).font = { italic: true, color: { argb: 'FF666666' } };
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=product_import_template.xlsx');
  const buffer = await workbook.xlsx.writeBuffer();
  res.end(Buffer.from(buffer));
});

const isProductImportRequest = (req) => {
  if (!req) return false;
  if (req.query?.import === 'true') return true;
  if (Array.isArray(req.body?.products)) return true;
  return false;
};

const importProductRows = async (req, res, rows) => {
  try {
    if (!rows.length) return res.status(400).json({ message: 'The workbook contains no product rows' });
    if (rows.length > 1000) return res.status(400).json({ message: 'A maximum of 1,000 products can be imported at once' });

    const [existingProducts, categories] = await Promise.all([Product.find({}, req), Category.find({}, req)]);
    const validation = validateProductRows(rows, existingProducts, categories);
    if (validation.errors.length) return res.status(400).json({ message: 'Import validation failed', errors: validation.errors });

    const categoryMap = new Map(validation.categoryMap);
    for (const name of validation.newCategories) {
      const category = new Category({ name, tenantId: req.user?.tenantId || null });
      await category.save();
      categoryMap.set(normalizeKey(name), category);
    }

    const productRecords = validation.products.map(({ categoryName, ...product }) => ({
      ...product,
      category: categoryMap.get(normalizeKey(categoryName))._id,
      tenantId: req.user?.tenantId || null
    }));
    const createdProducts = await dynamodb.batchCreateEntities('product', productRecords);
    res.status(201).json({ created: createdProducts.length, categoriesCreated: validation.newCategories.length });
  } catch (error) {
    console.error('Product import error:', error);
    res.status(400).json({ message: error.message || 'Product import failed' });
  }
};

const handleProductImport = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'An .xlsx file is required' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return res.status(400).json({ message: 'The workbook has no worksheet' });

    const headerNames = worksheet.getRow(1).values.slice(1).map((value) => normalizeKey(value));
    const headerMap = {
      name: 'name',
      category: 'category',
      costprice: 'costPrice',
      sellingprice: 'sellingPrice',
      currentstock: 'currentStock',
      lowstockthreshold: 'lowStockThreshold',
      unit: 'unit'
    };
    const headers = headerNames.map((header) => headerMap[header] || header);
    const requiredHeaders = ['name', 'category', 'costprice', 'sellingprice', 'currentstock'];
    const missingHeaders = requiredHeaders.filter((header) => !headerNames.includes(header));
    if (missingHeaders.length) return res.status(400).json({ message: `Missing columns: ${missingHeaders.join(', ')}` });

    const rows = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = row.values.slice(1);
      if (values.every((value) => normalizeKey(value) === '')) return;
      rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index]])));
    });
    return importProductRows(req, res, rows);
  } catch (error) {
    console.error('Product import error:', error);
    return res.status(400).json({ message: error.message || 'Product import failed' });
  }
};

const handleProductJsonImport = (req, res) => {
  const rows = req.body?.products;
  if (!Array.isArray(rows)) return res.status(400).json({ message: 'The request must include a products array' });
  return importProductRows(req, res, rows);
};

router.post('/import', protect, spreadsheetUpload.single('file'), handleProductImport);

// Keep imports on the existing products POST path for deployments whose CDN
// configuration only forwards POST requests for the base products resource.
router.post('/', protect, (req, res, next) => {
  if (!isProductImportRequest(req)) return next();
  if (req.is('application/json')) return handleProductJsonImport(req, res);

  return spreadsheetUpload.single('file')(req, res, (error) => {
    if (error) return res.status(400).json({ message: error.message });
    return handleProductImport(req, res);
  });
});

// Get single product
router.get('/:id', protect, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id, req).populate('category', 'name');
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    if (req.user?.tenantId && product.tenantId && product.tenantId !== req.user.tenantId) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create product
router.post('/', protect, async (req, res) => {
  try {
    const product = new Product({
      ...req.body,
      tenantId: req.user?.tenantId || null
    });
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update product - FIXED
router.put('/:id', protect, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id, req);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    if (req.user?.tenantId && product.tenantId && product.tenantId !== req.user.tenantId) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Update fields
    const { name, category, costPrice, sellingPrice, currentStock, lowStockThreshold, unit } = req.body;
    
    product.name = name || product.name;
    product.category = category || product.category;
    product.costPrice = costPrice !== undefined ? costPrice : product.costPrice;
    product.sellingPrice = sellingPrice !== undefined ? sellingPrice : product.sellingPrice;
    product.currentStock = currentStock !== undefined ? currentStock : product.currentStock;
    product.lowStockThreshold = lowStockThreshold !== undefined ? lowStockThreshold : product.lowStockThreshold;
    product.unit = unit || product.unit;

    await product.save();
    res.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete product
router.delete('/:id', protect, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id, req);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const { allowed, reason } = canDeleteProduct(product);
    if (!allowed) {
      return res.status(400).json({ message: reason });
    }

    await Product.findByIdAndDelete(req.params.id, req);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: error.message });
  }
});

router.isProductImportRequest = isProductImportRequest;
module.exports = router;