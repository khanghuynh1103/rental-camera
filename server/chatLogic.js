// Phần logic thuần của trợ lý tìm thiết bị (không gọi database hay API), để kiểm thử đơn vị.

export const CATEGORIES = ['camera', 'lens', 'video', 'audio', 'light', 'flash', 'accessory'];

/** Nhóm thiết bị thường đi kèm, dùng khi lịch sử thuê chưa đủ dữ liệu. */
export const COMPLEMENTARY = {
  camera: ['lens', 'audio', 'accessory'],
  lens: ['camera', 'accessory'],
  video: ['audio', 'camera', 'accessory'],
  audio: ['camera', 'video'],
  light: ['accessory', 'flash', 'camera'],
  flash: ['camera', 'accessory'],
  accessory: ['camera', 'light']
};

export const normalize = value =>
  String(value || '')
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');

const STOP_WORDS = new Set(['may', 'cho', 'can', 'muon', 'thue', 'mot', 'nhung', 'the', 'and', 'voi', 'cua', 'nao']);

/** Lọc và xếp hạng sản phẩm theo bộ lọc có cấu trúc (do AI trích xuất từ câu hỏi). */
export function rankProducts(products, { categories = [], keywords = '', minPrice = null, maxPrice = null } = {}) {
  const wanted = new Set((categories || []).filter(item => CATEGORIES.includes(item)));
  const words = normalize(keywords)
    .split(/[^a-z0-9]+/)
    .filter(word => word.length > 1 && !STOP_WORDS.has(word));
  return products
    .filter(
      product =>
        product.availableStock > 0 &&
        (!wanted.size || wanted.has(product.category)) &&
        (minPrice == null || product.price >= minPrice) &&
        (maxPrice == null || product.price <= maxPrice)
    )
    .map(product => {
      const content = normalize(
        `${product.name} ${product.brandLabel} ${product.spec} ${product.format} ${product.best?.join(' ') || ''}`
      );
      const score = words.reduce((sum, word) => sum + (content.includes(word) ? 3 : 0), 0);
      return { product, score };
    })
    .sort(
      (a, b) => b.score - a.score || b.product.rentalCount - a.product.rentalCount || a.product.price - b.product.price
    )
    .map(item => item.product);
}

/** Thẻ sản phẩm hiển thị dưới câu trả lời. */
export function productCard(product) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: product.price,
    image: product.images?.[0] || null,
    spec: product.spec
  };
}

/**
 * Chọn thẻ sản phẩm để hiển thị: ưu tiên sản phẩm được nhắc tên trong câu trả lời,
 * nếu không có thì lấy các kết quả tìm kiếm gần nhất. Chỉ dùng sản phẩm thật lấy từ công cụ.
 */
export function pickCards(answer, seen, lastResults, limit = 4) {
  const text = normalize(answer);
  const mentioned = [...seen.values()]
    .map(product => ({ product, at: text.indexOf(normalize(product.name)) }))
    .filter(item => item.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(item => item.product);
  return (mentioned.length ? mentioned : lastResults).slice(0, limit).map(productCard);
}

/** Lịch sử hội thoại do trình duyệt gửi lên: chỉ giữ vai trò hợp lệ, cắt độ dài và số lượt. */
export function sanitizeHistory(history, { maxTurns = 12, maxChars = 1000 } = {}) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      item => item && ['user', 'assistant'].includes(item.role) && typeof item.text === 'string' && item.text.trim()
    )
    .slice(-maxTurns)
    .map(item => ({ role: item.role, content: item.text.trim().slice(0, maxChars) }));
}

/** Gợi ý thuê kèm dự phòng theo nhóm bổ trợ, khi chưa có đủ đơn thuê thực tế. */
export function complementaryPicks(product, products, excludeIds = [], limit = 3) {
  const order = COMPLEMENTARY[product.category] || [];
  const skip = new Set([product.id, ...excludeIds]);
  const picks = [];
  // Máy ảnh và ống kính phải cùng ngàm: ưu tiên cùng hãng để tránh gợi ý ống kính không lắp được.
  const brand = normalize(product.brandLabel);
  const sameBrand = item => Number(Boolean(brand) && normalize(item.brandLabel) === brand);
  for (const category of order) {
    const best = products
      .filter(item => item.category === category && item.availableStock > 0 && !skip.has(item.id))
      .sort((a, b) => sameBrand(b) - sameBrand(a) || b.rentalCount - a.rentalCount || a.price - b.price)[0];
    if (best) {
      picks.push(best);
      skip.add(best.id);
    }
    if (picks.length >= limit) break;
  }
  return picks;
}
