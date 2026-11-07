async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const body = await response.text();
  let data;
  try {
    data = body ? JSON.parse(body) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const message =
      data.message ||
      (response.status === 413
        ? 'Dữ liệu tải lên quá lớn. Vui lòng bớt số ảnh hoặc chụp lại.'
        : response.status === 429
          ? 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.'
          : `Yêu cầu thất bại (${response.status}). Vui lòng thử lại.`);
    throw Object.assign(new Error(message), { status: response.status, errors: data.errors });
  }
  return data;
}

export const api = {
  products: (filters = {}) => request(`/api/products?${new URLSearchParams(filters)}`),
  product: id => request(`/api/products/${id}`),
  productReviews: id => request(`/api/products/${id}/reviews`),
  createReview: (id, values) =>
    request(`/api/products/${id}/reviews`, { method: 'POST', body: JSON.stringify(values) }),
  recommend: (message, history = []) =>
    request('/api/chat/recommend', { method: 'POST', body: JSON.stringify({ message, history }) }),
  productCalendar: (id, params = {}) => request(`/api/products/${id}/calendar?${new URLSearchParams(params)}`),
  availability: (id, dates) =>
    request(`/api/products/${id}/availability`, { method: 'POST', body: JSON.stringify(dates) }),
  createRental: values => request('/api/rentals', { method: 'POST', body: JSON.stringify(values) }),
  completePayment: (id, options = {}) =>
    request(`/api/rentals/${id}/payment`, { method: 'POST', body: JSON.stringify(options) }),
  me: () => request('/api/auth/me'),
  login: credentials => request('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  register: values => request('/api/auth/register', { method: 'POST', body: JSON.stringify(values) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  updateProfile: values => request('/api/account', { method: 'PATCH', body: JSON.stringify(values) }),
  adminOverview: () => request('/api/admin/overview'),
  adminDashboard: (filters = {}) => request(`/api/admin/dashboard?${new URLSearchParams(filters)}`),
  adminRentals: (filters = {}) => request(`/api/admin/rentals?${new URLSearchParams(filters)}`),
  adminRental: id => request(`/api/admin/rentals/${id}`),
  deliveryStaff: () => request('/api/admin/delivery-staff'),
  assignDeliveryStaff: (id, staffId) =>
    request(`/api/admin/rentals/${id}/assignment`, { method: 'PATCH', body: JSON.stringify({ staffId }) }),
  updateRentalStatus: (id, values) =>
    request(`/api/admin/rentals/${id}/status`, { method: 'PATCH', body: JSON.stringify(values) }),
  storeHandover: (id, values) =>
    request(`/api/admin/rentals/${id}/handover`, { method: 'POST', body: JSON.stringify(values) }),
  storeReturn: (id, values) =>
    request(`/api/admin/rentals/${id}/return`, { method: 'POST', body: JSON.stringify(values) }),
  remindCustomer: (id, message) =>
    request(`/api/admin/rentals/${id}/remind`, { method: 'POST', body: JSON.stringify({ message }) }),
  adminUsers: () => request('/api/admin/users'),
  adminCategories: () => request('/api/admin/categories'),
  adminProducts: (filters = {}) => request(`/api/admin/products?${new URLSearchParams(filters)}`),
  createProduct: values => request('/api/admin/products', { method: 'POST', body: JSON.stringify(values) }),
  updateProduct: (id, values) =>
    request(`/api/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(values) }),
  setProductVisibility: (id, active) =>
    request(`/api/admin/products/${id}/visibility`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  adminEquipment: (filters = {}) => request(`/api/admin/equipment?${new URLSearchParams(filters)}`),
  createEquipment: values => request('/api/admin/equipment', { method: 'POST', body: JSON.stringify(values) }),
  updateEquipment: (id, values) =>
    request(`/api/admin/equipment/${id}`, { method: 'PATCH', body: JSON.stringify(values) }),
  updateUserRole: (id, role) =>
    request(`/api/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  deliveryTasks: (filters = {}) => request(`/api/delivery/tasks?${new URLSearchParams(filters)}`),
  deliveryTask: id => request(`/api/delivery/tasks/${id}`),
  updateDeliveryTask: (id, values) =>
    request(`/api/delivery/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify(values) }),
  accountRentals: () => request('/api/account/rentals'),
  accountRental: id => request(`/api/account/rentals/${id}`),
  cancelRental: (id, reason) =>
    request(`/api/account/rentals/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  extensionOptions: id => request(`/api/account/rentals/${id}/extension-options`),
  identityStatus: () => request('/api/account/identity'),
  submitIdentity: values => request('/api/account/identity', { method: 'POST', body: JSON.stringify(values) }),
  withdrawIdentity: () => request('/api/account/identity', { method: 'DELETE' }),
  adminIdentity: (filters = {}) => request(`/api/admin/identity?${new URLSearchParams(filters)}`),
  reviewIdentity: (id, values) =>
    request(`/api/admin/identity/${id}`, { method: 'PATCH', body: JSON.stringify(values) }),
  adminDeliveries: (filters = {}) => request(`/api/admin/notification-deliveries?${new URLSearchParams(filters)}`),
  retryDelivery: id => request(`/api/admin/notification-deliveries/${id}/retry`, { method: 'POST' }),
  notificationPreferences: () => request('/api/account/notification-preferences'),
  updateNotificationPreferences: values =>
    request('/api/account/notification-preferences', { method: 'PATCH', body: JSON.stringify(values) }),
  notifications: () => request('/api/account/notifications'),
  markNotificationsRead: () => request('/api/account/notifications/read', { method: 'POST' }),
  requestExtension: (id, values) =>
    request(`/api/account/rentals/${id}/extensions`, { method: 'POST', body: JSON.stringify(values) }),
  payExtraCharge: id => request(`/api/account/charges/${id}/payment`, { method: 'POST' }),
  adminExtensions: () => request('/api/admin/extensions'),
  reviewExtension: (id, status) =>
    request(`/api/admin/extensions/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  adminIncidents: () => request('/api/admin/incidents'),
  resolveIncident: (id, values) =>
    request(`/api/admin/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(values) })
};
