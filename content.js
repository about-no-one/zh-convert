(() => {
  if (window.__zhConvert) return;

  const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;
  const HAS_HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION",
    "CODE", "PRE", "RT", "RP", "RUBY", "IFRAME", "SVG", "CANVAS"
  ]);

  let records = [];      // để khôi phục
  let observer = null;   // theo dõi nội dung tải thêm
  let current = null;    // { opts, convert }
  let pending = new Set();
  let timer = null;

  function injectStyle() {
    if (document.getElementById("zhc-style")) return;
    const s = document.createElement("style");
    s.id = "zhc-style";
    s.textContent = `
      .zhc-wrap ruby { ruby-position: under; ruby-align: center; }
      .zhc-wrap rt { font-size: .5em; line-height: 1.1; color: #c0392b; font-weight: 400;
                     font-family: system-ui, sans-serif; user-select: none; }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  // Thu thập text node chứa chữ Hán, kể cả trong Shadow DOM mở
  function collect(root, out) {
    if (root.nodeType === Node.TEXT_NODE) {
      const p = root.parentElement;
      if (p && HAS_HAN.test(root.nodeValue) && !p.closest("ruby, .zhc-wrap, " + [...SKIP_TAGS].join(",")) && !p.isContentEditable)
        out.push(root);
      return out;
    }
    if (root.nodeType === Node.ELEMENT_NODE) {
      if (SKIP_TAGS.has(root.tagName.toUpperCase()) || root.classList.contains("zhc-wrap") || root.isContentEditable) return out;
      if (root.shadowRoot) collect(root.shadowRoot, out);
    }
    for (const child of root.childNodes) collect(child, out);
    return out;
  }

  let t2s = null;
  // pinyin-pro đoán âm đa âm tốt hơn với chữ giản thể, nên tính pinyin từ bản giản thể
  function simplifiedSource(display, original) {
    if (!t2s) t2s = OpenCC.Converter({ from: "t", to: "cn" });
    const src = t2s(original);
    return src.length === display.length ? src : display;
  }

  function buildRuby(text, tone, source) {
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(HAN)) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const chars = Array.from(m[0]);
      const segment = source.slice(m.index, m.index + m[0].length);
      const py = pinyinPro.pinyin(segment, { type: "array", toneType: tone });
      chars.forEach((ch, i) => {
        const ruby = document.createElement("ruby");
        ruby.appendChild(document.createTextNode(ch));
        const rt = document.createElement("rt");
        rt.textContent = py[i] || "";
        ruby.appendChild(rt);
        frag.appendChild(ruby);
      });
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }

  function makeConverter(opts) {
    if (opts.mode === "s2t") return OpenCC.Converter({ from: "cn", to: opts.variant });
    if (opts.mode === "t2s") return OpenCC.Converter({ from: "t", to: "cn" });
    return null;
  }

  function processNodes(nodes) {
    const { opts, convert } = current;
    let count = 0;
    for (const node of nodes) {
      if (!node.isConnected) continue;
      const original = node.nodeValue;
      const text = convert ? convert(original) : original;
      if (opts.pinyin) {
        const wrapper = document.createElement("span");
        wrapper.className = "zhc-wrap";
        wrapper.appendChild(buildRuby(text, opts.tone, simplifiedSource(text, original)));
        node.replaceWith(wrapper);
        records.push({ kind: "ruby", wrapper, original: node });
      } else if (text !== original) {
        node.nodeValue = text;
        records.push({ kind: "text", node, original });
      }
      count++;
    }
    return count;
  }

  function flush() {
    timer = null;
    if (!current) return;
    const nodes = [];
    for (const n of pending) if (n.isConnected) collect(n, nodes);
    pending.clear();
    if (nodes.length) processNodes(nodes);
  }

  function startObserver() {
    stopObserver();
    observer = new MutationObserver((muts) => {
      for (const m of muts)
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && n.classList.contains("zhc-wrap")) continue;
          if (n.nodeType === 3 && n.parentElement && n.parentElement.closest(".zhc-wrap")) continue;
          pending.add(n);
        }
      if (pending.size && !timer) timer = setTimeout(flush, 150);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) observer.disconnect();
    observer = null;
    clearTimeout(timer);
    timer = null;
    pending.clear();
  }

  function restore() {
    stopObserver();
    current = null;
    for (const r of records) {
      if (r.kind === "text") r.node.nodeValue = r.original;
      else if (r.wrapper.isConnected) r.wrapper.replaceWith(r.original);
    }
    records = [];
  }

  function apply(opts) {
    restore();
    injectStyle();
    current = { opts, convert: makeConverter(opts) };
    const count = processNodes(collect(document.body || document.documentElement, []));
    startObserver();
    return count;
  }

  window.__zhConvert = { apply, restore };
})();
