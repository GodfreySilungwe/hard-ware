const Order = require('./models/Order');

(async () => {
  try {
    const orders = await Order.find({}, null);
    console.log('orders length', orders.length);
    orders.slice(0, 20).forEach((order, idx) => {
      console.log(idx + 1, order._id || order.id, order.createdAt, order.status, order.totalAmount, order.profit);
    });
  } catch (err) {
    console.error('err', err);
  }
})();
