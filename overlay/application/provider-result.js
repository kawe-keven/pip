function success(text, usage = null) {
  return { ok: true, text, ...(usage ? { usage } : {}) };
}

function failure(text) {
  return { ok: false, text };
}

module.exports = { success, failure };
