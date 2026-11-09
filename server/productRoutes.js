import { Router } from 'express';
import { getProductBySlug, listProducts } from './productRepository.js';
import { availabilityCalendar, countAvailableEquipment, expireStaleRentals } from './rentalService.js';
import { RULES, validateRentalPeriod } from './rules.js';
import { addDays, isIsoDate, todayVN } from './time.js';

const router = Router();

router.get('/products', async (req, res) => {
  let result = await listProducts();
  const brand = String(req.query.brand || 'all').toLowerCase();
  const category = String(req.query.category || 'all').toLowerCase();
  const subcategory = String(req.query.subcategory || '').toLowerCase();
  const search = String(req.query.q || '')
    .trim()
    .toLocaleLowerCase('vi');

  if (brand !== 'all') result = result.filter(item => item.brand === brand);
  if (category !== 'all') {
    if (category === 'lighting')
      result = result.filter(item => ['light', 'flash', 'accessory'].includes(item.category));
    else if (category === 'video' && subcategory === 'micro')
      result = result.filter(item => ['video', 'audio'].includes(item.category));
    else result = result.filter(item => item.category === category);
  }
  if (subcategory) {
    const matches = {
      gimbal: item => item.category === 'video' && /dji-rs|zhiyun/.test(item.id),
      micro: item => item.category === 'audio',
      'action-camera': item => item.category === 'video' && /action|gopro|insta360/.test(item.id),
      'studio-light': item => item.category === 'light',
      flash: item => item.category === 'flash',
      'light-stand': item => item.category === 'accessory' && /260t|1004bac|195s|la-300|a2030d/.test(item.id)
    };
    if (matches[subcategory]) result = result.filter(matches[subcategory]);
  }
  if (search)
    result = result.filter(item =>
      `${item.name} ${item.brandLabel} ${item.spec}`.toLocaleLowerCase('vi').includes(search)
    );

  const startDate = isIsoDate(req.query.startDate) ? req.query.startDate : null;
  const endDate = isIsoDate(req.query.endDate) ? req.query.endDate : null;
  if (startDate && endDate && endDate >= startDate) {
    await expireStaleRentals();
    const availability = await Promise.all(
      result.map(async product => [
        product.id,
        await countAvailableEquipment(product.databaseId, req.query.startDate, req.query.endDate)
      ])
    );
    const availableIds = new Set(availability.filter(([, count]) => count > 0).map(([id]) => id));
    result = result.filter(product => availableIds.has(product.id));
  }
  if (req.query.featured === 'true')
    result = result.filter(item => item.featured).sort((a, b) => b.rentalCount - a.rentalCount);
  if (req.query.sort === 'low') result.sort((a, b) => a.price - b.price);
  if (req.query.sort === 'high') result.sort((a, b) => b.price - a.price);

  const total = result.length,
    page = Math.max(1, Number.parseInt(req.query.page) || 1),
    limit = Math.min(24, Math.max(1, Number.parseInt(req.query.limit) || 12)),
    totalPages = Math.max(1, Math.ceil(total / limit)),
    safePage = Math.min(page, totalPages),
    start = (safePage - 1) * limit;
  res.json({
    products: result.slice(start, start + limit),
    total,
    page: safePage,
    limit,
    totalPages,
    rentalPeriod: startDate && endDate ? { startDate: req.query.startDate, endDate: req.query.endDate } : null
  });
});

// Chi tiết, lịch trống và kiểm tra lịch đều công khai: khách chỉ cần đăng nhập khi đặt thuê.
router.get('/products/:id', async (req, res) => {
  const product = await getProductBySlug(req.params.id);
  return product ? res.json({ product }) : res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
});

router.get('/products/:id/calendar', async (req, res) => {
  const product = await getProductBySlug(req.params.id);
  if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
  const today = todayVN(),
    from = isIsoDate(req.query.from) && req.query.from >= today ? req.query.from : today;
  const days = Math.min(RULES.maxAdvanceDays, Math.max(7, Number.parseInt(req.query.days) || 62));
  await expireStaleRentals();
  const calendar = await availabilityCalendar(product.databaseId, from, addDays(from, days - 1));
  res.json({
    productId: product.id,
    total: product.availableStock,
    bufferDays: RULES.bufferDays,
    maxRentalDays: RULES.maxRentalDays,
    days: calendar
  });
});

router.post('/products/:id/availability', async (req, res) => {
  const product = await getProductBySlug(req.params.id);
  if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
  const error = validateRentalPeriod(req.body.startDate, req.body.endDate, todayVN());
  if (error) return res.status(422).json({ message: error });
  await expireStaleRentals();
  const remaining = await countAvailableEquipment(product.databaseId, req.body.startDate, req.body.endDate),
    available = remaining > 0;
  res.json({
    available,
    message: available
      ? `${product.name} đang có thể thuê trong thời gian bạn chọn.`
      : `${product.name} đã hết lịch trong thời gian này (đã tính ${RULES.bufferDays} ngày kiểm tra thiết bị giữa hai đơn).`,
    remaining
  });
});

export default router;
