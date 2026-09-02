const allowedUnits = new Set([
  'piece', 'box', 'pack', 'carton', 'bag', 'bottle', 'crate', 'bunch', 'dozen',
  'pair', 'meter', 'liter', 'kg', 'gram', 'gallon', 'roll', 'tray', 'set', 'unit'
]);

const normalizeText = (value) => String(value ?? '').trim();
const normalizeKey = (value) => normalizeText(value).toLowerCase();

function parseNumber(value, field, rowNumber, { integer = false } = {}) {
  if (normalizeText(value) === '') {
    return { error: `Row ${rowNumber}: ${field} is required.` };
  }
  const number = Number(value);
  if (!Number.isFinite(number) || (integer && !Number.isInteger(number)) || number < 0) {
    return { error: `Row ${rowNumber}: ${field} must be a non-negative ${integer ? 'whole ' : ''}number.` };
  }
  return { value: number };
}

function validateProductRows(rows, existingProducts, categories) {
  const errors = [];
  const products = [];
  const existingNames = new Set(existingProducts.map((product) => normalizeKey(product.name)));
  const importedNames = new Set();
  const categoryMap = new Map(categories.map((category) => [normalizeKey(category.name), category]));
  const newCategories = new Map();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const name = normalizeText(row.name);
    const categoryName = normalizeText(row.category);
    const unit = normalizeKey(row.unit || 'piece');
    const rowErrors = [];

    if (!name) rowErrors.push(`Row ${rowNumber}: name is required.`);
    if (!categoryName) rowErrors.push(`Row ${rowNumber}: category is required.`);
    if (name && (existingNames.has(normalizeKey(name)) || importedNames.has(normalizeKey(name)))) {
      rowErrors.push(`Row ${rowNumber}: product "${name}" already exists or is duplicated in this file.`);
    }
    if (unit && !allowedUnits.has(unit)) rowErrors.push(`Row ${rowNumber}: unit "${unit}" is not supported.`);

    const costPrice = parseNumber(row.costPrice, 'costPrice', rowNumber);
    const sellingPrice = parseNumber(row.sellingPrice, 'sellingPrice', rowNumber);
    const currentStock = parseNumber(row.currentStock, 'currentStock', rowNumber, { integer: true });
    const lowStockThresholdValue = normalizeText(row.lowStockThreshold) === '' ? 5 : row.lowStockThreshold;
    const lowStockThreshold = parseNumber(lowStockThresholdValue, 'lowStockThreshold', rowNumber, { integer: true });
    [costPrice, sellingPrice, currentStock, lowStockThreshold].forEach((result) => {
      if (result.error) rowErrors.push(result.error);
    });

    if (name) importedNames.add(normalizeKey(name));
    if (categoryName) {
      const categoryKey = normalizeKey(categoryName);
      if (!categoryMap.has(categoryKey)) newCategories.set(categoryKey, categoryName);
    }

    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }

    products.push({ name, categoryName, costPrice: costPrice.value, sellingPrice: sellingPrice.value, currentStock: currentStock.value, lowStockThreshold: lowStockThreshold.value, unit });
  });

  return { errors, products, newCategories: [...newCategories.values()], categoryMap };
}

module.exports = { allowedUnits, normalizeKey, validateProductRows };