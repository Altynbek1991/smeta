"use strict";

const items = document.querySelector("#items");
const template = document.querySelector("#item-template");
const totalOutput = document.querySelector("#total");
const discountInput = document.querySelector("#discount");
const vatInput = document.querySelector("#vat");
const currencyInput = document.querySelector("#currency");
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

function addItem(focus = true) {
  const row = template.content.firstElementChild.cloneNode(true);
  items.append(row);
  if (focus) row.querySelector('[data-field="name"]').focus();
  recalculate();
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
  if (nextRow) nextRow.querySelector('[data-field="name"]').focus();
  else document.querySelector("#add-item").focus();
});

const today = new Date();
document.querySelector("#estimate-date").value = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0"),
].join("-");
addItem(false);

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
