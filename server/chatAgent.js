// Trợ lý AI dùng công cụ (tool calling): mô hình ngôn ngữ hiểu câu hỏi và tự gọi các hàm của hệ thống
// để tìm thiết bị, kiểm tra lịch trống, tính giá và gợi ý thuê kèm. Mọi số liệu đều lấy từ database;
// mô hình chỉ quyết định cần gọi hàm nào và diễn đạt lại kết quả.
import { query } from './db.js';
import { getProductBySlug, listProducts } from './productRepository.js';
import { countAvailableEquipment } from './rentalService.js';
import { RULES, rentalDays, requiresIdentity, validateRentalPeriod } from './rules.js';
import { addDays, todayVN } from './time.js';
import { CATEGORIES, complementaryPicks, pickCards, rankProducts, sanitizeHistory } from './chatLogic.js';

const MAX_TOOL_ROUNDS = 5;

// Lược đồ tham số viết ở dạng tối giản (không dùng kiểu hợp ['string','null'] hay strict)
// để chạy được trên mọi nhà cung cấp tương thích OpenAI: Gemini, Groq, OpenRouter, Ollama, OpenAI.
const fn = (name, description, properties, required) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } }
});

const TOOLS = [
  fn(
    'tim_thiet_bi',
    'Tìm thiết bị đang cho thuê trong kho theo nhóm, từ khóa, khoảng giá thuê mỗi ngày và (tùy chọn) khoảng ngày thuê. Trả về tối đa 5 sản phẩm thật.',
    {
      categories: {
        type: 'array',
        items: { type: 'string', enum: CATEGORIES },
        description:
          'camera=máy ảnh, lens=ống kính, video=gimbal/máy quay/action cam, audio=micro, light=đèn studio, flash=đèn flash, accessory=phụ kiện. Bỏ trống = mọi nhóm.'
      },
      keywords: {
        type: 'string',
        description: 'Từ khóa ngắn về hãng, mẫu máy hoặc tính năng (vd "sony full-frame", "50mm").'
      },
      min_price: { type: 'integer', description: 'Giá thuê tối thiểu mỗi ngày (VND).' },
      max_price: { type: 'integer', description: 'Giá thuê tối đa mỗi ngày (VND).' },
      start_date: { type: 'string', description: 'Ngày nhận YYYY-MM-DD, chỉ khi khách nêu ngày.' },
      end_date: { type: 'string', description: 'Ngày trả YYYY-MM-DD; thuê 1 ngày thì bằng ngày nhận.' }
    },
    []
  ),
  fn(
    'kiem_tra_lich_va_gia',
    'Kiểm tra một sản phẩm còn trống trong khoảng ngày hay không, tính tiền thuê, tiền cọc, có cần xác minh CCCD không; nếu hết lịch thì đề xuất ngày bắt đầu gần nhất còn trống.',
    {
      product_id: { type: 'string', description: 'Mã sản phẩm (trường id lấy từ kết quả tim_thiet_bi).' },
      start_date: { type: 'string', description: 'Ngày nhận YYYY-MM-DD.' },
      end_date: { type: 'string', description: 'Ngày trả YYYY-MM-DD.' }
    },
    ['product_id', 'start_date', 'end_date']
  ),
  fn(
    'thiet_bi_thue_kem',
    'Gợi ý thiết bị thường được thuê kèm với một sản phẩm, dựa trên lịch sử các đơn thuê thực tế (có số lần và tỉ lệ).',
    { product_id: { type: 'string', description: 'Mã sản phẩm (trường id).' } },
    ['product_id']
  )
];

/**
 * Cấu hình nhà cung cấp AI qua .env. Ưu tiên AI_API_KEY + AI_BASE_URL + AI_MODEL (mọi API tương thích OpenAI);
 * nếu chỉ có OPENAI_API_KEY thì dùng OpenAI như trước.
 */
export function aiConfig(env = process.env) {
  const extra = {
    reasoningEffort: env.AI_REASONING_EFFORT || null,
    timeoutMs: Number(env.AI_TIMEOUT_MS) || 15000
  };
  const fallbacks = String(env.AI_FALLBACK_MODELS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  const withModels = (config, model) => ({ ...config, ...extra, model, models: [...new Set([model, ...fallbacks])] });
  if (env.AI_API_KEY || env.AI_BASE_URL) {
    return withModels(
      {
        apiKey: env.AI_API_KEY || 'none',
        baseUrl: String(env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
      },
      env.AI_MODEL || 'gpt-4.1-mini'
    );
  }
  if (env.OPENAI_API_KEY)
    return withModels(
      { apiKey: env.OPENAI_API_KEY, baseUrl: 'https://api.openai.com/v1' },
      env.OPENAI_MODEL || 'gpt-4.1-mini'
    );
  return null;
}

const brief = product => ({
  id: product.id,
  ten: product.name,
  nhom: product.category,
  hang: product.brandLabel,
  thong_so: product.spec,
  gia_ngay: product.price,
  tien_coc: product.deposit,
  so_luot_thue: product.rentalCount
});

function periodError(startDate, endDate) {
  return validateRentalPeriod(startDate, endDate, todayVN());
}

async function searchTool(args, ctx) {
  const ranked = rankProducts(ctx.products, {
    categories: args.categories,
    keywords: args.keywords,
    minPrice: Number.isFinite(args.min_price) && args.min_price > 0 ? args.min_price : null,
    maxPrice: Number.isFinite(args.max_price) && args.max_price > 0 ? args.max_price : null
  });
  let results = ranked.slice(0, 8);
  let note = null;
  if (args.start_date) {
    const endDate = args.end_date || args.start_date;
    const error = periodError(args.start_date, endDate);
    if (error) note = `Không lọc theo ngày: ${error}`;
    else {
      const counts = await Promise.all(
        results.map(product => countAvailableEquipment(product.databaseId, args.start_date, endDate))
      );
      results = results.filter((_, index) => counts[index] > 0);
      note = `Chỉ gồm thiết bị còn trống từ ${args.start_date} đến ${endDate}.`;
    }
  }
  results = results.slice(0, 5);
  ctx.lastResults = results;
  results.forEach(product => ctx.seen.set(product.id, product));
  return { so_ket_qua: results.length, ghi_chu: note, san_pham: results.map(brief) };
}

async function availabilityTool(args, ctx) {
  const product = ctx.products.find(item => item.id === args.product_id) || (await getProductBySlug(args.product_id));
  if (!product) return { loi: 'Không tìm thấy sản phẩm với mã này. Hãy dùng tim_thiet_bi để lấy mã đúng.' };
  ctx.seen.set(product.id, product);
  const error = periodError(args.start_date, args.end_date);
  if (error) return { san_pham: product.name, loi: error };
  const days = rentalDays(args.start_date, args.end_date);
  const available = await countAvailableEquipment(product.databaseId, args.start_date, args.end_date);
  const result = {
    san_pham: product.name,
    id: product.id,
    tu_ngay: args.start_date,
    den_ngay: args.end_date,
    so_ngay: days,
    con_trong: available > 0,
    so_may_trong: available,
    tien_thue: product.price * days,
    tien_coc: product.deposit,
    tong_thanh_toan: product.price * days + product.deposit,
    can_xac_minh_cccd: requiresIdentity(product.deposit),
    quy_dinh: `Mỗi đơn có ${RULES.bufferDays} ngày đệm sau ngày trả để kiểm tra thiết bị; phí trả muộn ${RULES.lateFeeRate * 100}% giá ngày.`
  };
  if (!available) {
    for (let offset = 1; offset <= 21; offset += 1) {
      const start = addDays(args.start_date, offset);
      const end = addDays(start, days - 1);
      if (periodError(start, end)) break;
      if ((await countAvailableEquipment(product.databaseId, start, end)) > 0) {
        result.goi_y_ngay_gan_nhat = { tu_ngay: start, den_ngay: end };
        break;
      }
    }
  }
  return result;
}

async function rentedTogetherTool(args, ctx) {
  const product = ctx.products.find(item => item.id === args.product_id) || (await getProductBySlug(args.product_id));
  if (!product) return { loi: 'Không tìm thấy sản phẩm với mã này.' };
  ctx.seen.set(product.id, product);
  const together = await query(
    `WITH base AS (
       SELECT DISTINCT ri.rental_id FROM rental_items ri JOIN rentals r ON r.id=ri.rental_id
       WHERE ri.product_id=$1 AND r.status<>'CANCELLED')
     SELECT p.slug, COUNT(DISTINCT ri.rental_id)::INT AS times, (SELECT COUNT(*) FROM base)::INT AS total
     FROM rental_items ri JOIN base b ON b.rental_id=ri.rental_id JOIN products p ON p.id=ri.product_id
     WHERE ri.product_id<>$1 AND p.active
     GROUP BY p.slug ORDER BY times DESC, p.slug LIMIT 3`,
    [product.databaseId]
  );
  const bySlug = new Map(ctx.products.map(item => [item.id, item]));
  const fromHistory = together.rows
    .map(row => ({ product: bySlug.get(row.slug), times: row.times, total: row.total }))
    .filter(item => item.product && item.product.availableStock > 0);
  const extra = complementaryPicks(
    product,
    ctx.products,
    fromHistory.map(item => item.product.id),
    Math.max(0, 3 - fromHistory.length)
  );
  const items = [
    ...fromHistory.map(item => ({
      ...brief(item.product),
      nguon: 'lich_su_thue',
      so_lan_thue_cung: item.times,
      ti_le: `${Math.round((item.times / item.total) * 100)}% đơn có ${product.name}`
    })),
    ...extra.map(item => ({ ...brief(item), nguon: 'nhom_bo_tro' }))
  ];
  items.forEach(item => ctx.seen.set(item.id, bySlug.get(item.id)));
  ctx.lastResults = items.map(item => bySlug.get(item.id));
  return { san_pham_goc: product.name, goi_y: items };
}

const HANDLERS = {
  tim_thiet_bi: searchTool,
  kiem_tra_lich_va_gia: availabilityTool,
  thiet_bi_thue_kem: rentedTogetherTool
};

function instructions() {
  const today = todayVN();
  const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date()
  );
  return [
    `Bạn là trợ lý tư vấn thuê thiết bị của Trạm Máy Ảnh. Hôm nay là ${weekday}, ${today} (giờ Việt Nam).`,
    'Trả lời bằng tiếng Việt, ngắn gọn (tối đa khoảng 120 từ), thân thiện, xưng "mình".',
    'LUÔN dùng công cụ để lấy sản phẩm, giá, lịch trống và tiền cọc. Tuyệt đối không bịa sản phẩm, giá, thông số hay lịch trống ngoài kết quả công cụ.',
    'Khi khách nói ngày tương đối ("mai", "cuối tuần này", "thứ 7"), tự đổi sang YYYY-MM-DD dựa vào ngày hôm nay.',
    'Khi khách đã nêu ngày và chọn/quan tâm một sản phẩm cụ thể, gọi kiem_tra_lich_va_gia để báo tổng tiền, cọc và việc có cần xác minh CCCD.',
    'Sau khi gợi ý máy ảnh hoặc máy quay, có thể gọi thiet_bi_thue_kem để gợi ý thêm 1–2 món đi kèm; nói rõ gợi ý dựa trên lịch sử thuê nếu nguon là lich_su_thue.',
    'Khi gợi ý ống kính đi kèm máy ảnh khác hãng, nhắc khách kiểm tra ngàm (mount) có tương thích không.',
    'Nhắc tên sản phẩm đúng như trong kết quả công cụ. Định dạng tiền kiểu 450.000đ.',
    'Nếu chưa rõ nhu cầu hoặc ngân sách, vẫn gợi ý vài lựa chọn phổ biến rồi hỏi thêm một câu.',
    'Chỉ tư vấn về thuê thiết bị quay chụp; từ chối lịch sự các chủ đề khác. Không thực hiện đặt đơn, hãy hướng dẫn khách bấm vào sản phẩm để đặt.'
  ].join('\n');
}

async function requestModel(config, model, messages) {
  const body = { model, messages, tools: TOOLS, temperature: 0.3, max_tokens: 1200 };
  if (config.reasoningEffort) body.reasoning_effort = config.reasoningEffort;
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.timeoutMs)
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const info = Array.isArray(detail) ? detail[0] : detail;
    const code = info?.error?.status || info?.error?.code || info?.error?.type || null;
    const error = new Error(`AI API ${model}: ${response.status}${code ? ` (${code})` : ''}`);
    error.status = response.status;
    error.code = code;
    throw error;
  }
  return response.json();
}

/** Model đang quá tải (503), lỗi máy chủ hoặc quá thời gian: thử model dự phòng kế tiếp. */
const shouldTryNext = error => error.name === 'TimeoutError' || error.status === 503 || error.status >= 500;

async function callModel(config, messages) {
  let lastError;
  for (const model of config.models) {
    try {
      const data = await requestModel(config, model, messages);
      // Giữ model vừa chạy được cho các vòng gọi công cụ sau trong cùng câu hỏi.
      config.models = [model, ...config.models.filter(item => item !== model)];
      return data;
    } catch (error) {
      lastError = error;
      if (!shouldTryNext(error)) throw error;
      console.warn(`AI model ${model} unavailable, trying next:`, error.message);
    }
  }
  throw lastError;
}

const textOf = content =>
  typeof content === 'string' ? content : Array.isArray(content) ? content.map(part => part.text || '').join('') : '';

/**
 * Chạy vòng lặp agent. Trả về null nếu chưa cấu hình AI (để route dùng phương án dự phòng).
 * `steps` ghi lại các công cụ đã gọi, phục vụ hiển thị minh bạch và kiểm thử.
 */
export async function runAgent(message, history = []) {
  const config = aiConfig();
  if (!config) return null;
  const ctx = { products: await listProducts(), seen: new Map(), lastResults: [] };
  const messages = [
    { role: 'system', content: instructions() },
    ...sanitizeHistory(history),
    { role: 'user', content: message }
  ];
  const steps = [];
  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const data = await callModel(config, messages);
    const reply = data.choices?.[0]?.message;
    const calls = reply?.tool_calls || [];
    if (!calls.length) {
      const answer = textOf(reply?.content).trim();
      if (!answer) return null;
      return { answer, recommendations: pickCards(answer, ctx.seen, ctx.lastResults), steps };
    }
    messages.push({ role: 'assistant', content: reply.content ?? null, tool_calls: calls });
    for (const call of calls) {
      let output;
      try {
        const args = JSON.parse(call.function?.arguments || '{}');
        const handler = HANDLERS[call.function?.name];
        output = handler ? await handler(args, ctx) : { loi: `Không có công cụ ${call.function?.name}.` };
        steps.push({ tool: call.function.name, args });
      } catch (error) {
        console.error(`Chat tool ${call.function?.name} failed:`, error.message);
        output = { loi: 'Công cụ tạm thời lỗi, hãy trả lời dựa trên thông tin đã có.' };
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) });
    }
  }
  return {
    answer: 'Mình đã tìm được vài lựa chọn bên dưới. Bạn cho mình biết thêm ngày thuê để mình kiểm tra lịch nhé.',
    recommendations: pickCards('', ctx.seen, ctx.lastResults),
    steps
  };
}
