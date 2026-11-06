// Nén ảnh chụp từ điện thoại (thường 4–8 MB) xuống JPEG khoảng vài trăm KB trước khi gửi lên máy chủ.
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được ảnh. Hãy chụp lại hoặc chọn ảnh JPEG/PNG.'));
    };
    image.src = url;
  });
}

export async function compressImage(file, { maxSize = 1600, quality = 0.8 } = {}) {
  if (file.type && !ACCEPTED.includes(file.type)) throw new Error('Chỉ hỗ trợ ảnh JPEG, PNG, WebP hoặc HEIC.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Ảnh gốc quá lớn (tối đa 25 MB).');
  const image = await loadImage(file);
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  let output = canvas.toDataURL('image/jpeg', quality);
  // Vẫn lớn hơn ~2 MB (ảnh rất chi tiết): giảm chất lượng thêm một lần.
  if (output.length > 2.6 * 1024 * 1024) output = canvas.toDataURL('image/jpeg', 0.6);
  return output;
}
