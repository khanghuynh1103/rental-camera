import { Select } from 'antd';
import { Input } from 'antd';
import UiButton from '../components/UiButton';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { api } from '../api';
import '../styles/products.css';
import '../styles/productToolbar.css';

const categories = [
  ['all', 'Tất cả'],
  ['camera', 'Máy ảnh'],
  ['lens', 'Ống kính']
];
const dropdowns = [
  {
    id: 'video',
    label: 'Thiết bị quay',
    items: [
      ['', 'Tất cả thiết bị quay', 'Toàn bộ'],
      ['gimbal', 'Gimbal', 'Ổn định hình ảnh'],
      ['micro', 'Micro', 'Thu âm'],
      ['action-camera', 'Action camera', 'Quay hành động']
    ]
  },
  {
    id: 'lighting',
    label: 'Ánh sáng',
    items: [
      ['', 'Tất cả thiết bị ánh sáng', 'Toàn bộ'],
      ['studio-light', 'Đèn studio', 'Ánh sáng liên tục'],
      ['flash', 'Đèn flash', 'Ánh sáng tức thời'],
      ['light-stand', 'Chân đèn', 'Giá đỡ ánh sáng']
    ]
  }
];
const money = value => new Intl.NumberFormat('vi-VN').format(value) + 'đ';
const PAGE_SIZE = 12;

function ProductCard({ product, favorite, onFavorite }) {
  return (
    <article className="catalog-card">
      <div className="catalog-media">
        <img className="front" src={product.images[0]} alt={`${product.name} chính diện`} />
        <img className="alternate" src={product.images[1]} alt={`${product.name} góc nghiêng`} />
        <div
          className={`status availability-badge ${product.availableStock <= 2 ? 'low' : ''} ${product.availableStock === 0 ? 'unavailable' : ''}`}
        >
          {product.availableStock > 0 ? (
            <>
              <span>{product.availableStock} thiết bị tại trạm</span>
              <strong>Có thể thuê</strong>
            </>
          ) : (
            <strong>Tạm ngưng cho thuê</strong>
          )}
        </div>
        <UiButton
          className={favorite ? 'favorite active' : 'favorite'}
          onClick={() => onFavorite(product.id)}
          aria-label={`${favorite ? 'Bỏ' : 'Thêm'} ${product.name} ${favorite ? 'khỏi' : 'vào'} yêu thích`}
        >
          {favorite ? '♥' : '♡'}
        </UiButton>
      </div>
      <div className="catalog-body">
        <small>
          {product.brandLabel} · {product.format}
        </small>
        <h2>{product.name}</h2>
        <p>{product.spec}</p>
        <div>
          <strong>
            {money(product.price)} <small>/ ngày</small>
          </strong>
          <Link className="detail-button" to={`/products/${product.id}`}>
            Xem máy →
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function Products() {
  const [urlParams, setUrlParams] = useSearchParams();
  const initialCategory = [...categories.map(([id]) => id), ...dropdowns.map(item => item.id)].includes(
    urlParams.get('category')
  )
    ? urlParams.get('category')
    : 'all';
  const initialQuery = urlParams.get('q') || '';
  const initialSubcategory = urlParams.get('subcategory') || '';
  const startDate = urlParams.get('startDate') || '',
    endDate = urlParams.get('endDate') || '';
  const [products, setProducts] = useState([]),
    [category, setCategory] = useState(initialCategory),
    [subcategory, setSubcategory] = useState(initialSubcategory),
    [openMenu, setOpenMenu] = useState(null),
    [sort, setSort] = useState(urlParams.get('sort') || 'featured'),
    [query, setQuery] = useState(initialQuery),
    [search, setSearch] = useState(initialQuery),
    [loading, setLoading] = useState(true);
  const [page, setPage] = useState(Math.max(1, Number(urlParams.get('page')) || 1)),
    [total, setTotal] = useState(0),
    [totalPages, setTotalPages] = useState(1);
  const [favorites, setFavorites] = useState(() => JSON.parse(localStorage.getItem('cameraFavorites') || '[]'));
  useEffect(() => {
    let active = true;
    api
      .products({ category, subcategory, sort, q: query, page, limit: PAGE_SIZE, startDate, endDate })
      .then(data => {
        if (active) {
          setProducts(data.products);
          setTotal(data.total);
          setTotalPages(data.totalPages);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [category, subcategory, sort, query, page, startDate, endDate]);
  useEffect(() => {
    const next = { category, sort, page: String(page) };
    if (subcategory) next.subcategory = subcategory;
    if (query) next.q = query;
    if (startDate) next.startDate = startDate;
    if (endDate) next.endDate = endDate;
    setUrlParams(next, { replace: true });
  }, [category, subcategory, sort, query, page, startDate, endDate, setUrlParams]);
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const toggleFavorite = id =>
    setFavorites(current => {
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
      localStorage.setItem('cameraFavorites', JSON.stringify(next));
      return next;
    });
  const submit = e => {
    e.preventDefault();
    setPage(1);
    setQuery(search.trim());
  };
  const changePage = next => {
    setPage(next);
    document.querySelector('.catalog-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const chooseCategory = id => {
    setCategory(id);
    setSubcategory('');
    setOpenMenu(null);
    setPage(1);
  };
  const chooseSubcategory = (id, sub) => {
    setCategory(id);
    setSubcategory(sub);
    setOpenMenu(null);
    setPage(1);
  };
  return (
    <>
      <Header />
      <main>
        <section className="catalog-head">
          <div className="container">
            <Link to="/" className="breadcrumb">
              ← Trở về trang chủ
            </Link>
            <div className="catalog-title">
              <div>
                <p className="eyebrow">Kho thiết bị tại trạm</p>
                <h1>
                  Tất cả
                  <br />
                  <em>sản phẩm.</em>
                </h1>
              </div>
              <p>
                Chọn máy ảnh phù hợp với buổi chụp, chuyến đi hoặc dự án của bạn. Di chuột lên ảnh để xem thêm góc chụp
                của thiết bị.
              </p>
            </div>
          </div>
        </section>
        <section className="catalog-toolbar">
          <div className="container toolbar-inner">
            <div className="filter-heading">
              <div>
                <span>Danh mục thiết bị</span>
                <small>Chọn nhóm sản phẩm bạn đang quan tâm</small>
              </div>
              <strong>{total} sản phẩm</strong>
            </div>
            <div className="brand-filters">
              {categories.map(([id, label]) => (
                <UiButton className={category === id ? 'active' : ''} onClick={() => chooseCategory(id)} key={id}>
                  <span className="filter-button-content">
                    <i aria-hidden="true" />
                    <span className="filter-button-label">{label}</span>
                    <span className="filter-button-spacer" />
                  </span>
                </UiButton>
              ))}
              {dropdowns.map(menu => (
                <div className="catalog-filter-menu" key={menu.id}>
                  <UiButton
                    className={`${category === menu.id ? 'active' : ''} has-menu`}
                    aria-expanded={openMenu === menu.id}
                    onClick={() => setOpenMenu(openMenu === menu.id ? null : menu.id)}
                  >
                    <span className="filter-button-content">
                      <i aria-hidden="true" />
                      <span className="filter-button-label">
                        {category === menu.id && subcategory
                          ? menu.items.find(([sub]) => sub === subcategory)?.[1] || menu.label
                          : menu.label}
                      </span>
                      <span className="filter-button-arrow">⌄</span>
                    </span>
                  </UiButton>
                  {openMenu === menu.id && (
                    <div className="catalog-filter-dropdown">
                      {menu.items.map(([sub, label, description]) => (
                        <UiButton
                          key={sub || 'all'}
                          className={category === menu.id && subcategory === sub ? 'selected' : ''}
                          onClick={() => chooseSubcategory(menu.id, sub)}
                        >
                          <span>{label}</span>
                          <small>{description}</small>
                        </UiButton>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="catalog-controls">
              <form onSubmit={submit}>
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm tên thiết bị…"
                  aria-label="Tìm sản phẩm"
                />
                <UiButton>Tìm</UiButton>
              </form>
              <label>
                Sắp xếp{' '}
                <Select
                  value={sort}
                  onChange={value => {
                    setSort(value);
                    setPage(1);
                  }}
                  options={[
                    { value: 'featured', label: 'Nổi bật' },
                    { value: 'low', label: 'Giá thấp đến cao' },
                    { value: 'high', label: 'Giá cao đến thấp' }
                  ]}
                />
              </label>
            </div>
          </div>
        </section>
        <section className="catalog-list">
          <div className="container">
            {startDate && endDate && (
              <div className="rental-period">
                <span>✓</span>
                <div>
                  <strong>Thiết bị còn lịch trong thời gian bạn chọn</strong>
                  <small>
                    Từ {new Date(`${startDate}T00:00:00`).toLocaleDateString('vi-VN')} đến{' '}
                    {new Date(`${endDate}T00:00:00`).toLocaleDateString('vi-VN')}
                  </small>
                </div>
                <Link to="/">Đổi ngày thuê</Link>
              </div>
            )}
            <div className="catalog-meta">
              <span>
                {loading
                  ? 'Đang tải…'
                  : query
                    ? `${total} kết quả cho “${query}”`
                    : `Hiển thị ${products.length} trong ${total} sản phẩm`}
              </span>
              <span>
                Trang {page} / {totalPages} · Giá thuê theo ngày
              </span>
            </div>
            {!loading && products.length === 0 ? (
              <div className="empty-products">
                <b>◎</b>
                <h2>Không tìm thấy thiết bị</h2>
                <p>Thử một từ khóa, nhóm thiết bị hoặc khoảng ngày khác.</p>
                <UiButton
                  onClick={() => {
                    setCategory('all');
                    setSubcategory('');
                    setQuery('');
                    setSearch('');
                    setPage(1);
                  }}
                >
                  Xem tất cả sản phẩm
                </UiButton>
              </div>
            ) : (
              <>
                <div className="catalog-grid">
                  {products.map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      favorite={favoriteSet.has(product.id)}
                      onFavorite={toggleFavorite}
                    />
                  ))}
                </div>
                {totalPages > 1 && (
                  <nav className="pagination" aria-label="Phân trang sản phẩm">
                    <UiButton onClick={() => changePage(page - 1)} disabled={page === 1}>
                      ← Trước
                    </UiButton>
                    {Array.from({ length: totalPages }, (_, index) => index + 1).map(number => (
                      <UiButton
                        key={number}
                        className={page === number ? 'active' : ''}
                        onClick={() => changePage(number)}
                        aria-current={page === number ? 'page' : undefined}
                      >
                        {number}
                      </UiButton>
                    ))}
                    <UiButton onClick={() => changePage(page + 1)} disabled={page === totalPages}>
                      Sau →
                    </UiButton>
                  </nav>
                )}
              </>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
