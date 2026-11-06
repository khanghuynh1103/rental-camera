import { Router } from 'express';
import { listProducts } from './productRepository.js';

const router = Router();
const requests = new Map();
const normalize = value =>
  String(value || '')
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

function explicitCategories(text) {
  const categories = new Set();
  if (/\b(ong kinh|lens)\b/.test(text)) categories.add('lens');
  if (/\bmay anh\b/.test(text) || (/\bcamera\b/.test(text) && !/\baction camera\b/.test(text)))
    categories.add('camera');
  if (/\b(gimbal|may quay|action camera|thiet bi quay)\b/.test(text)) categories.add('video');
  if (/\b(micro|mic|am thanh)\b/.test(text)) categories.add('audio');
  if (/\b(den studio|den lien tuc)\b/.test(text)) categories.add('light');
  if (/\b(den flash|flash)\b/.test(text)) categories.add('flash');
  if (/\b(phu kien|chan den)\b/.test(text)) categories.add('accessory');
  return categories;
}

function recommend(message, products) {
  const text = normalize(message);
  const requiredCategories = explicitCategories(text);
  const priceContext =
    /\b(gia|ngan sach|khoang|giua|tam|duoi|tren|hon|tu|den|toi da|it nhat|toi thieu)\b|\d\s*(k|trieu|nghin|ngan|dong)\b/.test(
      text
    );
  const priceMatches = priceContext ? [...text.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(trieu|k|nghin|ngan|dong|d)?\b/g)] : [];
  const prices = priceMatches
    .map(match => {
      const raw = match[1];
      const unit = match[2];
      let value;
      if (unit === 'trieu') value = Number(raw.replace(',', '.')) * 1000000;
      else if (['k', 'nghin', 'ngan'].includes(unit)) value = Number(raw.replace(',', '.')) * 1000;
      else if (/^\d{1,3}[.,]\d{3}$/.test(raw)) value = Number(raw.replace(/[.,]/g, ''));
      else value = Number(raw.replace(/[.,]/g, ''));
      if (!unit && value < 10000) value *= 1000;
      return { value, before: text.slice(Math.max(0, match.index - 24), match.index) };
    })
    .filter(item => Number.isFinite(item.value) && item.value > 0);
  let minPrice = null;
  let maxPrice = null;
  let minStrict = false;
  let maxStrict = false;
  for (const item of prices) {
    if (/(?:tren|hon|tu|it nhat|toi thieu)\s*$/.test(item.before)) {
      minPrice = item.value;
      minStrict = /(?:tren|hon)\s*$/.test(item.before);
    } else if (/(?:duoi|toi da|khong qua|den)\s*$/.test(item.before)) {
      maxPrice = item.value;
      maxStrict = /duoi\s*$/.test(item.before);
    }
  }
  if (prices.length >= 2 && (minPrice === null || maxPrice === null)) {
    const values = prices.map(item => item.value);
    minPrice ??= Math.min(...values);
    maxPrice ??= Math.max(...values);
  } else if (prices.length === 1 && minPrice === null && maxPrice === null) {
    maxPrice = prices[0].value;
  }
  const intents = [
    { terms: ['chan dung', 'portrait'], categories: ['camera', 'lens'] },
    { terms: ['vlog', 'video', 'quay phim', 'youtube'], categories: ['camera', 'video', 'audio'] },
    { terms: ['du lich', 'nho gon'], categories: ['camera', 'video'] },
    { terms: ['anh sang', 'studio', 'den'], categories: ['light', 'flash', 'accessory'] },
    { terms: ['am thanh', 'micro', 'podcast'], categories: ['audio'] },
    { terms: ['ong kinh', 'lens'], categories: ['lens'] }
  ];
  const wanted = intents
    .filter(intent => intent.terms.some(term => text.includes(term)))
    .flatMap(intent => intent.categories);
  const words = text.split(/\s+/).filter(word => word.length > 2);
  const ranked = products
    .map(product => {
      const content = normalize(
        `${product.name} ${product.brandLabel} ${product.spec} ${product.category} ${product.best?.join(' ') || ''}`
      );
      let score = words.reduce((sum, word) => sum + (content.includes(word) ? 2 : 0), 0);
      if (wanted.includes(product.category)) score += 6;
      if (product.availableStock > 0) score += 2;
      return { product, score };
    })
    .filter(
      item =>
        item.product.availableStock > 0 &&
        (!requiredCategories.size || requiredCategories.has(item.product.category)) &&
        (minPrice === null || (minStrict ? item.product.price > minPrice : item.product.price >= minPrice)) &&
        (maxPrice === null || (maxStrict ? item.product.price < maxPrice : item.product.price <= maxPrice))
    )
    .sort((a, b) => b.score - a.score || b.product.rentalCount - a.product.rentalCount);
  return ranked.slice(0, 3).map(({ product }) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    price: product.price,
    image: product.images[0],
    spec: product.spec
  }));
}

async function aiAnswer(message, recommendations) {
  if (!process.env.OPENAI_API_KEY) return null;
  const context = recommendations.map(item => `${item.name}: ${item.spec}; ${item.price} đồng/ngày`).join('\n');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      instructions:
        'Bạn là trợ lý tìm thiết bị của Trạm Máy Ảnh. Trả lời bằng tiếng Việt, ngắn gọn, thân thiện. Chỉ gợi ý sản phẩm trong danh sách được cung cấp, không bịa giá, tồn kho hoặc thông số. Nếu thiếu thông tin về nhu cầu hoặc ngân sách, hỏi thêm một câu. Không khẳng định lịch trống cho ngày cụ thể; hướng dẫn khách kiểm tra lịch trên trang sản phẩm.',
      input: `Nhu cầu khách: ${message}\nSản phẩm gợi ý có thật trong kho:\n${context || 'Chưa có sản phẩm phù hợp.'}`,
      max_output_tokens: 250
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const error = new Error(`OpenAI API: ${response.status}${detail.error?.code ? ` (${detail.error.code})` : ''}`);
    error.status = response.status;
    error.code = detail.error?.code || detail.error?.type || null;
    throw error;
  }
  const data = await response.json();
  return (
    data.output
      ?.flatMap(item => item.content || [])
      .filter(item => item.type === 'output_text')
      .map(item => item.text)
      .join('\n') || null
  );
}

router.post('/chat/recommend', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (message.length < 3 || message.length > 500)
    return res.status(422).json({ message: 'Hãy nhập nhu cầu của bạn (3–500 ký tự).' });
  const key = req.ip || 'unknown';
  const now = Date.now();
  const recent = (requests.get(key) || []).filter(time => now - time < 60000);
  if (recent.length >= 20)
    return res.status(429).json({ message: 'Bạn gửi quá nhanh. Vui lòng thử lại sau một phút.' });
  recent.push(now);
  requests.set(key, recent);
  const products = await listProducts();
  const recommendations = recommend(message, products);
  let answer = null;
  let aiNotice = null;
  try {
    answer = await aiAnswer(message, recommendations);
  } catch (error) {
    console.error('AI recommendation failed:', error.message);
    const quotaCodes = new Set([
      'insufficient_quota',
      'credit_balance_exhausted',
      'organization_usage_limit_exceeded',
      'organization_spend_limit_exceeded',
      'project_spend_limit_exceeded'
    ]);
    aiNotice =
      error.status === 429
        ? quotaCodes.has(error.code)
          ? 'AI đang tạm ngừng vì tài khoản API đã hết credit hoặc chạm giới hạn chi tiêu. Hãy kiểm tra Billing và Limits trên OpenAI Platform.'
          : 'AI đang bị giới hạn số yêu cầu. Vui lòng thử lại sau; các sản phẩm bên dưới vẫn được lọc trực tiếp từ kho.'
        : error.name === 'TimeoutError'
          ? 'AI phản hồi quá lâu. Các sản phẩm bên dưới vẫn được lọc trực tiếp từ kho.'
          : 'AI tạm thời không phản hồi. Các sản phẩm bên dưới vẫn được lọc trực tiếp từ kho.';
  }
  const aiEnabled = Boolean(answer);
  if (!answer)
    answer = recommendations.length
      ? `Mình tìm được ${recommendations.length} thiết bị có thể phù hợp. Bạn xem các mẫu bên dưới nhé. Nếu cho mình biết mục đích chụp/quay và ngân sách mỗi ngày, mình sẽ gợi ý sát hơn.`
      : 'Hiện chưa tìm được thiết bị phù hợp. Bạn thử mô tả mục đích chụp/quay hoặc ngân sách mỗi ngày nhé.';
  res.json({ answer, recommendations, aiEnabled, aiNotice });
});

export default router;
