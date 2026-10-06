export function el(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null && text !== undefined) node.textContent = String(text);
  return node;
}

export function button(text, className = 'btn', type = 'button') {
  const node = el('button', className, text);
  node.type = type;
  return node;
}

export function labeledField(label, control) {
  const wrap = el('label', 'mod-field');
  wrap.append(el('span', 'mod-label', label), control);
  return wrap;
}

export function setFeedback(node, message = '', tone = 'ok') {
  if (!node) return;
  node.textContent = message;
  node.dataset.tone = tone;
  node.hidden = !message;
}
