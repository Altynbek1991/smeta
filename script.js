"use strict";

const items = document.querySelector("#items");
const template = document.querySelector("#item-template");
const totalOutput = document.querySelector("#total");
const amountInWordsOutput = document.querySelector("#amount-in-words");
const discountInput = document.querySelector("#discount");
const vatInput = document.querySelector("#vat");
const currencyInput = document.querySelector("#currency");
const commentCurrencyInput = document.querySelector("#comment-currency");
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
let discountMode = "percent";
let commentCurrencyBase = null;
let referenceRates = null;
let referenceDate = null;
let referenceRequest = null;
let validationId = 0;
const digitSelector = '[name="estimate-number"], [data-field="quantity"], [data-field="price"], #discount, #vat';

function validateDigits(field) {
  const error = field.parentElement.querySelector(".field-error");
  const isEstimateNumber = field === draftFields.number;
  // Завершающий разделитель разрешён, чтобы можно было набрать 12,34 по символам.
  const pattern = isEstimateNumber ? /^\d*$/ : /^\d*(?:[.,]\d*)?$/;
  const invalid = !pattern.test(field.value);
  if (invalid) field.value = "";
  field.setAttribute("aria-invalid", String(invalid));
  error.textContent = invalid ? error.dataset.message : "";
  error.hidden = !invalid;
}

function setupDigitValidation(field, message) {
  const error = document.createElement("span");
  error.className = "field-error";
  error.id = `field-error-${++validationId}`;
  error.dataset.message = message;
  error.hidden = true;
  error.setAttribute("aria-live", "polite");
  field.setAttribute("aria-describedby", error.id);
  field.parentElement.append(error);
  validateDigits(field);
}

function normalizeDecimalField(field) {
  if (field !== draftFields.number && field.value !== "" && field.getAttribute("aria-invalid") !== "true") {
    field.value = parseNumber(field.value).toFixed(2).replace(".", ",");
  }
}

setupDigitValidation(draftFields.number, "Номер сметы можно применять только цифры");
setupDigitValidation(discountInput, "В скидке можно применять только цифры и одну точку или запятую");
setupDigitValidation(vatInput, "В НДС можно применять только цифры и одну точку или запятую");
// Проверяем до пересчёта и автосохранения, включая вставку текста.
for (const type of ["input", "change"]) {
  document.querySelector(".app").addEventListener(type, (event) => {
    if (event.target.matches(digitSelector)) {
      validateDigits(event.target);
      if (type === "change") {
        normalizeDecimalField(event.target);
        recalculate();
      }
    }
  }, true);
}
const moneyFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toCents(value) {
  if (!Number.isFinite(value) || value < 0) return 0;
  // Сдвиг десятичного разряда: 1,005 округляется до 1,01.
  const [digits, exponent = "0"] = String(value).split("e");
  const cents = Math.round(Number(`${digits}e${Number(exponent) + 2}`));
  return Number.isSafeInteger(cents) ? cents : 0;
}

function parseNumber(value) {
  const text = value.trim().replace(/[\u00a0\u202f]/g, " ");
  // Принимаем десятичную запятую и пробелы в группах тысяч.
  if (!/^(?:(?:\d+|\d{1,3}(?: \d{3})+)(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return 0;
  const number = Number(text.replace(/ /g, "").replace(",", "."));
  return toCents(number) / 100;
}

function formatMoney(value) {
  return `${moneyFormatter.format(value).replace(/[\u00a0\u202f]/g, " ")} ${currencyInput.value}`;
}

function amountInWords(value) {
  if (currencyInput.value !== "₸" || !Number.isFinite(value) || value <= 0 || value > 999999999) return "";
  const cents = toCents(value);
  const units = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];
  const parts = [];
  const whole = Math.floor(cents / 100);
  for (const [scale, forms, feminine] of [
    [1000000, ["миллион", "миллиона", "миллионов"], false],
    [1000, ["тысяча", "тысячи", "тысяч"], true],
    [1, null, false],
  ]) {
    const group = Math.floor(whole / scale) % 1000;
    if (!group) continue;
    const lastTwo = group % 100;
    const last = group % 10;
    if (group >= 100) parts.push(hundreds[Math.floor(group / 100)]);
    if (lastTwo >= 10 && lastTwo <= 19) {
      parts.push(teens[lastTwo - 10]);
    } else {
      if (lastTwo >= 20) parts.push(tens[Math.floor(lastTwo / 10)]);
      if (last) parts.push(feminine && last <= 2 ? ["", "одна", "две"][last] : units[last]);
    }
    if (forms) {
      const form = lastTwo >= 11 && lastTwo <= 14 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2;
      parts.push(forms[form]);
    }
  }
  if (!whole) parts.push("ноль");
  parts.push("тенге");
  // Сохраняем дробную часть итога, если расчёт содержит тиыны.
  if (cents % 100) parts.push(String(cents % 100).padStart(2, "0"), "тиын");
  const text = parts.join(" ");
  return text[0].toUpperCase() + text.slice(1);
}

function updateDiscountMode() {
  const fixed = discountMode === "fixed";
  document.querySelector("#discount-mode").value = discountMode;
  document.querySelector("#discount-fixed-option").textContent = currencyInput.value;
  discountInput.setAttribute("aria-label", `Скидка, ${fixed ? currencyInput.value : "%"}`);
}

function updateCommentCurrencies() {
  const base = currencyInput.value;
  const available = ["₸", "₽", "$", "€"].filter((currency) => currency !== base);
  const previous = commentCurrencyInput.value;
  if (commentCurrencyBase !== base) {
    commentCurrencyInput.replaceChildren(...available.map((currency) => {
      const option = document.createElement("option");
      option.value = currency;
      option.textContent = currency;
      return option;
    }));
    commentCurrencyBase = base;
  }
  commentCurrencyInput.value = available.includes(previous) ? previous : available.includes("$") ? "$" : available[0];
}

function recalculate() {
  let subtotal = 0;
  for (const row of items.rows) {
    const quantity = parseNumber(row.querySelector('[data-field="quantity"]').value);
    const price = parseNumber(row.querySelector('[data-field="price"]').value);
    const amount = toCents(quantity * price);
    // Не допускаем бесконечность и потерю точности при чрезмерных числах.
    const safeAmount = Number.isSafeInteger(amount) ? amount : 0;
    row.querySelector('[data-field="amount"]').textContent = formatMoney(safeAmount / 100);
    subtotal += safeAmount;
  }
  if (!Number.isSafeInteger(subtotal)) subtotal = 0;
  const discountValue = parseNumber(discountInput.value);
  const discount = discountMode === "fixed"
    ? Math.min(subtotal, toCents(discountValue))
    : Math.round(subtotal * (Math.min(100, discountValue) / 100));
  const discounted = subtotal - discount;
  const vat = Math.round(discounted * (parseNumber(vatInput.value) / 100));
  const safeVat = Number.isSafeInteger(vat) ? vat : 0;
  document.querySelector("#subtotal").textContent = formatMoney(subtotal / 100);
  for (const [id, amount] of [["discount", discount], ["discounted", discounted], ["vat", safeVat]]) {
    document.querySelector(`#${id}-amount`).textContent = formatMoney(amount / 100);
    document.querySelector(`#${id}-row`).hidden = amount === 0;
  }
  const total = discounted + safeVat;
  totalOutput.textContent = formatMoney(Number.isSafeInteger(total) ? total / 100 : 0);
  const words = amountInWords(Number.isSafeInteger(total) ? total / 100 : 0);
  amountInWordsOutput.textContent = words ? `Сумма прописью: ${words}` : "";
  amountInWordsOutput.hidden = !words;
  document.querySelectorAll("[data-currency]").forEach((label) => {
    label.textContent = currencyInput.value;
  });
  updateDiscountMode();
  updateCommentCurrencies();
  return Number.isSafeInteger(total) ? total / 100 : 0;
}

function addItem(focus = true, data = null) {
  const row = template.content.firstElementChild.cloneNode(true);
  if (data) {
    for (const key of ["name", "quantity", "unit", "price"]) {
      row.querySelector(`[data-field="${key}"]`).value = data[key];
    }
  }
  setupDigitValidation(row.querySelector('[data-field="quantity"]'), "В количестве можно применять только цифры и одну точку или запятую");
  setupDigitValidation(row.querySelector('[data-field="price"]'), "В цене можно применять только цифры и одну точку или запятую");
  if (data) {
    normalizeDecimalField(row.querySelector('[data-field="quantity"]'));
    normalizeDecimalField(row.querySelector('[data-field="price"]'));
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
for (const type of ["input", "change"]) {
  document.querySelector("#discount-mode").addEventListener(type, (event) => {
    discountMode = event.target.value === "fixed" ? "fixed" : "percent";
    recalculate();
    saveDraft();
  });
}
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
    discountMode,
    commentCurrency: commentCurrencyInput.value,
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

function cleanLegacyComment(value) {
  const generatedLine = /^На \d{2}\.\d{2}\.\d{4} сумма в (?:тенге|российских рублях|долларах США|евро) выходит [\d .,\u00a0\u202f]+ [₸₽$€] по курсу [^\r\n]+ на \d{2}\.\d{2}\.\d{4}\.$/;
  return value.split(/\r?\n/).filter((line) => !generatedLine.test(line)).join("\n");
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
    // Старые черновики без режима скидки по-прежнему используют проценты.
    discountMode = data.discountMode === "fixed" ? "fixed" : "percent";
    commentCurrencyInput.value = ["₸", "₽", "$", "€"].includes(data.commentCurrency) ? data.commentCurrency : "$";
    for (const [key, field] of Object.entries(draftFields)) {
      field.value = key === "comment" ? cleanLegacyComment(data.fields[key]) : data.fields[key];
    }
    validateDigits(draftFields.number);
    validateDigits(discountInput);
    validateDigits(vatInput);
    normalizeDecimalField(discountInput);
    normalizeDecimalField(vatInput);
    data.items.forEach((row) => addItem(false, row));
    recalculate();
    return true;
  } catch {
    document.querySelector("#draft-status").textContent = "Не удалось восстановить черновик. Проверьте доступ к хранилищу браузера.";
    return false;
  }
}

draftFields.date.value = todayDate();
const restoredDraft = restoreDraft();
if (!restoredDraft) addItem(false);
draftReady = true;
if (restoredDraft) saveDraft();
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
  validateDigits(draftFields.number);
  draftFields.date.value = todayDate();
  discountInput.value = "0";
  discountMode = "percent";
  vatInput.value = "16";
  validateDigits(discountInput);
  validateDigits(vatInput);
  currencyInput.value = "₸";
  commentCurrencyInput.value = "$";
  document.querySelector("#comment-status").textContent = "";
  items.replaceChildren();
  document.querySelectorAll(".print-value").forEach((value) => value.remove());
  document.querySelector("#print-heading").textContent = "";
  clearCopyFeedback();
  addItem();
  draftReady = true;
  saveDraft();
});

function loadReferenceRates() {
  if (referenceRequest) return referenceRequest;
  referenceRequest = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      // Публичный источник; содержимое сметы не передаётся.
      const response = await fetch("https://back.halykbank.kz/common/currency-history", {
        mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal,
      });
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json();
      const history = data?.data?.currencyHistory;
      if (data?.result !== true || !history || typeof history !== "object") throw new Error("Invalid response");
      const records = Object.values(history).filter((record) => record && /^\d{4}-\d{2}-\d{2}$/.test(record.date));
      records.sort((a, b) => b.date.localeCompare(a.date));
      const latest = records[0];
      if (!latest) throw new Error("Empty response");
      const [year, month, day] = latest.date.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error("Invalid date");
      const rates = { "₸": 1 };
      for (const [code, symbol] of Object.entries({ USD: "$", EUR: "€", RUB: "₽" })) {
        const value = latest.privatePersons?.[`${code}/KZT`]?.sell;
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error("Invalid value");
        rates[symbol] = value;
      }
      referenceRates = rates;
      referenceDate = latest.date.split("-").reverse().join(".");
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
      referenceRequest = null;
    }
  })();
  return referenceRequest;
}

function replaceConversionComment(value, replacement) {
  const generatedLine = /^На \d{2}\.\d{2}\.\d{4} сумма в (?:тенге|российских рублях|долларах США|евро) составляет [\d .,\u00a0\u202f]+ [₸₽$€](?: \(данные от \d{2}\.\d{2}\.\d{4}\))?\.$/;
  let replaced = false;
  const lines = [];
  for (const line of value.split("\n")) {
    if (generatedLine.test(line.replace(/\r$/, ""))) {
      if (!replaced) lines.push(replacement + (line.endsWith("\r") ? "\r" : ""));
      replaced = true;
    } else {
      lines.push(line);
    }
  }
  if (replaced) return lines.join("\n");
  return `${value}${value && !value.endsWith("\n") ? "\n" : ""}${replacement}`;
}

document.querySelector("#convert-comment").addEventListener("click", async () => {
  const from = currencyInput.value;
  const to = commentCurrencyInput.value;
  const status = document.querySelector("#comment-status");
  if (from === to) {
    status.textContent = "";
    return;
  }
  const button = document.querySelector("#convert-comment");
  button.disabled = true;
  status.textContent = "";
  try {
    if (from !== to && !referenceRates) {
      status.textContent = "Подготовка пересчёта…";
      if (!await loadReferenceRates()) {
        status.textContent = "Не удалось выполнить пересчёт. Проверьте интернет и попробуйте снова.";
        return;
      }
    }
    if (from !== currencyInput.value || to !== commentCurrencyInput.value) {
      status.textContent = "Валюта изменилась. Нажмите кнопку ещё раз.";
      return;
    }
    const converted = recalculate() * (from === to ? 1 : referenceRates[from] / referenceRates[to]);
    if (!Number.isFinite(converted) || converted > Number.MAX_SAFE_INTEGER / 100) {
      status.textContent = "Слишком большая сумма для пересчёта.";
      return;
    }
    const names = { "₸": "тенге", "₽": "российских рублях", "$": "долларах США", "€": "евро" };
    const today = todayDate().split("-").reverse().join(".");
    const amount = moneyFormatter.format(toCents(converted) / 100).replace(/[\u00a0\u202f]/g, " ");
    const line = `На ${today} сумма в ${names[to]} составляет ${amount} ${to}${from !== to ? ` (данные от ${referenceDate})` : ""}.`;
    const comment = draftFields.comment;
    comment.value = replaceConversionComment(comment.value, line);
    status.textContent = "";
    comment.focus();
    saveDraft();
  } finally {
    button.disabled = false;
  }
});

function buildShareText() {
  recalculate();
  const date = draftFields.date.value.split("-").reverse().join(".") || "____";
  const lines = [`Смета № ${draftFields.number.value.trim() || "____"} от ${date}`];
  if (draftFields.sender.value.trim()) lines.push(`От кого: ${draftFields.sender.value.trim()}`);
  if (draftFields.recipient.value.trim()) lines.push(`Для кого: ${draftFields.recipient.value.trim()}`);
  lines.push("");
  const quantityFormatter = moneyFormatter;
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
  if (!amountInWordsOutput.hidden) lines.push(amountInWordsOutput.textContent);
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
      value.textContent = moneyFormatter.format(parseNumber(field.value)).replace(/[\u00a0\u202f]/g, " ");
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

loadReferenceRates();


