(function () {
  const input = document.getElementById('search-input');
  const wrapper = document.getElementById('search-wrapper');
  const results = document.getElementById('search-result');
  if (!input || !wrapper || !results || input._searchInitialized) return;
  input._searchInitialized = true;
  input.setAttribute('aria-label', '搜索文章');

  const path = ctx.root + ctx.search.path.replace(/^\//, '');
  const cacheKey = 'search_cache_v2:' + path;
  let entries = null;
  let request = null;
  let fetched = false;
  let failure = false;
  let debounce;

  function prepare(data) {
    if (!Array.isArray(data)) throw new Error('搜索索引格式错误');
    return data.filter(item => item && typeof item.path === 'string').map(item => {
      const title = String(item.title || '未命名文章');
      const content = String(item.content || '');
      return { title, content, path: item.path, titleLower: title.toLowerCase(), contentLower: content.toLowerCase() };
    });
  }

  function status(text) {
    const message = document.createElement('p');
    message.className = 'search-result-content';
    message.setAttribute('role', 'status');
    message.textContent = text;
    results.appendChild(message);
  }

  function highlight(element, text, keywords) {
    const escaped = keywords.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(escaped.join('|'), 'gi');
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
      element.appendChild(document.createTextNode(text.slice(offset, match.index)));
      const span = document.createElement('span');
      span.className = 'search-keyword';
      span.textContent = match[0];
      element.appendChild(span);
      offset = match.index + match[0].length;
    }
    element.appendChild(document.createTextNode(text.slice(offset)));
  }

  function render() {
    const query = input.value.trim().toLowerCase();
    results.replaceChildren();
    wrapper.classList.remove('noresult');
    wrapper.setAttribute('searching', String(query.length > 0));
    if (!query) return;
    if (!entries) {
      status(failure ? '搜索加载失败，请重新点击搜索框或输入关键词重试。' : '正在加载搜索索引…');
      return;
    }

    const keywords = [...new Set(query.split(/\s+/))].slice(0, 10).sort((a, b) => b.length - a.length);
    const filter = input.getAttribute('data-filter') || '';
    const matches = [];
    entries.forEach(entry => {
      if (filter && !entry.path.includes(filter)) return;
      let rank = 0;
      let first = -1;
      keywords.forEach(keyword => {
        if (entry.titleLower.includes(keyword)) rank += 3;
        const index = entry.contentLower.indexOf(keyword);
        if (index >= 0) {
          rank += 1;
          if (first < 0 || index < first) first = index;
        }
      });
      if (rank) matches.push({ entry, rank, first });
    });
    matches.sort((a, b) => b.rank - a.rank);

    const list = document.createElement('ul');
    list.className = 'search-result-list';
    matches.slice(0, 50).forEach(({ entry, first }) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      const url = entry.path.replace(/^\/{2,}/, '/').replace(/\/?index\.html$/, '/').replace(/\.html$/, '/');
      link.href = url;
      const title = document.createElement('span');
      title.className = 'search-result-title';
      title.textContent = entry.title;
      link.appendChild(title);
      if (entry.content) {
        const start = Math.max(0, first - 20);
        const excerpt = document.createElement('p');
        excerpt.className = 'search-result-content';
        highlight(excerpt, entry.content.slice(start, start + 100) + '…', keywords);
        link.appendChild(excerpt);
      }
      item.appendChild(link);
      list.appendChild(item);
    });
    if (matches.length) results.appendChild(list);
    else status('没有找到相关文章，换个关键词试试。');
    if (failure) status('索引暂时无法更新，当前显示本地缓存。');
  }

  function load() {
    if (request || fetched) return request;
    failure = false;
    if (!entries) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) entries = prepare(JSON.parse(cached));
      } catch (error) {
        console.warn('搜索缓存读取失败', error);
      }
    }
    input.setAttribute('aria-busy', 'true');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    request = fetch(path, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(data => {
        entries = prepare(data);
        fetched = true;
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (error) {
          console.warn('搜索缓存写入失败', error);
        }
      })
      .catch(error => {
        failure = true;
        console.warn('搜索索引加载失败', error);
      })
      .finally(() => {
        clearTimeout(timeout);
        input.setAttribute('aria-busy', 'false');
        request = null;
        render();
      });
    render();
    return request;
  }

  input.addEventListener('focus', () => { load(); render(); });
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    if (!input.value.trim()) { render(); return; }
    debounce = setTimeout(() => { load(); render(); }, 120);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') event.preventDefault();
  });
  if (document.activeElement === input || input.value.trim()) load();
})();
