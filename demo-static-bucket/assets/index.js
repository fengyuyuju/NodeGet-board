document.querySelectorAll('video[src^="assets/"]').forEach(function (el) {
  el.src = el.getAttribute("src").split("?")[0] + "?v=" + (window._V || "");
});

document.getElementById("req-url").textContent = location.href;
document.getElementById("user-agent").textContent = navigator.userAgent;

window.addEventListener("load", () => {
  const nav = performance.getEntriesByType("navigation")[0];
  const ms = nav ? Math.round(nav.responseEnd - nav.startTime) : 0;
  document.getElementById("load-time").textContent = ms + " ms";
});

const timeEl = document.getElementById("current-time");
const fmt = () => new Date().toLocaleTimeString("zh-CN");
timeEl.textContent = fmt();
console.log("nodeget");
setInterval(() => {
  timeEl.textContent = fmt();
}, 1000);
