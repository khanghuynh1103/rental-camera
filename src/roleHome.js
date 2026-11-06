export const roleHome = role => (role === 'ADMIN' ? '/admin' : role === 'DELIVERY_STAFF' ? '/delivery' : '/');
