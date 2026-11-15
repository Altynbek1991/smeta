"use strict";

const items = document.querySelector("#items");
const template = document.querySelector("#item-template");
const totalOutput = document.querySelector("#total");
const discountInput = document.querySelector("#discount");
const vatInput = document.querySelector("#vat");
const currencyInput = document.querySelector("#currency");
const draftKey = "smeta-draft-v1";
const draftFields = {
  sender: document.querySelector('[name="sender"]'),
  recipient: document.querySelector('[name="recipient"]'),
  number: document.querySelector('[name="estimate-number"]'),
  date: document.querySelector("#estimate-date"),
  discount: discountInput,
  vat: vatInput,
  currency: currencyInput,
  comment: document.querySelector("#comment"),
};
let draftReady = false;
let copyTimer;
const moneyFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function parseNumber(value) {
  const text = value.trim().replace(/[\u00a0\u202f]/g, " ");
  // Принимаем десятичную запятую и пробелы в группах тысяч.
  if (!/^(?:\d+|\d{1,3}(?: \d{3})+)(?:[.,]\d+)?$/.test(text)) return 0;
  const number = Number(text.replace(/ /g, "").replace(",", "."));
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function formatMoney(value) {
  return `${moneyFormatter.format(value).replace(/[\u00a0\u202f]/g, " ")} ${currencyInput.value}`;
}

function recalculate() {
  let subtotal = 0;
  for (const row of items.rows) {
    const quantity = parseNumber(row.querySelector('[data-field="quantity"]').value);
    const price = parseNumber(row.querySelector('[data-field="price"]').value);
    const amount = Math.round(quantity * price);
    // Не допускаем бесконечность и потерю точности при чрезмерных числах.
    const safeAmount = Number.isSafeInteger(amount) ? amount : 0;
    row.querySelector('[data-field="amount"]').textContent = formatMoney(safeAmount);
    subtotal += safeAmount;
  }
  if (!Number.isSafeInteger(subtotal)) subtotal = 0;
  const discountRate = Math.min(100, parseNumber(discountInput.value));
  const discount = Math.round(subtotal * (discountRate / 100));
  const discounted = subtotal - discount;
  const vat = Math.round(discounted * (parseNumber(vatInput.value) / 100));
  const safeVat = Number.isSafeInteger(vat) ? vat : 0;
  document.querySelector("#subtotal").textContent = formatMoney(subtotal);
  for (const [id, amount] of [["discount", discount], ["discounted", discounted], ["vat", safeVat]]) {
    document.querySelector(`#${id}-amount`).textContent = formatMoney(amount);
    document.querySelector(`#${id}-row`).hidden = amount === 0;
  }
  const total = discounted + safeVat;
  totalOutput.textContent = formatMoney(Number.isSafeInteger(total) ? total : 0);
  document.querySelectorAll("[data-currency]").forEach((label) => {
    label.textContent = currencyInput.value;
  });
}

function addItem(focus = true, data = null) {
  const row = template.content.firstElementChild.cloneNode(true);
  if (data) {
    for (const key of ["name", "quantity", "unit", "price"]) {
      row.querySelector(`[data-field="${key}"]`).value = data[key];
    }
  }
  items.append(row);
  if (focus) row.querySelector('[data-field="name"]').focus();
  recalculate();
  saveDraft();
}

document.querySelector("#add-item").addEventListener("click", () => addItem());
items.addEventListener("input", recalculate);
document.querySelector("#calculation-settings").addEventListener("input", recalculate);
currencyInput.addEventListener("change", recalculate);
items.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing || event.repeat) return;
  const row = event.target.closest("tr");
  if (event.target.matches("input") && row === items.lastElementChild) {
    event.preventDefault();
    addItem();
  }
});
items.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-button");
  if (!button) return;
  const row = button.closest("tr");
  const nextRow = row.nextElementSibling || row.previousElementSibling;
  row.remove();
  recalculate();
  saveDraft();
  if (nextRow) nextRow.querySelector('[data-field="name"]').focus();
  else document.querySelector("#add-item").focus();
});

function todayDate() {
  const today = new Date();
  return [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
}

function saveDraft() {
  if (!draftReady) return;
  const data = {
    version: 1,
    fields: Object.fromEntries(Object.entries(draftFields).map(([key, field]) => [key, field.value])),
    items: Array.from(items.rows, (row) => Object.fromEntries(
      ["name", "quantity", "unit", "price"].map((key) => [key, row.querySelector(`[data-field="${key}"]`).value])
    )),
  };
  try {
    localStorage.setItem(draftKey, JSON.stringify(data));
    document.querySelector("#draft-status").textContent = "";
  } catch {
    document.querySelector("#draft-status").textContent = "Не удалось сохранить черновик в браузере. Сохраните PDF или скопируйте смету перед закрытием.";
  }
}

function restoreDraft() {
  try {
    const saved = localStorage.getItem(draftKey);
    if (saved === null) return false;
    const data = JSON.parse(saved);
    const valid = data && data.version === 1 && data.fields &&
      Object.keys(draftFields).every((key) => typeof data.fields[key] === "string") &&
      ["₸", "₽", "$", "€"].includes(data.fields.currency) &&
      Array.isArray(data.items) && data.items.every((row) => row &&
        ["name", "quantity", "unit", "price"].every((key) => typeof row[key] === "string") &&
        ["шт", "час", "услуга"].includes(row.unit));
    if (!valid) throw new Error("Invalid draft");
    for (const [key, field] of Object.entries(draftFields)) field.value = data.fields[key];
    data.items.forEach((row) => addItem(false, row));
    recalculate();
    return true;
  } catch {
    document.querySelector("#draft-status").textContent = "Не удалось восстановить черновик. Проверьте доступ к хранилищу браузера.";
    return false;
  }
}

draftFields.date.value = todayDate();
if (!restoreDraft()) addItem(false);
draftReady = true;
document.querySelector(".app").addEventListener("input", (event) => {
  if (event.target.matches("input, select, textarea") && event.target.id !== "copy-text") saveDraft();
});
document.querySelector(".app").addEventListener("change", (event) => {
  if (event.target.matches("input, select, textarea") && event.target.id !== "copy-text") saveDraft();
});

function clearCopyFeedback() {
  clearTimeout(copyTimer);
  document.querySelector("#copy-status").textContent = "";
  document.querySelector("#copy-fallback").hidden = true;
  document.querySelector("#copy-text").value = "";
}

document.querySelector("#new-estimate").addEventListener("click", () => {
  if (!window.confirm("Создать новую смету? Текущий черновик будет очищен.")) return;
  const current = draftFields.number.value.trim();
  const match = current.match(/(\d+)$/);
  const nextNumber = match
    ? current.slice(0, match.index) + (BigInt(match[1]) + 1n).toString().padStart(match[1].length, "0")
    : "1";
  draftReady = false;
  Object.values(draftFields).forEach((field) => { field.value = ""; });
  draftFields.number.value = nextNumber;
  draftFields.date.value = todayDate();
  discountInput.value = "0";
  vatInput.value = "0";
  currencyInput.value = "₸";
  items.replaceChildren();
  document.querySelectorAll(".print-value").forEach((value) => value.remove());
  document.querySelector("#print-heading").textContent = "";
  clearCopyFeedback();
  addItem();
  draftReady = true;
  saveDraft();
});

function buildShareText() {
  recalculate();
  const date = draftFields.date.value.split("-").reverse().join(".") || "____";
  const lines = [`Смета № ${draftFields.number.value.trim() || "____"} от ${date}`];
  if (draftFields.sender.value.trim()) lines.push(`От кого: ${draftFields.sender.value.trim()}`);
  if (draftFields.recipient.value.trim()) lines.push(`Для кого: ${draftFields.recipient.value.trim()}`);
  lines.push("");
  const quantityFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 20 });
  for (const row of items.rows) {
    const value = (key) => row.querySelector(`[data-field="${key}"]`).value;
    const quantity = quantityFormatter.format(parseNumber(value("quantity"))).replace(/[\u00a0\u202f]/g, " ");
    lines.push(`• ${value("name").trim() || "Без названия"} — ${quantity} ${value("unit")} × ${formatMoney(parseNumber(value("price")))} = ${row.querySelector('[data-field="amount"]').textContent}`);
  }
  lines.push("", `Сумма: ${document.querySelector("#subtotal").textContent}`);
  for (const [id, label] of [["discount", "Скидка"], ["discounted", "Сумма со скидкой"], ["vat", "НДС"]]) {
    if (!document.querySelector(`#${id}-row`).hidden) {
      lines.push(`${label}: ${document.querySelector(`#${id}-amount`).textContent}`);
    }
  }
  lines.push(`Итого к оплате: ${totalOutput.textContent}`);
  if (draftFields.comment.value.trim()) lines.push("", `Комментарий: ${draftFields.comment.value.trim()}`);
  return lines.join("\n");
}

document.querySelector("#copy-whatsapp").addEventListener("click", async () => {
  clearCopyFeedback();
  const text = buildShareText();
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(text);
    document.querySelector("#copy-status").textContent = "Скопировано ✓";
    copyTimer = setTimeout(() => { document.querySelector("#copy-status").textContent = ""; }, 2000);
  } catch {
    document.querySelector("#copy-fallback").hidden = false;
    const field = document.querySelector("#copy-text");
    field.value = text;
    field.focus();
    field.select();
  }
});

function preparePrint() {
  recalculate();
  // Текстовые копии переносят длинные значения, не меняя поля на экране.
  document.querySelectorAll(".print-value").forEach((value) => value.remove());
  document.querySelectorAll(".details-grid input, #items input, #items select, #comment").forEach((field) => {
    const value = document.createElement("span");
    value.className = "print-value";
    if (field.matches('[data-field="quantity"], [data-field="price"]')) {
      value.textContent = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 20 })
        .format(parseNumber(field.value)).replace(/[\u00a0\u202f]/g, " ");
    } else if (field.type === "date" && field.value) {
      value.textContent = field.value.split("-").reverse().join(".");
    } else {
      value.textContent = field.value;
    }
    field.after(value);
  });
  const number = document.querySelector('[name="estimate-number"]').value.trim() || "____";
  const date = document.querySelector("#estimate-date").value;
  document.querySelector("#print-heading").textContent = `Смета № ${number} от ${date ? date.split("-").reverse().join(".") : "____"}`;
}

window.addEventListener("beforeprint", preparePrint);
document.querySelector("#save-pdf").addEventListener("click", () => {
  preparePrint();
  window.print();
});
