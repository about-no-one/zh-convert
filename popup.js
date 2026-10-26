const $ = (id) => document.getElementById(id);
const DEFAULTS = { mode: "s2t", variant: "t", pinyin: true, tone: "symbol" };
const FILES = ["lib/opencc.js", "lib/pinyin-pro.js", "content.js"];

function readOptions() {
  return { mode: $("mode").value, variant: $("variant").value, pinyin: $("pinyin").checked, tone: $("tone").value };
}

function refreshUI() {
  $("variantRow").classList.toggle("hidden", $("mode").value !== "s2t");
  $("toneRow").classList.toggle("hidden", !$("pinyin").checked);
}

function setStatus(msg, isErr = false) {
  $("status").textContent = msg;
  $("status").className = isErr ? "err" : "";
}

// Chạy trong mọi khung (iframe) của tab hiện tại, trả về tổng số đoạn đã xử lý
async function run(action, options) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const target = { tabId: tab.id, allFrames: true };
  try {
    await chrome.scripting.executeScript({ target, files: FILES });
    const results = await chrome.scripting.executeScript({
      target,
      func: (act, opts) => {
        if (!window.__zhConvert) return 0;
        if (act === "restore") { window.__zhConvert.restore(); return 0; }
        return window.__zhConvert.apply(opts);
      },
      args: [action, options || null]
    });
    return { count: results.reduce((s, r) => s + (r.result || 0), 0), frames: results.length };
  } catch (e) {
    setStatus("Không thể chạy trên trang này: " + (e.message || e), true);
    return null;
  }
}

(async () => {
  const saved = await chrome.storage.local.get(DEFAULTS);
  $("mode").value = saved.mode;
  $("variant").value = saved.variant;
  $("pinyin").checked = saved.pinyin;
  $("tone").value = saved.tone;
  refreshUI();
})();

["mode", "pinyin"].forEach((id) => $(id).addEventListener("change", refreshUI));

$("apply").addEventListener("click", async () => {
  const opts = readOptions();
  chrome.storage.local.set(opts);
  setStatus("Đang xử lý...");
  const res = await run("apply", opts);
  if (res) setStatus(res.count
    ? `Đã xử lý ${res.count} đoạn văn bản (${res.frames} khung). Nội dung tải thêm cũng sẽ được chuyển.`
    : `Không tìm thấy chữ Hán (đã quét ${res.frames} khung).`);
});

$("restore").addEventListener("click", async () => {
  const res = await run("restore");
  if (res) setStatus("Đã khôi phục trang gốc.");
});
