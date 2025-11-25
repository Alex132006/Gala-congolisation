// 1. Désactiver le menu contextuel
document.addEventListener("contextmenu", function (e) {
  e.preventDefault();
  return false;
});

// 2. Empêcher les raccourcis claviers F12, Ctrl+Shift+I, etc.
document.addEventListener("keydown", function (e) {
  if (
    e.key === "F12" ||
    (e.ctrlKey && e.shiftKey && e.key === "I") ||
    (e.ctrlKey && e.shiftKey && e.key === "C") ||
    (e.ctrlKey && e.key === "u")
  ) {
    e.preventDefault();
    return false;
  }
});
